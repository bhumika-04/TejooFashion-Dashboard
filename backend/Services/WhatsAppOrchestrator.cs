using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Repositories;
using TejooWhatsApp.AI;
using Newtonsoft.Json;
using System.Text;

namespace TejooWhatsApp.Services;

public class WhatsAppOrchestrator
{
    private readonly WhatsAppSessionRepository _sessionRepo;
    private readonly ConversationService _conversationService;
    private readonly MessageService _messageService;
    private readonly EscalationService _escalationService;
    private readonly AiRouterService _aiRouter;
    private readonly WebhookLogRepository _webhookLogRepo;
    private readonly MessageRepository _messageRepo;
    private readonly NotificationService _notificationService;
    private readonly HttpClient _httpClient;
    private readonly ILogger<WhatsAppOrchestrator> _logger;
    private readonly SystemSettingsRepository _settings;
    private readonly AiBypassRepository _bypassRepo;
    private readonly string _interaktBaseUrl;
    private readonly string _metaGraphBaseUrl;
    private readonly string _publicBaseUrl; // ngrok/public URL for media files

    public WhatsAppOrchestrator(
        WhatsAppSessionRepository sessionRepo,
        ConversationService conversationService,
        MessageService messageService,
        EscalationService escalationService,
        AiRouterService aiRouter,
        WebhookLogRepository webhookLogRepo,
        MessageRepository messageRepo,
        NotificationService notificationService,
        IHttpClientFactory httpClientFactory,
        ILogger<WhatsAppOrchestrator> logger,
        SystemSettingsRepository settings,
        IConfiguration configuration,
        AiBypassRepository bypassRepo)
    {
        _sessionRepo = sessionRepo;
        _conversationService = conversationService;
        _messageService = messageService;
        _escalationService = escalationService;
        _aiRouter = aiRouter;
        _webhookLogRepo = webhookLogRepo;
        _messageRepo = messageRepo;
        _notificationService = notificationService;
        _httpClient = httpClientFactory.CreateClient();
        _logger = logger;
        _settings = settings;
        _bypassRepo = bypassRepo;
        _interaktBaseUrl = configuration["ExternalApis:InteraktBaseUrl"] ?? "https://api.interakt.ai";
        _metaGraphBaseUrl = configuration["ExternalApis:MetaGraphBaseUrl"] ?? "https://graph.facebook.com";
        _publicBaseUrl = (configuration["ExternalApis:PublicBaseUrl"] ?? "").TrimEnd('/');
    }

