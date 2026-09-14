namespace TejooWhatsApp.Models.Entities;

public class Conversation
{
    public int Id { get; set; }
    public int SessionId { get; set; }
    public int AssignedUserId { get; set; }

    // Contact Information
    public string CustomerPhone { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public string BusinessPhone { get; set; } = string.Empty;

    // Conversation Status
    public string Status { get; set; } = "Open"; // Open | Closed | Escalated
    public string Priority { get; set; } = "Normal"; // Low | Normal | High

    // Timestamps
    public DateTime? LastMessageAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ClosedAt { get; set; }
    public DateTime? SummaryArchivedAt { get; set; }   // set by retention: messages before this were purged
    public bool TagsLocked { get; set; }               // a CRR edited the tags → auto-tagger frozen

    // Navigation properties
    public WhatsAppSession Session { get; set; } = null!;
    public User AssignedUser { get; set; } = null!;
    public ICollection<Message> Messages { get; set; } = new List<Message>();
    public ICollection<Escalation> Escalations { get; set; } = new List<Escalation>();
    public ConversationSummary? Summary { get; set; }
}
