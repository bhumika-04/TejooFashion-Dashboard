using System.Security.Claims;
using TejooWhatsApp.Repositories;

namespace TejooWhatsApp.Security;

/// <summary>
/// Which agents' conversations the caller may see or act on — the single rule every endpoint and
/// the real-time hub use, so reading and acting on a chat are gated identically:
///   Admin       → everything (null);
///   CRR/Agent   → only their own (a malformed token resolves to {-1}, matching nothing);
///   Manager/HOD → themselves plus every member of their team(s).
/// </summary>
public class VisibilityService
{
    private readonly ITeamMemberRepository _teamMembers;
    private readonly ConversationRepository _conversations;

    public VisibilityService(ITeamMemberRepository teamMembers, ConversationRepository conversations)
    {
        _teamMembers = teamMembers;
        _conversations = conversations;
    }

    /// <summary>Visible assigned-user ids (null = all). <paramref name="requested"/> narrows within that set.</summary>
    public async Task<List<int>?> VisibleUserIdsAsync(ClaimsPrincipal user, int? requested = null)
    {
        var uid = PageAccessService.UserIdOf(user) ?? -1;

        List<int>? visible;
        if (PageAccessService.IsAdmin(user))
            visible = null;
        else if (PageAccessService.IsAgentRole(user))
            visible = new List<int> { uid };
        else
        {
            var ids = new HashSet<int> { uid };
            foreach (var membership in await _teamMembers.GetMembershipsByUserAsync(uid))
                foreach (var member in await _teamMembers.GetMembersByTeamAsync(membership.TeamId))
                    ids.Add(member.UserId);
            visible = ids.ToList();
        }

        if (requested.HasValue)
        {
            if (visible == null) return new List<int> { requested.Value };
            return visible.Contains(requested.Value) ? new List<int> { requested.Value } : visible;
        }
        return visible;
    }

    public async Task<bool> CanSeeAssigneeAsync(ClaimsPrincipal user, int assignedUserId)
    {
        var visible = await VisibleUserIdsAsync(user);
        return visible == null || visible.Contains(assignedUserId);
    }

    /// <summary>True when the conversation exists and the caller may see/act on it.</summary>
    public async Task<bool> CanAccessConversationAsync(ClaimsPrincipal user, int conversationId)
    {
        var conversation = await _conversations.GetByIdAsync(conversationId);
        return conversation != null && await CanSeeAssigneeAsync(user, conversation.AssignedUserId);
    }
}
