
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

            // Clean up message text based on type
            string messageText;
            if (rawText == "None" || rawText == "null" || string.IsNullOrWhiteSpace(rawText))
            {
                messageText = "";
            }
            else if (messageType == "contacts" || rawText.TrimStart().StartsWith('[') || rawText.TrimStart().StartsWith('{'))
            {
                // Contact card or JSON payload — store as a readable label instead of raw JSON
                messageText = "[Contact shared]";
                messageType = "text";
            }
            else
            {
                messageText = rawText;
            }
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
}
