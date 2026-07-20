
using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Models.DTOs;
using TejooWhatsApp.Services;
using TejooWhatsApp.Repositories;
using TejooWhatsApp.Security;
using Newtonsoft.Json;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.AllowAnonymous]
[ApiController]
[Route("api/[controller]")]
public class WebhookController : ControllerBase
{
    private readonly MessageQueueService _messageQueue;
    private readonly WebhookLogRepository _webhookLogRepo;
    private readonly IConfiguration _configuration;
    private readonly ILogger<WebhookController> _logger;

    public WebhookController(
        MessageQueueService messageQueue,
        WebhookLogRepository webhookLogRepo,
        IConfiguration configuration,
        ILogger<WebhookController> logger)
    {
        _messageQueue = messageQueue;
        _webhookLogRepo = webhookLogRepo;
        _configuration = configuration;
        _logger = logger;
    }

    [HttpPost("interakt")]
    public async Task<IActionResult> InteraktWebhook(
        [FromQuery(Name = "sid")] int? sessionId = null,
        [FromHeader(Name = "X-Interakt-Signature")] string? hmacSignature = null,
        [FromHeader(Name = "X-Webhook-Secret")] string? webhookSecret = null)
    {
        // Read raw body for signature validation
        Request.EnableBuffering();
        using var reader = new StreamReader(Request.Body, leaveOpen: true);
        var rawBody = await reader.ReadToEndAsync();
        Request.Body.Position = 0;

        try
        {
            // 1. HMAC signature validation (if secret configured)
            var hmacSecret = _configuration["Webhook:InteraktHmacSecret"];
            if (!string.IsNullOrEmpty(hmacSecret))
            {
                if (string.IsNullOrEmpty(hmacSignature) ||
                    !WebhookSignatureValidator.ValidateInteraktSignature(rawBody, hmacSignature, hmacSecret))
                {
                    _logger.LogWarning("Interakt HMAC signature validation failed");
                    return Unauthorized(new { error = "Invalid HMAC signature" });
                }
            }

            // 2. Fallback simple shared-secret check
            var configuredSecret = _configuration["Webhook:InteraktSecret"];
            if (!string.IsNullOrEmpty(configuredSecret))
            {
                if (string.IsNullOrEmpty(webhookSecret) || webhookSecret != configuredSecret)
                {
                    _logger.LogWarning("Interakt webhook secret validation failed");
                    return Unauthorized(new { error = "Invalid webhook secret" });
                }
            }

            _logger.LogInformation("Interakt webhook received — Payload: {Payload}", rawBody);

            var data = JsonConvert.DeserializeObject<InteraktIncomingMessage>(rawBody);

            if (data == null)
            {
                _logger.LogWarning("Failed to deserialize Interakt webhook payload");
                return BadRequest("Invalid payload - deserialization failed");
            }

            // Coexistence echo (smb_message_echoes): a message the business team sent from the
            // WhatsApp mobile app — capture it as an OUTBOUND message so the dashboard shows the
            // full two-way thread. (API-sent messages arrive as message_api_* and are already stored.)
            if (string.Equals(data.Type, "message_echo", StringComparison.OrdinalIgnoreCase))
            {
                await CaptureEchoAsync(data, sessionId);
                return Ok(new { status = "echo_captured" });
            }

            // Only process incoming customer messages
            if (!string.Equals(data.Type, "message_received", StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogInformation("Ignoring non-customer webhook event: {Type}", data.Type);
                return Ok(new { status = "ignored", type = data.Type });
            }

            // customer.phone_number + country_code = customer's WhatsApp number
            var customerPhone = data.Data?.Customer?.Country_Code + data.Data?.Customer?.Phone_Number;
            // Extract customer name and profile picture from traits (provided by Interakt)
            var customerName   = data.Data?.Customer?.Traits?.Name;
            var customerAvatar = data.Data?.Customer?.Traits?.Profile_Picture;
            if (string.IsNullOrWhiteSpace(customerName)) customerName = null;

            // Interakt does not send the business phone in the webhook payload —
            // pass empty so the orchestrator uses its session fallback
            var businessPhone = string.Empty;
            var rawText     = data.Data?.Message?.Message ?? "";
            // Normalize Interakt type to our internal type
            var rawType = (data.Data?.Message?.Message_Content_Type ?? "text").ToLower();
            var messageType = rawType switch
            {
                "voice" => "audio",   // WhatsApp voice notes come as "Voice" in Interakt
                "sticker" => "image", // Stickers treated as images
                _ => rawType
            };

            // Clean up message text: normalize special payloads (contacts, reactions, revokes) to readable text.
            var (messageText, normalizedType) = NormalizeInteraktMessage(rawText, messageType);
            messageType = normalizedType;
            var mediaUrl      = data.Data?.Message?.Media_Url;
            var messageId     = data.Data?.Message?.Id;

            _logger.LogInformation(
                "Parsed Interakt message - Customer: {Customer} ({Name}), Type: {Type}, Message: {Message}",
                customerPhone, customerName ?? "unknown", messageType, messageText);

            if (string.IsNullOrEmpty(customerPhone))
            {
                _logger.LogWarning("Invalid Interakt webhook payload - missing customer phone");
                return BadRequest("Invalid payload - missing customer phone");
            }

            // If caller provided ?sid=N, resolve session phone for exact orchestrator match
            if (sessionId.HasValue)
            {
                var sessionRepo = HttpContext.RequestServices.GetRequiredService<WhatsAppSessionRepository>();
                var sess = await sessionRepo.GetByIdAsync(sessionId.Value);
                if (sess != null) businessPhone = sess.PhoneNumber;
                _logger.LogInformation("Webhook routed to session {SessionId} ({Phone}) via ?sid param", sessionId, businessPhone);
            }

            // Enqueue for background processing — returns immediately so Interakt doesn't timeout
            await _messageQueue.EnqueueAsync(
                provider:          "Interakt",
                businessPhone:     businessPhone,
                customerPhone:     customerPhone,
                messageContent:    messageText,
                customerName:      customerName,
                messageType:       messageType.ToLower(),
                mediaUrl:          mediaUrl,
                providerMessageId: messageId);

            return Ok(new { status = "queued" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing Interakt webhook");
            await _webhookLogRepo.CreateAsync(new Models.Entities.WebhookLog
            {
                Provider = "Interakt",
                Payload = rawBody,
                ErrorMessage = ex.Message,
                ProcessedSuccessfully = false,
                ReceivedAt = DateTime.UtcNow
            });

            return StatusCode(500, new { error = ex.Message });
        }
    }

    [HttpPost("meta")]
    public async Task<IActionResult> MetaWebhook(
        [FromHeader(Name = "X-Hub-Signature-256")] string? hubSignature = null)
    {
        // Read raw body for HMAC validation
        Request.EnableBuffering();
        using var reader = new StreamReader(Request.Body, leaveOpen: true);
        var rawBody = await reader.ReadToEndAsync();
        Request.Body.Position = 0;

        try
        {
            // HMAC signature validation
            var appSecret = _configuration["Webhook:MetaAppSecret"];
            if (!string.IsNullOrEmpty(appSecret))
            {
                if (string.IsNullOrEmpty(hubSignature) ||
                    !WebhookSignatureValidator.ValidateMetaSignature(rawBody, hubSignature, appSecret))
                {
                    _logger.LogWarning("Meta webhook HMAC signature validation failed");
                    return Unauthorized(new { error = "Invalid Meta signature" });
                }
            }

            var payload = JsonConvert.DeserializeObject<MetaWebhookPayload>(rawBody);

            if (payload?.Entry == null || !payload.Entry.Any())
            {
                return BadRequest("Invalid payload");
            }

            foreach (var entry in payload.Entry)
            {
                if (entry.Changes == null) continue;

                foreach (var change in entry.Changes)
                {
                    if (change.Value?.Messages == null) continue;

                    var businessPhone = change.Value.Metadata?.DisplayPhoneNumber;
                    if (string.IsNullOrEmpty(businessPhone)) continue;

                    foreach (var message in change.Value.Messages)
                    {
                        var customerPhone = message.From;
                        var messageContent = message.Text?.Body;

                        if (string.IsNullOrEmpty(customerPhone) || string.IsNullOrEmpty(messageContent))
                        {
                            _logger.LogWarning("Meta webhook: skipping message with missing phone or content — phone={Phone}, hasContent={HasContent}",
                                customerPhone ?? "(null)", !string.IsNullOrEmpty(messageContent));
                            continue;
                        }

                        var customerName = change.Value.Contacts?
                            .FirstOrDefault(c => c.Wa_id == customerPhone)?.Profile?.Name;

                        await _messageQueue.EnqueueAsync(
                            provider:          "Meta",
                            businessPhone:     businessPhone,
                            customerPhone:     customerPhone,
                            messageContent:    messageContent,
                            customerName:      customerName,
                            messageType:       message.Type ?? "text",
                            mediaUrl:          null,
                            providerMessageId: message.Id);
                    }
                }
            }

            return Ok(new { status = "queued" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing Meta webhook");
            await _webhookLogRepo.CreateAsync(new Models.Entities.WebhookLog
            {
                Provider = "Meta",
                Payload = rawBody,
                ErrorMessage = ex.Message,
                ProcessedSuccessfully = false,
                ReceivedAt = DateTime.UtcNow
            });

            return StatusCode(500, new { error = ex.Message });
        }
    }

    [HttpGet("meta")]
    public IActionResult MetaWebhookVerification(
        [FromQuery(Name = "hub.mode")] string mode,
        [FromQuery(Name = "hub.verify_token")] string verifyToken,
        [FromQuery(Name = "hub.challenge")] string challenge)
    {
        var configuredToken = _configuration["Webhook:MetaVerifyToken"];
        if (string.IsNullOrEmpty(configuredToken))
        {
            _logger.LogError("Webhook:MetaVerifyToken is not configured");
            return StatusCode(500, "Webhook verify token not configured");
        }

        if (mode == "subscribe" && verifyToken == configuredToken)
        {
            return Ok(challenge);
        }

        _logger.LogWarning("Meta webhook verification failed — token mismatch");
        return Forbid();
    }

    /// <summary>
    /// Captures a Coexistence "message_echo" — a message the business team sent from the WhatsApp
    /// mobile app — as an OUTBOUND message on the matching conversation. Best-effort and idempotent
    /// (deduped on the provider message id); never sends anything back and never runs the AI pipeline.
    /// </summary>
    private async Task CaptureEchoAsync(InteraktIncomingMessage data, int? sessionId)
    {
        var customerPhone = (data.Data?.Customer?.Country_Code ?? "") + (data.Data?.Customer?.Phone_Number ?? "");
        if (string.IsNullOrEmpty(customerPhone))
        {
            _logger.LogWarning("Echo ignored — missing contact phone.");
            return;
        }

        var customerName = data.Data?.Customer?.Traits?.Name;
        if (string.IsNullOrWhiteSpace(customerName)) customerName = null;

        var providerMessageId = data.Data?.Message?.Id;
        var rawText = data.Data?.Message?.Message ?? "";
        var rawType = (data.Data?.Message?.Message_Content_Type ?? "text").ToLower();
        var messageType = rawType switch
        {
            "voice" => "audio",
            "sticker" => "image",
            _ => rawType
        };
        var mediaUrl = data.Data?.Message?.Media_Url;

        // Same normalization the inbound path uses — shared contacts, reactions and revokes all arrive
        // as JSON and would otherwise be stored (and shown) as raw blobs.
        var (messageText, normalizedType) = NormalizeInteraktMessage(rawText, messageType);
        messageType = normalizedType;

        var sp = HttpContext.RequestServices;
        var sessionRepo = sp.GetRequiredService<WhatsAppSessionRepository>();
        var messageRepo = sp.GetRequiredService<MessageRepository>();
        var convService = sp.GetRequiredService<ConversationService>();
        var messageService = sp.GetRequiredService<MessageService>();

        // Idempotency — Interakt can re-deliver; skip if we already stored this message id.
        if (!string.IsNullOrEmpty(providerMessageId) &&
            await messageRepo.ExistsByProviderMessageIdAsync(providerMessageId))
        {
            _logger.LogInformation("Duplicate echo ignored — providerMessageId {Id} already stored.", providerMessageId);
            return;
        }

        // Resolve the sending business number's session (same ?sid the inbound webhook uses, so the
        // echo lands in the same conversation thread), falling back to the first active Interakt session.
        var session = sessionId.HasValue ? await sessionRepo.GetByIdAsync(sessionId.Value) : null;
        session ??= await sessionRepo.GetFirstActiveByProviderAsync("Interakt");
        if (session == null)
        {
            _logger.LogWarning("Echo ignored — could not resolve a session (sid={Sid}).", sessionId);
            return;
        }

        var conversation = await convService.GetOrCreateConversationAsync(session.Id, customerPhone, customerName);
        if (conversation == null)
        {
            _logger.LogWarning("Echo ignored — failed to get/create conversation for {Phone}.", customerPhone);
            return;
        }

        await messageService.SaveOutboundMessageAsync(
            conversation.Id,
            messageText,
            isAiGenerated: false,
            messageType: messageType,
            mediaUrl: mediaUrl,
            providerMessageId: providerMessageId);

        _logger.LogInformation(
            "Echo captured (business→contact) — Conv {Conv}, Contact {Phone}, Type {Type}.",
            conversation.Id, customerPhone, messageType);
    }

    /// <summary>
    /// Normalizes Interakt's special message payloads — shared contacts, reactions and revokes all
    /// arrive as JSON inside the message text — into short readable text. Returns the text to store
    /// and the (possibly changed) message type.
    /// </summary>
    private static (string Text, string Type) NormalizeInteraktMessage(string? rawText, string messageType)
    {
        if (rawText is "None" or "null" || string.IsNullOrWhiteSpace(rawText))
            return ("", messageType);

        var trimmed = rawText.TrimStart();

        // Reaction / revoke and other WhatsApp control payloads (a JSON object carrying a "type" field).
        if (trimmed.StartsWith('{') && FormatControlMessage(rawText) is { } control)
            return (control, "text");

        // Shared contact card (JSON array, or a single contact object).
        if (messageType == "contacts" || trimmed.StartsWith('[') || trimmed.StartsWith('{'))
            return (FormatSharedContacts(rawText) ?? "[Contact shared]", "text");

        return (rawText, messageType);
    }

    /// <summary>
    /// Formats WhatsApp control payloads that arrive as JSON: reactions ("Reacted 👍") and revokes
    /// ("message deleted"). Returns null if the JSON isn't a recognised control message.
    /// </summary>
    private static string? FormatControlMessage(string raw)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(raw);
            if (doc.RootElement.ValueKind != System.Text.Json.JsonValueKind.Object) return null;
            if (!doc.RootElement.TryGetProperty("type", out var typeEl)) return null;

            switch (typeEl.GetString()?.ToLowerInvariant())
            {
                case "reaction":
                    var emoji = doc.RootElement.TryGetProperty("reaction", out var r)
                                && r.TryGetProperty("emoji", out var e) ? e.GetString() : null;
                    return string.IsNullOrEmpty(emoji) ? "↩ Removed a reaction" : $"Reacted {emoji}";
                case "revoke":
                    return "🚫 This message was deleted";
                default:
                    return null;
            }
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Turns a shared-contact payload (WhatsApp contacts JSON — array or single object) into readable
    /// text like "📇 John Doe · +919999999999". Returns null if it can't be parsed as a contact card.
    /// </summary>
    private static string? FormatSharedContacts(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(raw);
            var root = doc.RootElement;
            var items = root.ValueKind == System.Text.Json.JsonValueKind.Array
                ? root.EnumerateArray().ToList()
                : new System.Collections.Generic.List<System.Text.Json.JsonElement> { root };

            var lines = new System.Collections.Generic.List<string>();
            foreach (var c in items)
            {
                if (c.ValueKind != System.Text.Json.JsonValueKind.Object) continue;

                string? name = null;
                if (c.TryGetProperty("name", out var nameEl))
                {
                    if (nameEl.ValueKind == System.Text.Json.JsonValueKind.Object)
                    {
                        if (nameEl.TryGetProperty("formatted_name", out var fn)) name = fn.GetString();
                        if (string.IsNullOrWhiteSpace(name) && nameEl.TryGetProperty("first_name", out var f)) name = f.GetString();
                    }
                    else if (nameEl.ValueKind == System.Text.Json.JsonValueKind.String)
                        name = nameEl.GetString();
                }

                string? phone = null;
                if (c.TryGetProperty("phones", out var phones) && phones.ValueKind == System.Text.Json.JsonValueKind.Array)
                {
                    foreach (var p in phones.EnumerateArray())
                    {
                        if (p.ValueKind == System.Text.Json.JsonValueKind.Object)
                        {
                            if (p.TryGetProperty("phone", out var ph) && !string.IsNullOrWhiteSpace(ph.GetString())) { phone = ph.GetString(); break; }
                            if (p.TryGetProperty("wa_id", out var wa) && !string.IsNullOrWhiteSpace(wa.GetString())) { phone = wa.GetString(); break; }
                        }
                        else if (p.ValueKind == System.Text.Json.JsonValueKind.String) { phone = p.GetString(); break; }
                    }
                }

                var parts = new[] { name, phone }.Where(x => !string.IsNullOrWhiteSpace(x));
                if (parts.Any()) lines.Add("📇 " + string.Join(" · ", parts));
            }

            return lines.Count > 0 ? string.Join("\n", lines) : null;
        }
        catch
        {
            return null; // not contact JSON — caller falls back to "[Contact shared]"
        }
    }
}
