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
    private readonly TagRepository _tagRepo;
    private readonly ConversationRepository _conversationRepo;
    private readonly AiSuggestionRepository _suggestionRepo;
    private readonly TejooWhatsApp.AI.OpenAiClient _openAiClient;
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
        AiBypassRepository bypassRepo,
        TagRepository tagRepo,
        ConversationRepository conversationRepo,
        AiSuggestionRepository suggestionRepo,
        TejooWhatsApp.AI.OpenAiClient openAiClient)
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
        _tagRepo = tagRepo;
        _conversationRepo = conversationRepo;
        _suggestionRepo = suggestionRepo;
        _openAiClient = openAiClient;
        _interaktBaseUrl = configuration["ExternalApis:InteraktBaseUrl"] ?? "https://api.interakt.ai";
        _metaGraphBaseUrl = configuration["ExternalApis:MetaGraphBaseUrl"] ?? "https://graph.facebook.com";
        _publicBaseUrl = (configuration["ExternalApis:PublicBaseUrl"] ?? "").TrimEnd('/');
    }

    /// <summary>
    /// On-demand AI draft for the copilot. Suggestions are normally created reactively as inbound
    /// messages arrive; this fills the gap when a CRR opens a chat that is awaiting a reply but has
    /// no stored draft (e.g. the message arrived before suggest-mode, or via a path that didn't
    /// generate one). Idempotent: returns the existing pending draft without spending tokens, and
    /// returns null when there's nothing to suggest — closed, we already replied, AI is off/bypassed
    /// for the number, or the last message is media with no readable text.
    /// </summary>
    public async Task<AiSuggestion?> GenerateSuggestionOnDemandAsync(int conversationId)
    {
        var conversation = await _conversationRepo.GetByIdAsync(conversationId);
        if (conversation == null || string.Equals(conversation.Status, "Closed", StringComparison.OrdinalIgnoreCase))
            return null;

        // Already have a draft ready — hand it back, don't regenerate (no OpenAI call).
        var existing = await _suggestionRepo.GetPendingAsync(conversationId);
        if (existing != null) return existing;

        // Respect the number's AI mode: only the copilot ('suggest', the default) drafts on demand.
        var session = await _sessionRepo.GetByIdAsync(conversation.SessionId);
        var aiMode = string.IsNullOrWhiteSpace(session?.AiMode) ? "suggest" : session!.AiMode.Trim().ToLowerInvariant();
        if (aiMode != "suggest") return null;

        // Only suggest when the customer spoke last (we're the ones who owe a reply).
        var recent = await _messageService.GetRecentMessagesForContextAsync(conversationId, 10);
        var last = recent.LastOrDefault();
        if (last == null || !string.Equals(last.Direction, "inbound", StringComparison.OrdinalIgnoreCase))
            return null;

        // Internal/opted-out numbers get no AI.
        if (await _bypassRepo.IsActiveBypassAsync(conversation.CustomerPhone))
            return null;

        // Resolve the text to answer: message text, else a voice transcript (transcribe if needed).
        var text = !string.IsNullOrWhiteSpace(last.Content) ? last.Content : last.Transcript;
        if (string.IsNullOrWhiteSpace(text)
            && (last.MessageType == "audio" || last.MessageType == "voice")
            && !string.IsNullOrEmpty(last.MediaUrl))
        {
            text = await TranscribeInboundAudioAsync(last.MediaUrl, last.Id);
        }
        if (string.IsNullOrWhiteSpace(text)) return null; // image/video/doc with no caption — manual

        var summary = await _conversationService.GetSummaryAsync(conversationId);

        AiProcessingResult ai;
        try
        {
            ai = await _aiRouter.ProcessMessageAsync(text, recent, summary?.SummaryText);
        }
        catch (Exception ex)
        {
            _logger.LogWarning("On-demand suggestion failed for conversation {Id}: {Error}", conversationId, ex.Message);
            return null;
        }

        if (string.IsNullOrWhiteSpace(ai.ResponseText)) return null;

        await _suggestionRepo.CreateSupersedingAsync(conversationId, last.Id, ai.ResponseText, ai.Intent, ai.Confidence);
        return await _suggestionRepo.GetPendingAsync(conversationId);
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
            var inboundMessage = await _messageService.SaveInboundMessageAsync(
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
                    // No assignee — live-broadcast to everyone, persist only to Admins (avoids a row
                    // per user on every message; see NotifyUnassignedMessageAsync).
                    await _notificationService.NotifyUnassignedMessageAsync(
                        conversation.Id, customerPhone, customerName ?? customerPhone, preview);
                }
            }

            // 3a-1. Internal team data-dump (TF#### reports / "CRR/Whatsapp Name" notes) — not a customer
            //       query. Skip AI entirely so it never gets an auto-reply.
            if (AiHeuristics.IsInternalReport(messageContent))
            {
                await LogWebhookAsync(provider, "Internal report message — saved, AI skipped.", true);
                return true;
            }

            // 3a-2. Fast negativity flag (keyword-based, free + instant) — raise priority so angry
            //       customers surface immediately. (Tagging is handled by AutoTagService against the
            //       admin-managed taxonomy — the single source of auto tags, so we don't tag here.)
            if (AiHeuristics.LooksNegative(messageContent))
                await _conversationRepo.UpdatePriorityAsync(conversation.Id, "High");

            // AI behaviour for this number: off | suggest | auto (default 'suggest').
            //   off     → capture only; a human handles everything.
            //   suggest → AI drafts a reply for the assigned CRR to Send/Edit/Dismiss (nothing auto-sent).
            //   auto    → AI sends directly (legacy path, gated by the confidence threshold).
            var aiMode = string.IsNullOrWhiteSpace(session.AiMode) ? "suggest" : session.AiMode.Trim().ToLowerInvariant();

            if (aiMode == "off")
            {
                await LogWebhookAsync(provider, "Message saved. AI mode = off.", true);
                return true;
            }

            // 3b. Non-text media.
            //   audio/voice     → transcribe (Whisper) and treat the transcript as the message text.
            //   image/video/doc → AI can't read them; leave for manual handling.
            var effectiveText = messageContent;
            if (messageType != "text")
            {
                if ((messageType == "audio" || messageType == "voice") && !string.IsNullOrEmpty(mediaUrl))
                {
                    var transcript = await TranscribeInboundAudioAsync(mediaUrl, inboundMessage?.Id);
                    if (string.IsNullOrWhiteSpace(transcript))
                    {
                        await LogWebhookAsync(provider, "Voice note could not be transcribed; left for manual handling.", true);
                        return true;
                    }
                    effectiveText = transcript;
                    _logger.LogInformation("Voice note transcribed for conversation {Id}: \"{Preview}\"",
                        conversation.Id, transcript.Length > 60 ? transcript[..60] + "…" : transcript);
                }
                else
                {
                    await LogWebhookAsync(provider, $"Message saved. {messageType} left for manual handling.", true);
                    return true;
                }
            }

            // 4b. Check AI bypass list — internal team numbers and opted-out customers
            if (await _bypassRepo.IsActiveBypassAsync(customerPhone))
            {
                _logger.LogInformation("AI bypass active for {Phone} — message saved, no auto-reply.", customerPhone);
                await LogWebhookAsync(provider, $"Message saved. {customerPhone} is on AI bypass list.", true);
                return true;
            }

            // 4a. Business hours gate applies to AUTO send only; in suggest mode we still draft a
            //     reply so it's ready for the CRR when they return.
            if (aiMode == "auto" && !await IsWithinBusinessHoursAsync())
            {
                _logger.LogDebug("Outside business hours — skipping AI auto-reply for conversation {Id}.", conversation.Id);
                await LogWebhookAsync(provider, "Message saved. Outside business hours.", true);
                return true;
            }

            // 5. Get conversation context (recent messages + the running summary for long-term memory)
            var recentMessages = await _messageService.GetRecentMessagesForContextAsync(conversation.Id, 10);
            var convSummary = await _conversationService.GetSummaryAsync(conversation.Id);

            // 6. Process through AI router (with timeout handled inside OpenAiClient)
            AiProcessingResult aiResponse;
            try
            {
                aiResponse = await _aiRouter.ProcessMessageAsync(effectiveText, recentMessages, convSummary?.SummaryText);
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
                        "AI unavailable — requires human review", "Normal",
                        escalationLevel: EscalationService.LevelForRole(fallbackUser.Role));
                }
                else
                {
                    _logger.LogError("AI failed AND no escalation agent found for conversation {Id}", conversation.Id);
                }
                await LogWebhookAsync(provider, $"AI failed, ack sent, escalated: {aiEx.Message}", true);
                return true;
            }

            // 6b. Conversation tagging is handled by AutoTagService (admin taxonomy), not here.

            // 6c. SUGGEST mode: store the AI draft for the assigned CRR to Send/Edit/Dismiss.
            //     Nothing is sent to the customer, and escalation is left to rules + SLA timers
            //     (no confidence-based auto-escalation here).
            if (aiMode == "suggest")
            {
                if (!string.IsNullOrWhiteSpace(aiResponse.ResponseText))
                {
                    await _suggestionRepo.CreateSupersedingAsync(
                        conversation.Id, null, aiResponse.ResponseText, aiResponse.Intent, aiResponse.Confidence);
                    await LogWebhookAsync(provider, "AI draft prepared for CRR review (suggest mode).", true);
                }
                else
                {
                    await LogWebhookAsync(provider, "AI produced no draft; left for manual handling.", true);
                }
                return true;
            }

            // 7. Check if escalation is needed — honour the admin-configured Escalation Policy
            //    (escalation.mode + escalation.confidenceThreshold from the Escalations page),
            //    instead of a hardcoded 50%.
            var escMode = (await _settings.GetAsync("escalation.mode")) ?? "auto";
            var thresholdPct = int.TryParse(await _settings.GetAsync("escalation.confidenceThreshold"), out var tp) ? tp : 50;
            var confidenceThreshold = thresholdPct / 100m;
            // 'manual' mode: AI never auto-escalates on low confidence (humans trigger it);
            // 'auto'/'hybrid': escalate when confidence is below the threshold.
            // An explicit AI escalation request (ShouldEscalate) is always honoured.
            var lowConfidence = aiResponse.Confidence.HasValue && aiResponse.Confidence < confidenceThreshold;
            if (aiResponse.ShouldEscalate || (escMode != "manual" && lowConfidence))
            {
                // Acknowledge the customer so they aren't left in silence while a human picks this up.
                const string escalateAck = "Thank you for your message! Our team will look into this and get back to you shortly.";
                await _messageService.SaveOutboundMessageAsync(conversation.Id, escalateAck, isAiGenerated: false);
                try { await SendWhatsAppMessageAsync(session, customerPhone, escalateAck, provider); } catch { /* best effort */ }

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
                        "Normal",
                        escalationLevel: EscalationService.LevelForRole(nextUser.Role));
                }
                return true;
            }

            // 8. Increment session message counter
            await _sessionRepo.TouchLastActiveAsync(session.Id);

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

    public async Task<(bool Success, string? Error)> SendManualMessageAsync(int conversationId, string content, string messageType = "text", string? mediaUrl = null)
    {
        try
        {
            var conversation = await _conversationService.GetConversationDetailAsync(conversationId);
            if (conversation == null) return (false, "Conversation not found");

            var session = await _sessionRepo.GetByIdAsync(conversation.SessionId);
            if (session == null) return (false, "No WhatsApp session configured for this conversation");

            // Convert a locally-hosted media URL to a publicly reachable one so Interakt/Meta can download it.
            // Handles both relative ("/uploads/..") and absolute localhost ("http://localhost:5000/uploads/..") forms.
            var publicMediaUrl = ToPublicMediaUrl(mediaUrl);

            var isMedia = messageType is "image" or "video" or "audio" or "document";
            if (isMedia && !string.IsNullOrEmpty(mediaUrl))
            {
                if (string.IsNullOrEmpty(_publicBaseUrl))
                    _logger.LogWarning("Sending media but ExternalApis:PublicBaseUrl is not configured — Interakt/Meta cannot reach a localhost URL ({MediaUrl}).", mediaUrl);
                else if (IsLocalMediaUrl(publicMediaUrl))
                    _logger.LogWarning("Media URL still looks local after conversion ({MediaUrl}) — check PublicBaseUrl.", publicMediaUrl);
                else
                    _logger.LogInformation("Sending {Type} to {Phone} via public media URL {Url}", messageType, conversation.CustomerPhone, publicMediaUrl);
            }

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
            await _sessionRepo.TouchLastActiveAsync(session.Id);

            return (true, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SendManualMessageAsync failed for conversationId {ConversationId}", conversationId);
            return (false, FriendlySendError(ex.Message));
        }
    }

    /// <summary>Turns a raw provider/send exception into a short, agent-readable reason.</summary>
    private static string FriendlySendError(string raw)
    {
        // Extract the provider's JSON "message" field if the error embeds one
        var brace = raw.IndexOf('{');
        if (brace >= 0)
        {
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(raw[brace..]);
                if (doc.RootElement.TryGetProperty("message", out var m) && m.GetString() is { } msg)
                    raw = msg;
            }
            catch { /* not JSON — keep raw */ }
        }
        raw = raw.Replace("Please correct the following error - ", "").Trim();

        if (raw.Contains("24 hour", StringComparison.OrdinalIgnoreCase))
            return "WhatsApp 24-hour window is closed — this customer hasn't messaged in the last 24 hours, so a free-text reply can't be sent. Use an approved template, or wait for them to message again.";

        return string.IsNullOrWhiteSpace(raw) ? "Failed to send message" : raw;
    }

    /// <summary>Adds a conversation tag (creating it if needed). Best-effort — never breaks message processing.</summary>
    /// <summary>
    /// Converts a locally-hosted media URL (relative "/uploads/..." or an absolute
    /// http://localhost / 127.0.0.1 / [::1] URL) into a publicly reachable URL using the
    /// configured PublicBaseUrl, so Interakt/Meta can actually download the file.
    /// URLs that are already remote (e.g. Interakt CDN links when forwarding) are left untouched.
    /// </summary>
    /// <summary>Download an inbound voice note and transcribe it via Whisper; persists the transcript
    /// on the message so the CRR can read it. Returns null on any failure (caller falls back to manual).</summary>
    private async Task<string?> TranscribeInboundAudioAsync(string mediaUrl, int? messageId)
    {
        try
        {
            var url = mediaUrl.StartsWith("http", StringComparison.OrdinalIgnoreCase)
                ? mediaUrl
                : $"{_publicBaseUrl}{mediaUrl}";
            var bytes = await _httpClient.GetByteArrayAsync(url);

            var path = url.Split('?')[0];
            var dot = path.LastIndexOf('.');
            var ext = (dot > 0 && path.Length - dot <= 5) ? path[dot..] : ".ogg";

            var transcript = await _openAiClient.TranscribeAudioAsync(bytes, "audio" + ext);
            if (!string.IsNullOrWhiteSpace(transcript) && messageId.HasValue)
                await _messageRepo.SetTranscriptAsync(messageId.Value, transcript);
            return transcript;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Voice-note transcription failed for {Url}", mediaUrl);
            return null;
        }
    }

    private string? ToPublicMediaUrl(string? mediaUrl)
    {
        if (string.IsNullOrEmpty(mediaUrl) || string.IsNullOrEmpty(_publicBaseUrl))
            return mediaUrl;

        // Relative path → prefix the public base URL
        if (mediaUrl.StartsWith('/'))
            return _publicBaseUrl + mediaUrl;

        // Absolute localhost URL → swap the scheme+host for the public base URL, keep the path
        if (Uri.TryCreate(mediaUrl, UriKind.Absolute, out var uri) && IsLocalHost(uri.Host))
            return _publicBaseUrl + uri.PathAndQuery;

        // Already a public/remote URL (ngrok, CDN, etc.) — send as-is
        return mediaUrl;
    }

    private static bool IsLocalMediaUrl(string? mediaUrl) =>
        !string.IsNullOrEmpty(mediaUrl)
        && Uri.TryCreate(mediaUrl, UriKind.Absolute, out var uri)
        && IsLocalHost(uri.Host);

    private static bool IsLocalHost(string host) =>
        host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
        || host == "127.0.0.1"
        || host == "::1";

    // 3-digit calling codes that a naive "length >= 12 ? 2 : 1" split would wrongly read as 2 digits
    // (e.g. UAE 971 → "+97"). Covers the Gulf + South-Asia markets alongside India (+91).
    private static readonly string[] _threeDigitCallingCodes =
        { "971", "966", "968", "973", "974", "965", "880", "977", "975", "960", "998", "995" };

    /// <summary>
    /// Splits a full WhatsApp number into Interakt's (countryCode, phoneNumber) parts.
    /// Recognises known 3-digit codes first, then falls back to a length heuristic
    /// (12+ digits ⇒ 2-digit code like India +91, otherwise 1-digit like US +1).
    /// </summary>
    private static (string CountryCode, string PhoneNumber) SplitInteraktNumber(string to)
    {
        var digits = to.TrimStart('+').Trim();
        if (digits.Length < 3)
            throw new InvalidOperationException($"Cannot parse phone number for Interakt: '{to}'");

        foreach (var cc in _threeDigitCallingCodes)
            if (digits.StartsWith(cc, StringComparison.Ordinal) && digits.Length > cc.Length)
                return ("+" + cc, digits[cc.Length..]);

        var n = digits.Length >= 12 ? 2 : 1;
        return ("+" + digits[..n], digits[n..]);
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

        var (countryCode, phoneNumber) = SplitInteraktNumber(to);

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
