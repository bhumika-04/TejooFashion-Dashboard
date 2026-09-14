namespace TejooWhatsApp.Models.Entities;

/// <summary>An AI-drafted reply awaiting a CRR's Send / Edit / Dismiss (copilot mode).</summary>
public class AiSuggestion
{
    public int Id { get; set; }
    public int ConversationId { get; set; }
    public int? SourceMessageId { get; set; }
    public string SuggestedText { get; set; } = string.Empty;
    public string? Intent { get; set; }
    public decimal? Confidence { get; set; }
    public string Status { get; set; } = "Pending"; // Pending | Sent | Edited | Dismissed | Superseded
    public int? ActedByUserId { get; set; }
    public DateTime? ActedAt { get; set; }
    public DateTime CreatedAt { get; set; }
}
