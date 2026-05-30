namespace TejooWhatsApp.Models.Entities;

public class ConversationSummary
{
    public int Id { get; set; }
    public int ConversationId { get; set; }
    public string SummaryText { get; set; } = string.Empty;
    public string? KeyTopics { get; set; }
    public decimal? SentimentScore { get; set; } // -1.00 to 1.00
    public DateTime LastUpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public Conversation Conversation { get; set; } = null!;
}
