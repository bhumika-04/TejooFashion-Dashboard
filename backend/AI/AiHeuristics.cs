using System.Text.RegularExpressions;

namespace TejooWhatsApp.AI;

/// <summary>
/// Cheap, deterministic helpers used alongside the LLM pipeline — intent→tag mapping,
/// internal-message detection, fast negativity check, and a conservative rule-first intent
/// shortcut. All pure functions (no I/O), shared by the orchestrator and the AI router.
/// </summary>
public static class AiHeuristics
{
    // ── intent → conversation tag name ──────────────────────────────────────
    public static string? IntentToTag(string? intent) => intent switch
    {
        "order_status"        => "Order",
        "dispatch_info"       => "Dispatch",
        "payment_outstanding" => "Payment",
        "credit_limit"        => "Payment",
        "follow_up"           => "Follow-up",
        "general_query"       => "Query",
        _                     => null,
    };

    public static string TagColor(string tag) => tag switch
    {
        "Order"     => "#10B981",
        "Dispatch"  => "#0EA5E9",
        "Payment"   => "#F59E0B",
        "Follow-up" => "#F59E0B",
        "Query"     => "#3B82F6",
        "Complaint" => "#EF4444",
        "Internal"  => "#64748B",
        _           => "#6366F1",
    };

    // ── internal team data-dump detection ───────────────────────────────────
    // Tejoo's team forwards internal order/billing reports over WhatsApp (tab-separated
    // rows with a TF###### bill ref and a "CRR/Whatsapp Name:" footer). These are NOT
    // customer queries and must not trigger an AI reply.
    private static readonly Regex TfRef = new(@"\bTF\d{4,}\b", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static bool IsInternalReport(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return false;
        if (text.Contains("CRR/Whatsapp Name", StringComparison.OrdinalIgnoreCase)) return true;

        var tabs = text.Count(c => c == '\t');
        if (TfRef.IsMatch(text) &&
            (tabs >= 2 || ContainsAny(text, "Online Customer", "GR%", "BILIING", "Block  -", "LAST THREE TOP")))
            return true;

        return false;
    }

    // ── fast negativity check (English + romanised Hindi) ───────────────────
    private static readonly string[] NegativeWords =
    {
        "complaint", "refund", "return", "damaged", "defective", "broken", "wrong size", "worst",
        "terrible", "fraud", "cheat", "scam", "disappointed", "poor quality", "not received",
        "never received", "horrible", "useless", "angry", "unacceptable", "pathetic", "harassment",
        "bekar", "kharab", "ganda", "galat", "dhoka", "paisa wapas", "bakwas", "naraz", "faltu",
    };

    public static bool LooksNegative(string? text) =>
        !string.IsNullOrWhiteSpace(text) && ContainsAny(text, NegativeWords);

    /// <summary>Summary sentiment at or below this is treated as a complaint (High priority + Complaint tag).</summary>
    public const decimal ComplaintSentimentThreshold = -0.4m;

    // ── conservative rule-first intent (skips the router LLM call when unambiguous) ──
    // Only matches very clear phrases; anything ambiguous returns null and falls back to the LLM router.
    public static string? QuickIntent(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var t = text.ToLowerInvariant();

        if (ContainsAny(t, "outstanding", "kitna baki", "kitne paise", "pending payment", "balance payment", "bill amount"))
            return "payment_outstanding";
        if (ContainsAny(t, "credit limit", "credit balance"))
            return "credit_limit";
        if (ContainsAny(t, "lr number", "lr no", "courier", "dispatch status", "kab dispatch", "tracking number"))
            return "dispatch_info";
        if (ContainsAny(t, "order status", "my order", "order kahan", "order kab", "track my order"))
            return "order_status";

        return null;
    }

    private static bool ContainsAny(string text, params string[] needles) =>
        needles.Any(n => text.Contains(n, StringComparison.OrdinalIgnoreCase));
}
