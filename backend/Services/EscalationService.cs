using TejooWhatsApp.Models.DTOs;
using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Repositories;
using Microsoft.Extensions.Logging;

namespace TejooWhatsApp.Services;

public class EscalationService
{
    private readonly EscalationRepository _escalationRepo;
    private readonly ConversationRepository _conversationRepo;
    private readonly UserRepository _userRepo;
    private readonly ITeamMemberRepository _teamMemberRepo;
    private readonly NotificationService _notificationService;
    private readonly ILogger<EscalationService> _logger;

    public EscalationService(
        EscalationRepository escalationRepo,
        ConversationRepository conversationRepo,
        UserRepository userRepo,
        ITeamMemberRepository teamMemberRepo,
        NotificationService notificationService,
        ILogger<EscalationService> logger)
    {
        _escalationRepo = escalationRepo;
        _conversationRepo = conversationRepo;
        _userRepo = userRepo;
        _teamMemberRepo = teamMemberRepo;
        _notificationService = notificationService;
        _logger = logger;
    }

    /// <summary>Maps a user's role to the matching escalation-ladder rung (CRR=1, Manager=2, HOD=3),
    /// so escalations created for a given person start the timeout matrix at the correct level.</summary>
    public static int LevelForRole(string? role) => role switch { "HOD" => 3, "Manager" => 2, _ => 1 };

    public async Task<Escalation> CreateEscalationAsync(
        int conversationId,
        int escalatedToUserId,
        int? escalatedFromUserId = null,
        string? reason = null,
        string priority = "Normal",
        int escalationLevel = 1)
    {
        var escalation = new Escalation
        {
            ConversationId = conversationId,
            EscalatedFromUserId = escalatedFromUserId,
            EscalatedToUserId = escalatedToUserId,
            Reason = reason,
            Priority = priority,
            Status = "Pending",
            EscalatedAt = DateTime.UtcNow,
            LastEscalatedAt = DateTime.UtcNow,   // starts the timeout clock for the matrix
            EscalationLevel = escalationLevel
        };

        escalation.Id = await _escalationRepo.CreateAsync(escalation);

        // Update conversation status
        var conversation = await _conversationRepo.GetByIdAsync(conversationId);
        if (conversation != null)
        {
            conversation.Status = "Escalated";
            conversation.AssignedUserId = escalatedToUserId;
            await _conversationRepo.UpdateAsync(conversation);
        }

        var escalatedToUser = await _userRepo.GetByIdAsync(escalatedToUserId);
        _logger.LogInformation("✓ Escalation created: Conversation #{ConversationId} escalated to {UserName} (Priority: {Priority})",
            conversationId, escalatedToUser?.FullName ?? "Unknown", priority);

        // Notify the assigned agent in real-time
        if (conversation != null)
        {
            await _notificationService.NotifyEscalationAsync(
                escalatedToUserId, escalation.Id, conversationId,
                conversation.CustomerPhone, reason ?? "Escalated conversation", priority);
        }

        return escalation;
    }

    /// <summary>
    /// Manually escalate a conversation from the dashboard: picks the next person up the chain from
    /// whoever it's currently assigned to, creates a real escalation record (starting at the rung that
    /// matches that person's role so the timeout matrix bumps correctly), and marks it Escalated.
    /// </summary>
    public async Task<(Escalation? Escalation, string? TargetName, string? Error)> EscalateConversationAsync(
        int conversationId, int? escalatedFromUserId, string? reason, string priority = "Normal")
    {
        var conversation = await _conversationRepo.GetByIdAsync(conversationId);
        if (conversation == null) return (null, null, "Conversation not found");

        // Don't stack duplicate escalations on the same conversation.
        var existing = await _escalationRepo.GetActiveEscalationAsync(conversationId);
        if (existing != null)
            return (null, null, "This conversation already has an active escalation.");

        var currentUserId = conversation.AssignedUserId;
        var nextUser = await GetNextEscalationUserAsync(currentUserId);
        if (nextUser == null)
            return (null, null, "No escalation target available — add a manager/HOD or assign the conversation first.");

        // Start at the ladder rung matching the target's role so the timeout service bumps correctly.
        var level = LevelForRole(nextUser.Role);

        var escalation = await CreateEscalationAsync(
            conversationId,
            nextUser.Id,
            escalatedFromUserId: currentUserId > 0 ? currentUserId : escalatedFromUserId,
            reason: string.IsNullOrWhiteSpace(reason) ? "Manually escalated by agent" : reason,
            priority: priority,
            escalationLevel: level);

        return (escalation, nextUser.FullName, null);
    }

