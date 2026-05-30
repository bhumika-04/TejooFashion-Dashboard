namespace TejooWhatsApp.Models.Entities;

public class User
{
    public int Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty; // Admin | HOD | Manager | CRR
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public ICollection<TeamMember> TeamMemberships { get; set; } = new List<TeamMember>(); // All teams this user belongs to
    public ICollection<Team> ManagedTeams { get; set; } = new List<Team>();
    public ICollection<WhatsAppSession> AssignedSessions { get; set; } = new List<WhatsAppSession>();
    public ICollection<Conversation> AssignedConversations { get; set; } = new List<Conversation>();
    public ICollection<Escalation> EscalationsTo { get; set; } = new List<Escalation>();
}
