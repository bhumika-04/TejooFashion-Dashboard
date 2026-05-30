namespace TejooWhatsApp.Models.Entities;

public class Escalation
{
    public int Id { get; set; }
    public int ConversationId { get; set; }
    public int? EscalatedFromUserId { get; set; } // NULL if escalated from AI
    public int EscalatedToUserId { get; set; }

    public string? Reason { get; set; }
    public string Priority { get; set; } = "Normal"; // Low | Normal | High
    public string Status { get; set; } = "Pending"; // Pending | InProgress | Resolved

    public DateTime EscalatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastEscalatedAt { get; set; } = DateTime.UtcNow; // Updated each time level is bumped
    public int EscalationLevel { get; set; } = 1; // 1=CRR, 2=Manager, 3=HOD
    public DateTime? ResolvedAt { get; set; }
    public string? ResolutionNotes { get; set; }

    // Navigation properties
    public Conversation Conversation { get; set; } = null!;
    public User EscalatedToUser { get; set; } = null!;
}