    public async Task<bool> ProcessIncomingMessageAsync(
        string provider,
        string businessPhone,
        string customerPhone,
        string messageContent,
        string? customerName = null,
        string messageType = "text",
        string? mediaUrl = null,
        string? providerMessageId = null)
    {
        try
        {
            _logger.LogDebug("ProcessIncomingMessage - Provider: {Provider}, BusinessPhone: {BusinessPhone}, CustomerPhone: {CustomerPhone}", provider, businessPhone, customerPhone);

            // 1. Resolve session by business phone number (or get first active session for this provider)
            WhatsAppSession? session = null;

            if (!string.IsNullOrEmpty(businessPhone))
            {
                session = await _sessionRepo.GetByPhoneNumberAsync(businessPhone);
                _logger.LogDebug("Session lookup by phone {Phone}: {Result}", businessPhone, session == null ? "NULL" : $"Found ID={session.Id}");
            }

            // Fallback: For Interakt with single number, get the first active session
            if (session == null && provider.Equals("Interakt", StringComparison.OrdinalIgnoreCase))
            {
                session = await _sessionRepo.GetFirstActiveByProviderAsync("Interakt");
                _logger.LogDebug("Fallback to first active Interakt session: {Result}", session == null ? "NULL" : $"Found ID={session.Id}, Phone={session.PhoneNumber}");
            }

            if (session == null || !session.IsActive)
            {
                await LogWebhookAsync(provider, $"Session not found or inactive for provider {provider}", false);
                return false;
            }

            // 2. Get or create conversation
            // 2a. Idempotency — skip if this provider message was already processed
            if (!string.IsNullOrEmpty(providerMessageId))
            {
                var isDuplicate = await _messageRepo.ExistsByProviderMessageIdAsync(providerMessageId);
                if (isDuplicate)
                {
                    _logger.LogInformation("Duplicate webhook ignored — providerMessageId {Id} already processed", providerMessageId);
                    return true;
                }
            }

            var conversation = await _conversationService.GetOrCreateConversationAsync(
                session.Id, customerPhone, customerName);

            if (conversation == null)
            {
                await LogWebhookAsync(provider, "Failed to create conversation", false);
                return false;
            }

            // 3. Save incoming message
            // Media URL from Interakt is a CDN URL with 5-year expiry — store directly, no download needed
            await _messageService.SaveInboundMessageAsync(
                conversation.Id,
                messageContent,
                messageType,
                mediaUrl,
                providerMessageId);

            // 3a. Push real-time notification — assigned user or broadcast to all
            {
                var preview = messageContent.Length > 60 ? messageContent[..60] + "…" : messageContent;
                if (conversation.AssignedUserId > 0)
                {
                    await _notificationService.NotifyNewMessageAsync(
                        conversation.AssignedUserId,
                        conversation.Id,
                        customerPhone,
                        customerName ?? customerPhone,
                        preview);
                }
                else
                {
                    // No assignee — broadcast so all agents see the unattended conversation
                    await _notificationService.SendToAllAsync(new NotificationMessage
                    {
                        Type = "new_message",
                        Title = "New unassigned message",
                        ConversationId = conversation.Id,
                        CustomerPhone = customerPhone,
                        CustomerName = customerName ?? customerPhone,
                        Message = preview,
                        Timestamp = DateTime.UtcNow
                    });
                }
            }

            // 3b. Media messages (image/video/audio/document) — acknowledge and route to human
            if (messageType != "text" && session.AutoReplyEnabled)
            {
                var ackText = messageType switch
                {
                    "image"    => "Thank you for sharing the image! Our team will review it and get back to you shortly. Could you also tell us what product you are looking for?",
                    "video"    => "Thank you for sharing the video! Our team will review it. Could you tell us what you need?",
                    "audio"    => "Thank you for your voice message! Our team will listen to it and respond shortly.",
                    "document" => "Thank you for sharing the document! Our team will review it and respond shortly.",
                    _          => "Thank you for sharing! Our team will review and respond shortly.",
                };

                await _messageService.SaveOutboundMessageAsync(
                    conversation.Id, ackText, isAiGenerated: true);

                await SendWhatsAppMessageAsync(session, customerPhone, ackText, provider);

                var nextUser = await _escalationService.GetNextEscalationUserAsync(conversation.AssignedUserId);
                if (nextUser != null)
                {
                    await _escalationService.CreateEscalationAsync(
                        conversation.Id, nextUser.Id, null,
                        $"Media message received ({messageType}) — needs human review", "Normal");
                }

                await LogWebhookAsync(provider, $"Media message ({messageType}) acknowledged and routed to agent.", true);
                return true;
            }

            // 4. Check if AI auto-reply is enabled
            if (!session.AutoReplyEnabled)
            {
                await LogWebhookAsync(provider, "Message saved. Auto-reply disabled.", true);
                return true;
            }

            // 4b. Check AI bypass list — internal team numbers and opted-out customers
            if (await _bypassRepo.IsActiveBypassAsync(customerPhone))
            {
                _logger.LogInformation("AI bypass active for {Phone} — message saved, no auto-reply.", customerPhone);
                await LogWebhookAsync(provider, $"Message saved. {customerPhone} is on AI bypass list.", true);
                return true;
            }

            // 4a. Check business hours — skip AI reply outside configured window
            if (!await IsWithinBusinessHoursAsync())
            {
                _logger.LogDebug("Outside business hours — skipping AI auto-reply for conversation {Id}.", conversation.Id);
                await LogWebhookAsync(provider, "Message saved. Outside business hours.", true);
                return true;
            }

            // 5. Get conversation context (recent messages)
            var recentMessages = await _messageService.GetRecentMessagesForContextAsync(conversation.Id, 10);

            // 6. Process through AI router (with timeout handled inside OpenAiClient)
            AiProcessingResult aiResponse;
            try
            {
                aiResponse = await _aiRouter.ProcessMessageAsync(messageContent, recentMessages);
            }
            catch (Exception aiEx)
            {
                _logger.LogWarning("AI processing failed: {Error}. Sending ack + escalating to agent.", aiEx.Message);

                // Acknowledge the customer so they know someone will respond
                const string ackMsg = "Thank you for your message! Our team will get back to you shortly.";
                await _messageService.SaveOutboundMessageAsync(conversation.Id, ackMsg, isAiGenerated: false);
                try { await SendWhatsAppMessageAsync(session, customerPhone, ackMsg, provider); } catch { /* best effort */ }

                var fallbackUser = await _escalationService.GetNextEscalationUserAsync(conversation.AssignedUserId);
                if (fallbackUser != null)
                {
                    await _escalationService.CreateEscalationAsync(
                        conversation.Id, fallbackUser.Id, null,
                        "AI unavailable — requires human review", "Normal");
                }
                else
                {
                    _logger.LogError("AI failed AND no escalation agent found for conversation {Id}", conversation.Id);
                }
                await LogWebhookAsync(provider, $"AI failed, ack sent, escalated: {aiEx.Message}", true);
                return true;
            }

            // 7. Check if escalation is needed
            if (aiResponse.ShouldEscalate || (aiResponse.Confidence.HasValue && aiResponse.Confidence < 0.5m))
            {
                // Escalate to CRR
                var nextUser = await _escalationService.GetNextEscalationUserAsync(conversation.AssignedUserId);
                if (nextUser != null)
                {
                    var escalationReason = aiResponse.Intent ?? "Low confidence or escalation requested";
                    await _escalationService.CreateEscalationAsync(
                        conversation.Id,
                        nextUser.Id,
                        null,
                        escalationReason,
                        "Normal");
                }
                return true;
            }

            // 8. Increment session message counter
            await _sessionRepo.IncrementMessagesTodayAsync(session.Id);

            // 9. Send AI response
            if (!string.IsNullOrEmpty(aiResponse.ResponseText))
            {
                // Save outbound AI message
                var outboundMessage = await _messageService.SaveOutboundMessageAsync(
                    conversation.Id,
                    aiResponse.ResponseText,
                    isAiGenerated: true,
                    intent: aiResponse.Intent,
                    confidence: aiResponse.Confidence);

                // Send via provider API — returns provider message ID
                var providerMsgId = await SendWhatsAppMessageAsync(session, customerPhone, aiResponse.ResponseText, provider);

                // Persist DeliveredAt + ProviderMessageId to DB (only when provider returned a real ID)
                if (!string.IsNullOrEmpty(providerMsgId))
                    await _messageRepo.UpdateDeliveryAsync(outboundMessage.Id, providerMsgId);
                else
                    _logger.LogWarning("Provider returned no message ID for outbound message {MessageId}", outboundMessage.Id);
            }

            await LogWebhookAsync(provider, "Message processed successfully", true);
            return true;
        }
        catch (Exception ex)
        {
            await LogWebhookAsync(provider, $"Error: {ex.Message}", false);
            return false;
        }
    }

