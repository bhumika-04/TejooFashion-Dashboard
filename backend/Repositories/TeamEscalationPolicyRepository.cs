using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Repositories;

public class TeamEscalationPolicy
{
    public int Id { get; set; }
    public int TeamId { get; set; }
    public string? TeamName { get; set; }
    public int CrrTimeoutMinutes { get; set; } = 30;
    public int ManagerTimeoutMinutes { get; set; } = 60;
    public int HodTimeoutMinutes { get; set; } = 120;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class PendingTimeoutEscalation
{
    public int EscalationId { get; set; }
    public int ConversationId { get; set; }
    public int EscalatedToUserId { get; set; }
    public string EscalatedToRole { get; set; } = string.Empty;
    public int EscalationLevel { get; set; }
    public DateTime LastEscalatedAt { get; set; }
    public string CustomerPhone { get; set; } = string.Empty;
    public int? TeamId { get; set; }
    public int CrrTimeoutMinutes { get; set; }
    public int ManagerTimeoutMinutes { get; set; }
    public int HodTimeoutMinutes { get; set; }
}

public class TeamEscalationPolicyRepository
{
    private readonly DatabaseHelper _db;
    public TeamEscalationPolicyRepository(DatabaseHelper db) => _db = db;

    public async Task<IEnumerable<TeamEscalationPolicy>> GetAllAsync()
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<TeamEscalationPolicy>(@"
            SELECT tep.*, t.Name AS TeamName
            FROM TeamEscalationPolicies tep
            JOIN Teams t ON t.Id = tep.TeamId
            ORDER BY t.Name");
    }

    public async Task<TeamEscalationPolicy?> GetByTeamIdAsync(int teamId)
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryFirstOrDefaultAsync<TeamEscalationPolicy>(
            "SELECT tep.*, t.Name AS TeamName FROM TeamEscalationPolicies tep JOIN Teams t ON t.Id = tep.TeamId WHERE tep.TeamId = @TeamId",
            new { TeamId = teamId });
    }

    public async Task UpsertAsync(int teamId, int crrMinutes, int managerMinutes, int hodMinutes, bool isActive)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync(@"
            MERGE TeamEscalationPolicies AS target
            USING (SELECT @TeamId AS TeamId) AS source ON target.TeamId = source.TeamId
            WHEN MATCHED THEN
                UPDATE SET CrrTimeoutMinutes = @CrrMinutes,
                           ManagerTimeoutMinutes = @ManagerMinutes,
                           HodTimeoutMinutes = @HodMinutes,
                           IsActive = @IsActive,
                           UpdatedAt = GETUTCDATE()
            WHEN NOT MATCHED THEN
                INSERT (TeamId, CrrTimeoutMinutes, ManagerTimeoutMinutes, HodTimeoutMinutes, IsActive)
                VALUES (@TeamId, @CrrMinutes, @ManagerMinutes, @HodMinutes, @IsActive);",
            new { TeamId = teamId, CrrMinutes = crrMinutes, ManagerMinutes = managerMinutes, HodMinutes = hodMinutes, IsActive = isActive });
    }

    // Find escalations that have exceeded their level timeout and need to be bumped
    public async Task<IEnumerable<PendingTimeoutEscalation>> GetTimedOutEscalationsAsync()
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<PendingTimeoutEscalation>(@"
            SELECT
                e.Id AS EscalationId,
                e.ConversationId,
                e.EscalatedToUserId,
                u.Role AS EscalatedToRole,
                e.EscalationLevel,
                e.LastEscalatedAt,
                c.CustomerPhone,
                tm.TeamId,
                COALESCE(tep.CrrTimeoutMinutes, 30)     AS CrrTimeoutMinutes,
                COALESCE(tep.ManagerTimeoutMinutes, 60)  AS ManagerTimeoutMinutes,
                COALESCE(tep.HodTimeoutMinutes, 120)     AS HodTimeoutMinutes
            FROM Escalations e
            JOIN Conversations c ON c.Id = e.ConversationId
            JOIN Users u ON u.Id = e.EscalatedToUserId
            LEFT JOIN TeamMembers tm ON tm.UserId = e.EscalatedToUserId AND tm.IsActive = 1
            LEFT JOIN TeamEscalationPolicies tep ON tep.TeamId = tm.TeamId AND tep.IsActive = 1
            WHERE e.Status IN ('Pending', 'InProgress')
              AND e.EscalationLevel <= 3
              -- A team whose policy is switched OFF doesn't escalate at all (defaults apply only
              -- when the team has no policy row).
              AND NOT EXISTS (SELECT 1 FROM TeamEscalationPolicies off
                              WHERE off.TeamId = tm.TeamId AND off.IsActive = 0)
              AND (
                  -- Level 1 (CRR) timeout → bump to Manager
                  (e.EscalationLevel = 1
                   AND DATEDIFF(MINUTE, e.LastEscalatedAt, GETUTCDATE()) >= COALESCE(tep.CrrTimeoutMinutes, 30))
                  OR
                  -- Level 2 (Manager) timeout → bump to HOD
                  (e.EscalationLevel = 2
                   AND DATEDIFF(MINUTE, e.LastEscalatedAt, GETUTCDATE()) >= COALESCE(tep.ManagerTimeoutMinutes, 60))
                  OR
                  -- Level 3 (HOD) timeout → no more escalation, auto-flag as critically overdue
                  (e.EscalationLevel = 3
                   AND DATEDIFF(MINUTE, e.LastEscalatedAt, GETUTCDATE()) >= COALESCE(tep.HodTimeoutMinutes, 120))
              )");
    }

    public async Task BumpEscalationLevelAsync(int escalationId, int newUserId, int newLevel)
    {
        using var conn = _db.CreateConnection();
        // The conversation follows its escalation — same as manual escalation and reassignment —
        // so the new Manager/HOD actually sees the chat in their list.
        await conn.ExecuteAsync(@"
            UPDATE Escalations
            SET EscalatedToUserId = @NewUserId,
                EscalationLevel   = @NewLevel,
                LastEscalatedAt   = GETUTCDATE(),
                Status            = 'Pending'
            WHERE Id = @Id;
            UPDATE c SET c.AssignedUserId = @NewUserId
            FROM Conversations c JOIN Escalations e ON e.ConversationId = c.Id
            WHERE e.Id = @Id AND c.Status <> 'Closed';",
            new { Id = escalationId, NewUserId = newUserId, NewLevel = newLevel });
    }
}
