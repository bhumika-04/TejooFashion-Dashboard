using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Repositories;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/team-escalation-policies")]
public class TeamEscalationPoliciesController : ControllerBase
{
    private readonly TeamEscalationPolicyRepository _repo;
    private readonly TeamRepository _teams;

    public TeamEscalationPoliciesController(TeamEscalationPolicyRepository repo, TeamRepository teams)
    {
        _repo = repo;
        _teams = teams;
    }

    // GET /api/team-escalation-policies — list all teams with their policies
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var allTeams  = await _teams.GetAllAsync();
        var policies  = (await _repo.GetAllAsync()).ToDictionary(p => p.TeamId);

        var result = allTeams.Select(t => new
        {
            teamId   = t.Id,
            teamName = t.Name,
            policy   = policies.TryGetValue(t.Id, out var p) ? p : new TeamEscalationPolicy
            {
                TeamId                = t.Id,
                CrrTimeoutMinutes     = 30,
                ManagerTimeoutMinutes = 60,
                HodTimeoutMinutes     = 120,
                IsActive              = true,
            }
        });

        return Ok(result);
    }

    // PUT /api/team-escalation-policies/{teamId}
    [HttpPut("{teamId:int}")]
    public async Task<IActionResult> Upsert(int teamId, [FromBody] UpsertPolicyRequest req)
    {
        await _repo.UpsertAsync(teamId, req.CrrTimeoutMinutes, req.ManagerTimeoutMinutes, req.HodTimeoutMinutes, req.IsActive);
        return Ok(new { success = true });
    }
}

public record UpsertPolicyRequest(int CrrTimeoutMinutes, int ManagerTimeoutMinutes, int HodTimeoutMinutes, bool IsActive);