    public async Task<bool> SendManualMessageAsync(int conversationId, string content, string messageType = "text", string? mediaUrl = null)
    {
        try
        {
            var conversation = await _conversationService.GetConversationDetailAsync(conversationId);
            if (conversation == null) return false;

            var session = await _sessionRepo.GetByIdAsync(conversation.SessionId);
            if (session == null) return false;

            // Convert relative local URL to fully-qualified public URL so Interakt/Meta can download the media
            // e.g. /uploads/conversations/1/file.jpg → https://ngrok-url/uploads/conversations/1/file.jpg
            var publicMediaUrl = mediaUrl;
            if (!string.IsNullOrEmpty(mediaUrl) && mediaUrl.StartsWith('/') && !string.IsNullOrEmpty(_publicBaseUrl))
                publicMediaUrl = _publicBaseUrl + mediaUrl;

            // Save outbound message (store local/original URL in DB)
            var message = await _messageService.SaveOutboundMessageAsync(
                conversationId,
                content,
                isAiGenerated: false,
                messageType: messageType,
                mediaUrl: mediaUrl);

            // Send via provider API using PUBLIC URL so Interakt/Meta can fetch the file
            var providerMsgId = await SendWhatsAppMessageAsync(session, conversation.CustomerPhone, content, session.Provider, messageType, publicMediaUrl);
            if (!string.IsNullOrEmpty(providerMsgId))
                await _messageRepo.UpdateDeliveryAsync(message.Id, providerMsgId);
            else
                _logger.LogWarning("Provider returned no message ID for manual message {MessageId}", message.Id);
            await _sessionRepo.IncrementMessagesTodayAsync(session.Id);

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SendManualMessageAsync failed for conversationId {ConversationId}", conversationId);
            return false;
        }
    }

    private async Task<string?> SendWhatsAppMessageAsync(
        WhatsAppSession session, string to, string message, string provider,
        string messageType = "text", string? mediaUrl = null)
    {
        if (provider.Equals("Interakt", StringComparison.OrdinalIgnoreCase))
            return await SendViaInteraktAsync(session, to, message, messageType, mediaUrl);
        if (provider.Equals("Meta", StringComparison.OrdinalIgnoreCase))
            return await SendViaMetaAsync(session, to, message, messageType, mediaUrl);
        return null;
    }

