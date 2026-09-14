namespace TejooWhatsApp.Models.Entities;

public class Message
{
    public int Id { get; set; }
    public int ConversationId { get; set; }

    // Message Details
    public string Direction { get; set; } = string.Empty; // inbound | outbound
    public string MessageType { get; set; } = "text"; // text | image | document | template
    public string? Content { get; set; }
    public string? MediaUrl { get; set; }
    public string? Transcript { get; set; }   // Whisper transcript for inbound voice notes

    // Provider Information
    public string? ProviderMessageId { get; set; }

    // AI Metadata (for outbound AI messages)
    public bool IsAiGenerated { get; set; } = false;
    public string? Intent { get; set; }
    public decimal? Confidence { get; set; }

    // Timestamps
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? DeliveredAt { get; set; }
    public DateTime? ReadAt { get; set; }

    // Navigation properties
    public Conversation Conversation { get; set; } = null!;
}
