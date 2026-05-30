namespace TejooWhatsApp.Models.Entities;

public class TeamMember
{
    public int Id { get; set; }
    public int TeamId { get; set; }
    public int UserId { get; set; }
    public int? ManagerId { get; set; } // Points to UserId within SAME team (nullable)
    public string RoleInTeam { get; set; } = string.Empty; // CRR | Manager | HOD | Admin
    public bool IsActive { get; set; } = true;
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public Team Team { get; set; } = null!;
    public User User { get; set; } = null!;
    public User? Manager { get; set; } // Manager within the team
}