    private async Task<string?> SendViaInteraktAsync(
        WhatsAppSession session, string to, string message,
        string messageType = "text", string? mediaUrl = null)
    {
        var url = $"{_interaktBaseUrl}/v1/public/message/";

        var digits = to.TrimStart('+');
        if (digits.Length < 3)
            throw new InvalidOperationException($"Cannot parse phone number for Interakt: '{to}'");

        var countryCodeDigits = digits.Length >= 12 ? 2 : 1;
        var countryCode = "+" + digits[..countryCodeDigits];
        var phoneNumber = digits[countryCodeDigits..];

        // Map messageType to Interakt type string + data shape
        object data;
        string interaktType;
        switch (messageType)
        {
            case "image":
                interaktType = "Image";
                data = new { message, mediaUrl };
                break;
            case "video":
                interaktType = "Video";
                data = new { message, mediaUrl };
                break;
            case "audio":
                interaktType = "Audio";
                data = new { mediaUrl };
                break;
            case "document":
                interaktType = "Document";
                data = new { message, mediaUrl };
                break;
            default:
                interaktType = "Text";
                data = new { message };
                break;
        }

        var payload = new { countryCode, phoneNumber, type = interaktType, data };

        var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.Add("Authorization", $"Basic {session.InteraktApiKey}");
        request.Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var response = await _httpClient.SendAsync(request, cts.Token);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync();
            throw new Exception($"Interakt send failed ({response.StatusCode}): {body}");
        }

        var responseBody = await response.Content.ReadAsStringAsync();
        var result = JsonConvert.DeserializeObject<dynamic>(responseBody);
        return result?.id?.ToString();
    }

    private async Task<string?> SendViaMetaAsync(
        WhatsAppSession session, string to, string message,
        string messageType = "text", string? mediaUrl = null)
    {
        var url = $"{_metaGraphBaseUrl}/v21.0/{session.MetaPhoneNumberId}/messages";

        // Build payload based on message type
        object payload = messageType switch
        {
            "image"    => new { messaging_product = "whatsapp", to, type = "image",
                                image    = new { link = mediaUrl, caption = message } },
            "video"    => new { messaging_product = "whatsapp", to, type = "video",
                                video    = new { link = mediaUrl, caption = message } },
            "audio"    => new { messaging_product = "whatsapp", to, type = "audio",
                                audio    = new { link = mediaUrl } },
            "document" => new { messaging_product = "whatsapp", to, type = "document",
                                document = new { link = mediaUrl, caption = message, filename = Path.GetFileName(mediaUrl ?? "file") } },
            _          => new { messaging_product = "whatsapp", to, type = "text",
                                text     = new { body = message } },
        };

        var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.Add("Authorization", $"Bearer {session.MetaAccessToken}");
        request.Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var response = await _httpClient.SendAsync(request, cts.Token);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync();
            throw new Exception($"Meta send failed ({response.StatusCode}): {body}");
        }

        var responseBody = await response.Content.ReadAsStringAsync();
        var result = JsonConvert.DeserializeObject<dynamic>(responseBody);
        return result?.messages?[0]?.id?.ToString();
    }

    private async Task<bool> IsWithinBusinessHoursAsync()
    {
        var enabled = await _settings.GetAsync("businessHours.enabled");
        if (enabled != "true") return true;   // feature off → always within hours

        var startStr   = await _settings.GetAsync("businessHours.start")    ?? "09:00";
        var endStr     = await _settings.GetAsync("businessHours.end")      ?? "18:00";
        var tzId       = await _settings.GetAsync("businessHours.timezone") ?? "Asia/Kolkata";

        TimeZoneInfo tz;
        try   { tz = TimeZoneInfo.FindSystemTimeZoneById(tzId); }
        catch { tz = TimeZoneInfo.Utc; }

        var localNow  = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
        var startTime = TimeOnly.TryParse(startStr, out var s) ? s : new TimeOnly(9, 0);
        var endTime   = TimeOnly.TryParse(endStr,   out var e) ? e : new TimeOnly(18, 0);
        var nowTime   = TimeOnly.FromDateTime(localNow);

        return nowTime >= startTime && nowTime <= endTime;
    }

    private async Task LogWebhookAsync(string provider, string message, bool success)
    {
        await _webhookLogRepo.CreateAsync(new WebhookLog
        {
            Provider = provider,
            Payload = message,
            ProcessedSuccessfully = success,
            ReceivedAt = DateTime.UtcNow
        });
    }
}
