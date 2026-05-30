namespace TejooWhatsApp.Models.DTOs;

public class EscalationDTO
{
    public int Id { get; set; }
    public int ConversationId { get; set; }
    public string? EscalatedFromUserName { get; set; }
    public string EscalatedToUserName { get; set; } = string.Empty;
    public string? Reason { get; set; }
    public string Priority { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime EscalatedAt { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public string? ResolutionNotes { get; set; }

    // Conversation context
    public string CustomerPhone { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public string BusinessPhone { get; set; } = string.Empty;
}

public class CreateEscalationRequest
{
    public int ConversationId { get; set; }
    public int? EscalatedFromUserId { get; set; }
    public int EscalatedToUserId { get; set; }
    public string? Reason { get; set; }
    public string Priority { get; set; } = "Normal";
}

public class UpdateEscalationRequest
{
    public string? Status { get; set; }
    public string? ResolutionNotes { get; set; }
}
