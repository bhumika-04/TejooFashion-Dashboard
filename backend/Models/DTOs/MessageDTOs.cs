namespace TejooWhatsApp.Models.DTOs;

public class MessageDTO
{
    public int Id { get; set; }
    public int ConversationId { get; set; }
    public string Direction { get; set; } = string.Empty;
    public string MessageType { get; set; } = string.Empty;
    public string? Content { get; set; }
    public string? MediaUrl { get; set; }
    public bool IsAiGenerated { get; set; }
    public string? Intent { get; set; }
    public decimal? Confidence { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? DeliveredAt { get; set; }
    public DateTime? ReadAt { get; set; }
}

public class SendMessageRequest
{
    public int ConversationId { get; set; }
    public string Content { get; set; } = string.Empty;
    public string MessageType { get; set; } = "text";
    public string? MediaUrl { get; set; }
}

public class SendMessageResponse
{
    public bool Success { get; set; }
    public string? ProviderMessageId { get; set; }
    public string? ErrorMessage { get; set; }
    public MessageDTO? Message { get; set; }
}
