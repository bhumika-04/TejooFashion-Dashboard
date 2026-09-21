namespace TejooWhatsApp.AI;

/// <summary>
/// Process-wide health flag for the OpenAI account. OpenAiClient flips this when a call fails with
/// an out-of-credits / quota error (HTTP 429 insufficient_quota / credit_balance_exhausted) and
/// clears it on the next successful call. Surfaced to admins via /api/system/ai-status so the
/// dashboard can show a "top up OpenAI credits" warning banner. Registered as a singleton.
/// </summary>
public class AiHealthState
{
    private readonly object _lock = new();

    public bool CreditsExhausted { get; private set; }
    public DateTime? SinceUtc { get; private set; }
    public string? Message { get; private set; }

    public void ReportQuotaExhausted(string? message)
    {
        lock (_lock)
        {
            if (!CreditsExhausted) SinceUtc = DateTime.UtcNow;  // keep the first time it started
            CreditsExhausted = true;
            Message = message;
        }
    }

    /// <summary>A successful AI call means credits are flowing again — clear any prior warning.</summary>
    public void ReportSuccess()
    {
        if (!CreditsExhausted) return;   // fast path, no lock when already healthy
        lock (_lock)
        {
            CreditsExhausted = false;
            SinceUtc = null;
            Message = null;
        }
    }
}
