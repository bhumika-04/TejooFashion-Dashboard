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

    public async Task<Escalation> CreateEscalationAsync(
        int conversationId,
        int escalatedToUserId,
        int? escalatedFromUserId = null,
        string? reason = null,
        string priority = "Normal")
    {
        var escalation = new Escalation
        {
            ConversationId = conversationId,
            EscalatedFromUserId = escalatedFromUserId,
            EscalatedToUserId = escalatedToUserId,
            Reason = reason,
            Priority = priority,
            Status = "Pending",
            EscalatedAt = DateTime.UtcNow
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
