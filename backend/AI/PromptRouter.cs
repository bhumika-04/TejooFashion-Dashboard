using TejooWhatsApp.Models.Entities;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace TejooWhatsApp.AI;

public class AiRouterService
{
    private readonly OpenAiClient _openAiClient;
    private readonly PromptLoader _promptLoader;

    public AiRouterService(OpenAiClient openAiClient, PromptLoader promptLoader)
    {
        _openAiClient = openAiClient;
        _promptLoader = promptLoader;
    }

    public async Task<AiProcessingResult> ProcessMessageAsync(string userMessage, List<Message> conversationHistory)
    {
        try
        {
            // Step 1: Router prompt determines intent
            var routerPrompt = await _promptLoader.GetRouterPromptAsync();
            if (routerPrompt == null)
                return Escalate("Router prompt not configured");

            var contextMessages = conversationHistory
                .TakeLast(10)
                .Select(m => new ChatMessage
                {
                    Role = m.Direction == "inbound" ? "user" : "assistant",
                    Content = m.Content ?? ""
                })
                .ToList();

            var routerRaw = await _openAiClient.GetChatCompletionAsync(
                routerPrompt.SystemPrompt, userMessage, contextMessages);

            if (string.IsNullOrEmpty(routerRaw))
                return Escalate("Router returned no response");

            // Parse router JSON: { "intent": "", "reason": "", "confidence": 0-1 }
            var (intent, routerConfidence) = ParseRouterResponse(routerRaw);
            if (string.IsNullOrEmpty(intent))
                return Escalate("Could not parse router intent");

            // Validate intent is a known key — prevent long sentence leak from malformed JSON
            var validIntents = new HashSet<string>
                { "general_query", "follow_up", "order_status", "payment_outstanding", "dispatch_info", "credit_limit" };
            if (!validIntents.Contains(intent))
            {
                intent = "general_query"; // safe fallback
            }

            // Step 2: Get specialist prompt
            var specialistPrompt = await _promptLoader.GetSpecialistPromptAsync(intent);
            if (specialistPrompt == null)
            {
                // Fallback to general_query if specialist not found
                specialistPrompt = await _promptLoader.GetPromptAsync("general_query");
                if (specialistPrompt == null)
                    return Escalate($"No specialist prompt for intent: {intent}");
            }

            // Step 3: Generate specialist response
            var specialistRaw = await _openAiClient.GetChatCompletionAsync(
                specialistPrompt.SystemPrompt, userMessage, contextMessages);

            if (string.IsNullOrEmpty(specialistRaw))
                return Escalate("Specialist returned no response");

            // Parse specialist JSON: { "reply": "", "intent": "", "escalate": bool, "erpPayload": {}, "metadata": {} }
            var (reply, shouldEscalate, escalationReason) = ParseSpecialistResponse(specialistRaw);

            var finalReply = string.IsNullOrWhiteSpace(reply) ? specialistRaw : reply;

            return new AiProcessingResult
            {
                Success = true,
                Intent = intent,
                ResponseText = finalReply,
                Confidence = routerConfidence ?? CalculateConfidence(intent, finalReply),
                ShouldEscalate = shouldEscalate,
                EscalationReason = escalationReason
            };
        }
        catch (Exception ex)
        {
            return Escalate($"AI processing error: {ex.Message}");
        }
    }

    // ── JSON parsers ────────────────────────────────────────────────────────

    private static (string? intent, decimal? confidence) ParseRouterResponse(string raw)
    {
        try
        {
            var json = ExtractJson(raw);
            if (json == null) return (raw.Trim().ToLower(), null);

            var obj = JObject.Parse(json);
            var intent = obj["intent"]?.ToString()?.Trim().ToLower();
            decimal? confidence = null;
            if (decimal.TryParse(obj["confidence"]?.ToString(), out var c))
                confidence = Math.Clamp(c, 0.1m, 1.0m);

            return (intent, confidence);
        }
        catch
        {
            // Fallback: treat raw text as intent word
            return (raw.Trim().ToLower(), null);
        }
    }

    private static (string? reply, bool escalate, string? reason) ParseSpecialistResponse(string raw)
    {
        try
        {
            var json = ExtractJson(raw);
            if (json == null) return (raw, false, null);

            var obj = JObject.Parse(json);
            var reply   = obj["reply"]?.ToString();
            var escalate = obj["escalate"]?.Value<bool>() ?? false;
            var reason  = obj["reason"]?.ToString();
            return (reply, escalate, reason);
        }
        catch
        {
            return (raw, false, null);
        }
    }

    // Extract first JSON object or array from a string (handles markdown code blocks)
    private static string? ExtractJson(string raw)
    {
        var start = raw.IndexOfAny(new[] { '{', '[' });
        if (start < 0) return null;
        var end = raw.LastIndexOfAny(new[] { '}', ']' });
        if (end < start) return null;
        return raw[start..(end + 1)];
    }

    private static AiProcessingResult Escalate(string reason) => new()
    {
        Success = false,
        ShouldEscalate = true,
        ErrorMessage = reason
    };

    private static decimal CalculateConfidence(string intent, string response)
    {
        decimal confidence = intent switch
        {
            "order_status" or "payment_outstanding" or "dispatch_info" or "credit_limit" => 0.9m,
            "follow_up"    => 0.8m,
            "general_query" => 0.75m,
            _ => 0.8m
        };

        if (response.Length < 50)                  confidence -= 0.2m;
        if (response.Contains("not sure",  StringComparison.OrdinalIgnoreCase)) confidence -= 0.3m;
        if (response.Contains("don't know", StringComparison.OrdinalIgnoreCase)) confidence -= 0.3m;

        return Math.Clamp(confidence, 0.1m, 1.0m);
    }
}

public class AiProcessingResult
{
    public bool Success { get; set; }
    public string? Intent { get; set; }
    public string? ResponseText { get; set; }
    public decimal? Confidence { get; set; }
    public bool ShouldEscalate { get; set; }
    public string? EscalationReason { get; set; }
    public string? ErrorMessage { get; set; }
}
