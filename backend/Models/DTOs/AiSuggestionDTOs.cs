namespace TejooWhatsApp.Models.DTOs;

/// <summary>The pending AI draft shown in the chat.</summary>
public class AiSuggestionDTO
{
    public int Id { get; set; }
    public int ConversationId { get; set; }
    public string SuggestedText { get; set; } = string.Empty;
    public string? Intent { get; set; }
    public decimal? Confidence { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>Record what the CRR did with a suggestion (drives acceptance analytics).</summary>
public class ResolveSuggestionRequest
{
    public string Status { get; set; } = string.Empty; // Sent | Edited | Dismissed
}

/// <summary>AI copilot acceptance analytics for a period — how often drafts were used vs discarded.</summary>
public class AiSuggestionStatsDTO
{
    public int Total { get; set; }        // all drafts generated in the window
    public int Pending { get; set; }
    public int Superseded { get; set; }   // replaced by a fresh draft before the CRR acted
    public int Sent { get; set; }         // sent as-is
    public int Edited { get; set; }       // tweaked, then sent
    public int Dismissed { get; set; }

    public int Acted => Sent + Edited + Dismissed;
    // Of the drafts the CRR acted on, how many were used (as-is or edited).
    public double AcceptanceRate => Acted > 0 ? System.Math.Round((Sent + Edited) * 100.0 / Acted, 1) : 0;
    // Of the acted drafts, how many were good enough to send untouched — the strongest quality signal.
    public double SendAsIsRate => Acted > 0 ? System.Math.Round(Sent * 100.0 / Acted, 1) : 0;
}

/// <summary>Per-agent AI-copilot acceptance breakdown.</summary>
public class AiAgentAcceptanceDTO
{
    public string AgentName { get; set; } = string.Empty;
    public int Sent { get; set; }
    public int Edited { get; set; }
    public int Dismissed { get; set; }
    public int Acted => Sent + Edited + Dismissed;
    public double AcceptanceRate => Acted > 0 ? System.Math.Round((Sent + Edited) * 100.0 / Acted, 0) : 0;
}