    public async Task<bool> ResolveEscalationAsync(int escalationId, string? resolutionNotes = null)
    {
        var escalation = await _escalationRepo.GetByIdAsync(escalationId);
        var result = await _escalationRepo.ResolveAsync(escalationId, resolutionNotes);

        if (result)
        {
            if (escalation != null)
            {
                // Update conversation status back to Open
                await _conversationRepo.UpdateStatusAsync(escalation.ConversationId, "Open");

                _logger.LogInformation("✓ Escalation resolved: Escalation #{EscalationId} for Conversation #{ConversationId}",
                    escalationId, escalation.ConversationId);
            }
        }

        return result;
    }

    public async Task<List<EscalationDTO>> GetAllEscalationsAsync(string? status = null, int? escalatedToUserId = null)
    {
        var rows = await _escalationRepo.GetAllWithDetailsAsync(status, escalatedToUserId);

        return rows.Select(row => new EscalationDTO
        {
            Id = row.Id,
            ConversationId = row.ConversationId,
            EscalatedFromUserName = row.EscalatedFromUserName,
            EscalatedToUserName = row.EscalatedToUserName,
            Reason = row.Reason,
            Priority = row.Priority,
            Status = row.Status,
            EscalatedAt = row.EscalatedAt,
            ResolvedAt = row.ResolvedAt,
            ResolutionNotes = row.ResolutionNotes,
            CustomerPhone = row.CustomerPhone ?? "",
            CustomerName = row.CustomerName,
            BusinessPhone = row.BusinessPhone ?? ""
        }).ToList();
    }

    public async Task<User?> GetNextEscalationUserAsync(int currentUserId, int? teamId = null)
    {
        // Try the normal hierarchy chain when we have a real assigned user
        if (currentUserId > 0)
        {
            var hierarchyResult = await TryGetFromHierarchyAsync(currentUserId, teamId);
            if (hierarchyResult != null) return hierarchyResult;
        }

        // Final fallback: unassigned conversation, user not in a team, or hierarchy exhausted —
        // pick any available active Manager or CRR so the escalation is never silently dropped.
        var fallback = await _userRepo.GetFirstAvailableAgentAsync();
        if (fallback == null)
            _logger.LogWarning("GetNextEscalationUserAsync: no available agent found for fallback escalation.");
        return fallback;
    }

    private async Task<User?> TryGetFromHierarchyAsync(int currentUserId, int? teamId)
    {
        var currentUser = await _userRepo.GetByIdAsync(currentUserId);
        if (currentUser == null) return null;

        // Resolve team from user's active memberships if not provided
        if (!teamId.HasValue)
        {
            var memberships = await _teamMemberRepo.GetMembershipsByUserAsync(currentUserId);
            if (!memberships.Any()) return null;
            teamId = memberships.First().TeamId;
        }

        var currentMembership = await _teamMemberRepo.GetByTeamAndUserAsync(teamId.Value, currentUserId);
        if (currentMembership == null) return null;

        // 1. Follow explicit ManagerId chain
        if (currentMembership.ManagerId.HasValue)
        {
            var manager = await _userRepo.GetByIdAsync(currentMembership.ManagerId.Value);
            if (manager != null && manager.IsActive) return manager;
        }

        // 2. Role-based escalation within the same team
        var teamMembers = await _teamMemberRepo.GetMembersByTeamAsync(teamId.Value);
        var nextLevelMember = currentMembership.RoleInTeam switch
        {
            "CRR"     => teamMembers.FirstOrDefault(tm => tm.RoleInTeam == "Manager" && tm.IsActive),
            "Manager" => teamMembers.FirstOrDefault(tm => tm.RoleInTeam == "HOD"     && tm.IsActive),
            "HOD"     => teamMembers.FirstOrDefault(tm => tm.RoleInTeam == "Admin"   && tm.IsActive),
            _         => null
        };

        return nextLevelMember?.User;
    }
}
