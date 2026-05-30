using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Repositories;
using TejooWhatsApp.Models.DTOs;
using TejooWhatsApp.Models.Entities;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/[controller]")]
public class TeamsController : ControllerBase
{
    private readonly TeamRepository _teamRepo;
    private readonly UserRepository _userRepo;
    private readonly TeamMemberRepository _teamMemberRepo;
    private readonly ILogger<TeamsController> _logger;

    public TeamsController(TeamRepository teamRepo, UserRepository userRepo, TeamMemberRepository teamMemberRepo, ILogger<TeamsController> logger)
    {
        _teamRepo = teamRepo;
        _userRepo = userRepo;
        _teamMemberRepo = teamMemberRepo;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] bool? isActive = null)
    {
        var teams = await _teamRepo.GetAllAsync(isActive);
        var dtos = new List<TeamDTO>();

        foreach (var team in teams)
        {
            var manager = team.ManagerId.HasValue ? await _userRepo.GetByIdAsync(team.ManagerId.Value) : null;
            var memberCount = await _teamRepo.GetMemberCountAsync(team.Id);

            dtos.Add(new TeamDTO
            {
                Id = team.Id,
                Name = team.Name,
                Description = team.Description,
                ManagerName = manager?.FullName,
                IsActive = team.IsActive,
                MemberCount = memberCount,
                CreatedAt = team.CreatedAt
            });
        }

        return Ok(dtos);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var team = await _teamRepo.GetByIdAsync(id);
        if (team == null)
        {
            return NotFound(new { error = "Team not found" });
        }

        var manager = team.ManagerId.HasValue ? await _userRepo.GetByIdAsync(team.ManagerId.Value) : null;
        var teamMembers = await _teamMemberRepo.GetMembersByTeamAsync(id);

        return Ok(new TeamDetailDTO
        {
            Id = team.Id,
            Name = team.Name,
            Description = team.Description,
            Manager = manager != null ? new UserDTO
            {
                Id = manager.Id,
                FullName = manager.FullName,
                Email = manager.Email,
                Phone = manager.Phone,
                Role = manager.Role,
                IsActive = manager.IsActive,
                CreatedAt = manager.CreatedAt
            } : null,
            Members = teamMembers.Select(tm => new UserDTO
            {
                Id = tm.UserId,
                FullName = tm.User?.FullName ?? "",
                Email = tm.User?.Email ?? "",
                Phone = tm.User?.Phone ?? "",
                Role = tm.RoleInTeam,
                IsActive = tm.IsActive,
                CreatedAt = tm.JoinedAt
            }).ToList(),
            IsActive = team.IsActive,
            CreatedAt = team.CreatedAt
        });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTeamRequest request)
    {
        if (string.IsNullOrEmpty(request.Name))
        {
            return BadRequest(new { error = "Team name is required" });
        }

        var team = new Team
        {
            Name = request.Name,
            Description = request.Description,
            ManagerId = request.ManagerId,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        team.Id = await _teamRepo.CreateAsync(team);

        _logger.LogInformation("✓ Team created: '{TeamName}' (ID: {TeamId})", team.Name, team.Id);

        return Ok(new { success = true, teamId = team.Id });
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateTeamRequest request)
    {
        var team = await _teamRepo.GetByIdAsync(id);
        if (team == null)
        {
            return NotFound(new { error = "Team not found" });
        }

        if (request.Name != null) team.Name = request.Name;
        if (request.Description != null) team.Description = request.Description;
        if (request.ManagerId.HasValue) team.ManagerId = request.ManagerId;
        if (request.IsActive.HasValue) team.IsActive = request.IsActive.Value;

        team.UpdatedAt = DateTime.UtcNow;

        var result = await _teamRepo.UpdateAsync(team);
        if (!result)
        {
            return BadRequest(new { error = "Failed to update team" });
        }

        _logger.LogInformation("✓ Team updated: '{TeamName}' (ID: {TeamId})", team.Name, team.Id);

        return Ok(new { success = true });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var team = await _teamRepo.GetByIdAsync(id);
        var result = await _teamRepo.DeleteAsync(id);
        if (!result)
        {
            return NotFound(new { error = "Team not found" });
        }

        _logger.LogInformation("✓ Team deleted: '{TeamName}' (ID: {TeamId})", team?.Name ?? "Unknown", id);

        return Ok(new { success = true });
    }

    // ============ TEAM MEMBERS MANAGEMENT ============

    [HttpGet("{id}/members")]
    public async Task<IActionResult> GetTeamMembers(int id)
    {
        var team = await _teamRepo.GetByIdAsync(id);
        if (team == null)
        {
            return NotFound(new { error = "Team not found" });
        }

        var members = await _teamMemberRepo.GetMembersByTeamAsync(id);

        var dtos = members.Select(m => new TeamMemberDTO
        {
            Id = m.Id,
            TeamId = m.TeamId,
            UserId = m.UserId,
            FullName = m.User?.FullName ?? "",
            Email = m.User?.Email ?? "",
            RoleInTeam = m.RoleInTeam,
            ManagerId = m.ManagerId,
            ManagerName = m.Manager?.FullName,
            IsActive = m.IsActive,
            JoinedAt = m.JoinedAt
        }).ToList();

        _logger.LogInformation("📋 Fetched team '{TeamName}' (ID: {TeamId}) with {MemberCount} members",
            team.Name, id, members.Count);

        return Ok(dtos);
    }

    [HttpGet("{id}/available-users")]
    public async Task<IActionResult> GetAvailableUsers(int id)
    {
        var team = await _teamRepo.GetByIdAsync(id);
        if (team == null)
        {
            return NotFound(new { error = "Team not found" });
        }

        var availableUsers = await _teamMemberRepo.GetAvailableUsersForTeamAsync(id);

        var dtos = availableUsers.Select(u => new UserDTO
        {
            Id = u.Id,
            FullName = u.FullName,
            Email = u.Email,
            Phone = u.Phone,
            Role = u.Role,
            IsActive = u.IsActive,
            CreatedAt = u.CreatedAt
        }).ToList();

        return Ok(dtos);
    }

    [HttpPost("{id}/members")]
    public async Task<IActionResult> AddMember(int id, [FromBody] AddTeamMemberRequest request)
    {
        var team = await _teamRepo.GetByIdAsync(id);
        if (team == null)
        {
            return NotFound(new { error = "Team not found" });
        }

        // Validate user exists
        var user = await _userRepo.GetByIdAsync(request.UserId);
        if (user == null)
        {
            return BadRequest(new { error = "User not found" });
        }

        // Check if user is already in team
        var existing = await _teamMemberRepo.GetByTeamAndUserAsync(id, request.UserId);
        if (existing != null)
        {
            return BadRequest(new { error = "User is already a member of this team" });
        }

        // Validate manager if provided
        if (request.ManagerId.HasValue)
        {
            var managerInTeam = await _teamMemberRepo.IsUserInTeamAsync(id, request.ManagerId.Value);
            if (!managerInTeam)
            {
                return BadRequest(new { error = "Manager must be a member of the same team" });
            }
        }

        // Validate role
        var validRoles = new[] { "CRR", "Manager", "HOD", "Admin" };
        if (!validRoles.Contains(request.RoleInTeam))
        {
            return BadRequest(new { error = "Invalid role. Must be CRR, Manager, HOD, or Admin" });
        }

        try
        {
            var teamMember = await _teamMemberRepo.AddMemberAsync(id, request.UserId, request.RoleInTeam, request.ManagerId);

            _logger.LogInformation("✓ Member added: {UserName} to Team '{TeamName}' as {Role}",
                user.FullName, team.Name, request.RoleInTeam);

            return Ok(new { success = true, memberId = teamMember.Id });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPut("{teamId}/members/{memberId}")]
    public async Task<IActionResult> UpdateMember(int teamId, int memberId, [FromBody] UpdateTeamMemberRequest request)
    {
        var member = await _teamMemberRepo.GetByIdAsync(memberId);
        if (member == null || member.TeamId != teamId)
        {
            return NotFound(new { error = "Team member not found" });
        }

        try
        {
            if (request.RoleInTeam != null)
            {
                var validRoles = new[] { "CRR", "Manager", "HOD", "Admin" };
                if (!validRoles.Contains(request.RoleInTeam))
                {
                    return BadRequest(new { error = "Invalid role. Must be CRR, Manager, HOD, or Admin" });
                }
                await _teamMemberRepo.UpdateMemberRoleAsync(memberId, request.RoleInTeam);
            }

            if (request.UpdateManager)
            {
                await _teamMemberRepo.UpdateManagerAsync(memberId, request.ManagerId);
            }

            return Ok(new { success = true });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("{teamId}/members/{userId}")]
    public async Task<IActionResult> RemoveMember(int teamId, int userId)
    {
        var member = await _teamMemberRepo.GetByTeamAndUserAsync(teamId, userId);
        if (member == null)
        {
            return NotFound(new { error = "Team member not found" });
        }

        var user = await _userRepo.GetByIdAsync(userId);
        var team = await _teamRepo.GetByIdAsync(teamId);

        await _teamMemberRepo.RemoveMemberAsync(teamId, userId);

        _logger.LogInformation("✓ Member removed: {UserName} from Team '{TeamName}'",
            user?.FullName ?? "Unknown", team?.Name ?? "Unknown");

        return Ok(new { success = true });
    }

    [HttpGet("{id}/tree")]
    public async Task<IActionResult> GetTeamHierarchy(int id)
    {
        var team = await _teamRepo.GetByIdAsync(id);
        if (team == null)
        {
            return NotFound(new { error = "Team not found" });
        }

        var members = await _teamMemberRepo.GetMembersByTeamAsync(id);

        // Build hierarchy tree
        var memberDtos = members.Select(m => new TeamHierarchyNodeDTO
        {
            Id = m.Id,
            UserId = m.UserId,
            FullName = m.User?.FullName ?? "",
            RoleInTeam = m.RoleInTeam,
            ManagerId = m.ManagerId,
            DirectReports = new List<TeamHierarchyNodeDTO>()
        }).ToList();

        // Build tree structure
        var memberMap = memberDtos.ToDictionary(m => m.UserId);
        var roots = new List<TeamHierarchyNodeDTO>();

        foreach (var member in memberDtos)
        {
            if (member.ManagerId.HasValue && memberMap.ContainsKey(member.ManagerId.Value))
            {
                memberMap[member.ManagerId.Value].DirectReports.Add(member);
            }
            else
            {
                roots.Add(member);
            }
        }

        return Ok(roots);
    }

}
