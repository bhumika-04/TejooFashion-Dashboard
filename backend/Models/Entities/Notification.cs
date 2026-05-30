namespace TejooWhatsApp.Models.Entities;

public class Notification
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string Type { get; set; } = string.Empty; // new_message, escalation, assignment, system
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public int? ConversationId { get; set; }
    public int? EscalationId { get; set; }
    public string Priority { get; set; } = "Normal";
    public bool IsRead { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReadAt { get; set; }

    // Navigation properties
    public User? User { get; set; }
    public Conversation? Conversation { get; set; }
    public Escalation? Escalation { get; set; }
}

public class ConversationView
{
    public int Id { get; set; }
    public int ConversationId { get; set; }
    public int UserId { get; set; }
    public DateTime LastViewedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public Conversation? Conversation { get; set; }
    public User? User { get; set; }
}
