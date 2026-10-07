using System.Text;
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

    // ── acknowledgement detection ("Ok", "Thanks", 👍) ───────────────────────
    // A customer message that only acknowledges/closes the exchange doesn't need a reply, so it
    // must not restart the SLA clock, count as a slow response, or trigger an AI draft.
    // Precision over recall: a real request misread as "Ok" silently drops off the SLA list, so
    // anything with a '?', a request word, or a word outside the vocabulary below is NOT an ack.

    // Each of these is an acknowledgement on its own ("Ok", "Thanks", "Theek", 👍).
    // Deliberately NOT "yes"/"haan"/"ji"/"sure"/"done": those usually answer an agent's question
    // ("Shall I send the catalog?" → "Yes") and DO need follow-up.
    private static readonly HashSet<string> AckCoreWords = new(StringComparer.Ordinal)
    {
        "ok", "okk", "okkk", "okkkk", "okay", "okayy", "okayyy", "okey", "okie", "okies", "oky", "oke", "okeh",
        "okkay", "ohk", "ohkk", "ohkay", "k", "kk", "ओके",
        "thanks", "thank", "thankyou", "thanku", "thnx", "thnks", "thanx", "thx", "ty", "tq", "tysm",
        "thnq", "thanq", "dhanyavad", "dhanyawad", "dhanywad", "shukriya", "sukriya", "धन्यवाद", "शुक्रिया",
        "noted", "fine", "great", "good", "nice", "perfect", "cool", "alright", "allright", "understood",
        "acha", "achha", "accha", "acchha", "achaa", "theek", "thik", "thikh", "tik", "ठीक", "sahi",
        "badhiya", "bdiya", "badiya", "hmm", "hmmm", "hm", "wait", "sorry", "welcome",
        "👍", "🙏", "👌", "✅", "😊", "🙂", "☺", "❤", "♥", "🤝", "👏", "💐",
    };

    // Allowed alongside a core word ("Ok sir", "Thank you ji", "No thanks", "I will wait"), never alone.
    private static readonly HashSet<string> AckFillerWords = new(StringComparer.Ordinal)
    {
        "ji", "jee", "jii", "sir", "sirr", "sirji", "mam", "maam", "mamm", "madam", "mem", "maa", "bhai",
        "bhaiya", "bhaiyya", "didi", "dear", "bro", "brother", "sister", "जी", "सर",
        "you", "u", "so", "much", "very", "a", "lot", "alot", "it", "its", "is", "hai", "h", "he", "ho",
        "all", "the", "again", "too", "and", "no", "i", "ill", "will", "we", "है",
    };

    // Whole messages (tokens joined, no spaces) that close the exchange but aren't built from the words above.
    private static readonly HashSet<string> AckPhrases = new(StringComparer.Ordinal)
    {
        "gotit", "noproblem", "noprob", "np", "koibaatnahi", "koibaatnhi", "notinterested", "nointerest",
        "noneed", "nhichahiye", "nahichahiye", "nhichaiye", "nahichaiye", "nichahiye", "nhichayie", "willdo",
    };

    // "Thank you for <...>" is a closing ("Thank you for your quick assist") unless it carries a request.
    private static readonly HashSet<string> RequestWords = new(StringComparer.Ordinal)
    {
        "send", "bhej", "bhejo", "bhejiye", "bhejdo", "share", "price", "prices", "rate", "rates", "catalog",
        "catalogue", "catlog", "kitna", "kitne", "kitni", "call", "details", "detail", "pdf", "photo", "photos",
        "pic", "pics", "available", "need", "want", "chahiye", "chaiye", "address", "number", "link", "order",
        "please", "plz", "pls", "kab", "kya", "kaise", "kaha", "kahan", "when", "what", "how", "where", "why",
        "but", "can", "could",
    };

    // The customer's own WhatsApp Business greeting firing back at us — never a query.
    private static readonly string[] AutoGreetingStarts =
    {
        "thank you for contacting", "thanks for contacting", "thank you for choosing", "thanks for choosing",
        "thank you for reaching", "thanks for reaching", "thank you for your message", "thanks for your message",
        "thank you for messaging", "thanks for messaging", "welcome to ", "we appreciate your interest",
    };

    /// <summary>Stored control messages that are never questions (see WebhookController.FormatControlMessage).</summary>
    private static readonly string[] ControlMessagePrefixes = { "Reacted ", "↩ Removed a reaction", "🚫 This message was deleted" };

    /// <summary>Media (image/voice/document) is never an acknowledgement, even with an "ok" caption.</summary>
    public static bool IsAcknowledgement(string? text, string? messageType = "text")
    {
        if (!string.Equals(messageType, "text", StringComparison.OrdinalIgnoreCase)) return false;
        if (string.IsNullOrWhiteSpace(text)) return false;
        if (ControlMessagePrefixes.Any(p => text.StartsWith(p, StringComparison.Ordinal))) return true;

        var lower = text.Trim().ToLowerInvariant();
        var start = lower.TrimStart('.', '*', '_', '~', ' ', '-', '"', '\'');
        if (AutoGreetingStarts.Any(g => start.StartsWith(g, StringComparison.Ordinal))) return true;

        if (lower.Contains('?') || lower.Length > 80) return false;

        var tokens = Tokenize(lower);
        if (tokens.Count == 0) return true; // punctuation only: ".", ".."
        if (AckPhrases.Contains(string.Concat(tokens))) return true;
        if (tokens.All(t => AckCoreWords.Contains(t) || AckFillerWords.Contains(t)) && tokens.Any(AckCoreWords.Contains))
            return true;

        var gratitudeOpener = tokens.Count >= 2 && tokens[1] == "for" && tokens[0] is "thanks" or "thankyou" or "thanku"
                           || tokens.Count >= 3 && tokens[0] == "thank" && tokens[1] is "you" or "u" && tokens[2] == "for";
        return gratitudeOpener && tokens.Count <= 12 && !tokens.Any(RequestWords.Contains);
    }

    /// <summary>
    /// Lowercased words; punctuation/whitespace split words, apostrophes join them ("it's" → "its"),
    /// and each emoji becomes its own token with skin-tone/variation modifiers dropped ("ok👍🏻" → ok, 👍).
    /// </summary>
    private static List<string> Tokenize(string lower)
    {
        var tokens = new List<string>();
        var word = new System.Text.StringBuilder();
        void Flush() { if (word.Length > 0) { tokens.Add(word.ToString()); word.Clear(); } }

        foreach (var rune in lower.EnumerateRunes())
        {
            if (rune.Value is '\'' or '’') continue;
            var cat = Rune.GetUnicodeCategory(rune);
            if (Rune.IsLetterOrDigit(rune))
                word.Append(rune.ToString());
            else if (cat is System.Globalization.UnicodeCategory.NonSpacingMark or System.Globalization.UnicodeCategory.SpacingCombiningMark)
            {
                if (word.Length > 0) word.Append(rune.ToString()); // Devanagari vowel signs; a lone U+FE0F is dropped
            }
            else if (cat is System.Globalization.UnicodeCategory.OtherSymbol || rune.Value is 0x2764 or 0x2665 or 0x263A)
            {
                Flush();
                tokens.Add(rune.ToString());
            }
            else
                Flush(); // whitespace, punctuation, ZWJ, skin-tone modifiers
        }
        Flush();
        return tokens;
    }

    private static bool ContainsAny(string text, params string[] needles) =>
        needles.Any(n => text.Contains(n, StringComparison.OrdinalIgnoreCase));
}
