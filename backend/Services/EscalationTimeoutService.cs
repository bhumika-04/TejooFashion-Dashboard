using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Repositories;
using Microsoft.Extensions.DependencyInjection;

namespace TejooWhatsApp.Services;

/// <summary>
/// Runs every 5 minutes. Checks pending escalations for timeout and bumps them
/// up the chain: CRR → Manager → HOD.
/// </summary>
public class EscalationTimeoutService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<EscalationTimeoutService> _logger;
    private static readonly TimeSpan _interval = TimeSpan.FromMinutes(5);

    public EscalationTimeoutService(IServiceScopeFactory scopeFactory, ILogger<EscalationTimeoutService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("EscalationTimeoutService started — checking every {Interval} minutes.", _interval.TotalMinutes);
        await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken); // staggered startup

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await ProcessTimedOutEscalationsAsync(); }
            catch (Exception ex) { _logger.LogError(ex, "Error in EscalationTimeoutService."); }
            await Task.Delay(_interval, stoppingToken);
        }
    }

    private async Task ProcessTimedOutEscalationsAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var policyRepo       = scope.ServiceProvider.GetRequiredService<TeamEscalationPolicyRepository>();
        var escalationRepo   = scope.ServiceProvider.GetRequiredService<EscalationRepository>();
        var userRepo         = scope.ServiceProvider.GetRequiredService<UserRepository>();
        var teamMemberRepo   = scope.ServiceProvider.GetRequiredService<ITeamMemberRepository>();
        var notificationSvc  = scope.ServiceProvider.GetRequiredService<NotificationService>();

        var timedOut = (await policyRepo.GetTimedOutEscalationsAsync()).ToList();
        if (!timedOut.Any()) return;

        _logger.LogInformation("EscalationTimeoutService: {Count} escalation(s) need level bump.", timedOut.Count);

        foreach (var esc in timedOut)
        {
            // Level 3 (HOD) timed out → no more escalation, just re-notify HOD with CRITICAL priority
            if (esc.EscalationLevel >= 3)
            {
                _logger.LogWarning("CRITICAL: Escalation #{Id} at HOD level for {Phone} — unresolved after {Min} minutes.",
                    esc.EscalationId, esc.CustomerPhone, esc.HodTimeoutMinutes);
                await notificationSvc.NotifyEscalationAsync(
                    esc.EscalatedToUserId, esc.EscalationId, esc.ConversationId,
                    esc.CustomerPhone,
                    "CRITICAL — This escalation has exceeded all timeout thresholds and remains unresolved.",
                    "High");
                await policyRepo.BumpEscalationLevelAsync(esc.EscalationId, esc.EscalatedToUserId, 3); // reset timer
                continue;
            }

            var nextLevel = esc.EscalationLevel + 1; // 1→2→3
            var targetRole = nextLevel == 2 ? "Manager" : "HOD";

            // Find the next user in the chain for this team
            var nextUser = await FindNextLevelUserAsync(userRepo, teamMemberRepo, esc.TeamId, targetRole);
            if (nextUser == null)
            {
                _logger.LogWarning("No {Role} found for escalation {Id} (Team {TeamId}) — staying at current level.",
                    targetRole, esc.EscalationId, esc.TeamId);
                continue;
            }

            await policyRepo.BumpEscalationLevelAsync(esc.EscalationId, nextUser.Id, nextLevel);

            // Notify the new assignee
            await notificationSvc.NotifyEscalationAsync(
                nextUser.Id, esc.EscalationId, esc.ConversationId,
                esc.CustomerPhone,
                $"Escalated to {targetRole} — CRR did not respond in time",
                nextLevel == 3 ? "High" : "Normal");

            _logger.LogInformation(
                "Escalation #{Id} bumped to Level {Level} ({Role}: {Name}) for conversation #{ConvId}.",
                esc.EscalationId, nextLevel, targetRole, nextUser.FullName, esc.ConversationId);
        }
    }

    private static async Task<User?> FindNextLevelUserAsync(UserRepository userRepo, ITeamMemberRepository teamMemberRepo, int? teamId, string role)
    {
        // Prefer a user with the target role in the same team
        if (teamId.HasValue)
        {
            var teamMembers = await teamMemberRepo.GetMembersByTeamAsync(teamId.Value);
            var inTeam = teamMembers
                .Where(m => m.IsActive)
                .FirstOrDefault(m => string.Equals(m.RoleInTeam, role, StringComparison.OrdinalIgnoreCase));

            if (inTeam != null) return await userRepo.GetByIdAsync(inTeam.UserId);
        }

        // Fallback: any active user with that role across all teams
        var allWithRole = await userRepo.GetByRoleAsync(role);
        return allWithRole.FirstOrDefault(u => u.IsActive);
    }
}
