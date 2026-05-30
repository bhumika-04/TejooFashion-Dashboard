namespace TejooWhatsApp.Models.DTOs;

public class TeamDTO
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? ManagerName { get; set; }
    public bool IsActive { get; set; }
    public int MemberCount { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class TeamDetailDTO
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public UserDTO? Manager { get; set; }
    public List<UserDTO> Members { get; set; } = new();
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class CreateTeamRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int? ManagerId { get; set; }
}

public class UpdateTeamRequest
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    public int? ManagerId { get; set; }
    public bool? IsActive { get; set; }
}

// TeamMembers DTOs
public class TeamMemberDTO
{
    public int Id { get; set; }
    public int TeamId { get; set; }
    public int UserId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string RoleInTeam { get; set; } = string.Empty;
    public int? ManagerId { get; set; }
    public string? ManagerName { get; set; }
    public bool IsActive { get; set; }
    public DateTime JoinedAt { get; set; }
}

public class AddTeamMemberRequest
{
    public int UserId { get; set; }
    public string RoleInTeam { get; set; } = string.Empty; // CRR | Manager | HOD | Admin
    public int? ManagerId { get; set; }
}

public class UpdateTeamMemberRequest
{
    public string? RoleInTeam { get; set; }
    public int? ManagerId { get; set; }
    // Must be true to update ManagerId (distinguishes "not provided" from explicit null)
    public bool UpdateManager { get; set; } = false;
}

public class TeamHierarchyNodeDTO
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string RoleInTeam { get; set; } = string.Empty;
    public int? ManagerId { get; set; }
    public List<TeamHierarchyNodeDTO> DirectReports { get; set; } = new();
}
