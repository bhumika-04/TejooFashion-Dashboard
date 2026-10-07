using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Repositories;

public class EscalationRepository
{
    private readonly DatabaseHelper _db;

    public EscalationRepository(DatabaseHelper db)
    {
        _db = db;
    }

    public async Task<Escalation?> GetByIdAsync(int id)
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM Escalations WHERE Id = @Id";
        return await conn.QueryFirstOrDefaultAsync<Escalation>(sql, new { Id = id });
    }

    public async Task<List<Escalation>> GetByConversationIdAsync(int conversationId)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT * FROM Escalations
            WHERE ConversationId = @ConversationId
            ORDER BY EscalatedAt DESC";

        var result = await conn.QueryAsync<Escalation>(sql, new { ConversationId = conversationId });
        return result.ToList();
    }

    public async Task<Escalation?> GetActiveEscalationAsync(int conversationId)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT TOP 1 * FROM Escalations
            WHERE ConversationId = @ConversationId
            AND Status IN ('Pending', 'InProgress')
            ORDER BY EscalatedAt DESC";

        return await conn.QueryFirstOrDefaultAsync<Escalation>(sql, new { ConversationId = conversationId });
    }

    /// <summary>Whether this conversation had an escalation (any status) whose Reason starts with the prefix since the given time.</summary>
    public async Task<bool> HasRecentWithReasonPrefixAsync(int conversationId, string reasonPrefix, DateTime sinceUtc)
    {
        using var conn = _db.CreateConnection();
        // Escape LIKE wildcards so a rule name containing % _ [ is matched literally.
        var pattern = reasonPrefix.Replace("[", "[[]").Replace("%", "[%]").Replace("_", "[_]") + "%";
        return await conn.ExecuteScalarAsync<int>(@"
            SELECT COUNT(1) FROM Escalations
            WHERE ConversationId = @ConversationId AND EscalatedAt >= @Since AND Reason LIKE @Pattern",
            new { ConversationId = conversationId, Since = sinceUtc, Pattern = pattern }) > 0;
    }

    public async Task<List<Escalation>> GetAllAsync(string? status = null, int? escalatedToUserId = null)
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM Escalations WHERE 1=1";

        if (!string.IsNullOrEmpty(status))
            sql += " AND Status = @Status";

        if (escalatedToUserId.HasValue)
            sql += " AND EscalatedToUserId = @EscalatedToUserId";

        sql += " ORDER BY EscalatedAt DESC";

        var result = await conn.QueryAsync<Escalation>(sql, new { Status = status, EscalatedToUserId = escalatedToUserId });
        return result.ToList();
    }

    // Single-query fetch of all escalations with joined data — avoids N+1
    public async Task<List<EscalationDetailRow>> GetAllWithDetailsAsync(string? status = null, int? escalatedToUserId = null)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT
                e.*,
                c.CustomerPhone, c.CustomerName, c.BusinessPhone,
                uto.FullName AS EscalatedToUserName,
                ufrom.FullName AS EscalatedFromUserName
            FROM Escalations e
            LEFT JOIN Conversations c ON e.ConversationId = c.Id
            LEFT JOIN Users uto ON e.EscalatedToUserId = uto.Id
            LEFT JOIN Users ufrom ON e.EscalatedFromUserId = ufrom.Id
            WHERE 1=1";

        if (!string.IsNullOrEmpty(status))
            sql += " AND e.Status = @Status";

        if (escalatedToUserId.HasValue)
            sql += " AND e.EscalatedToUserId = @EscalatedToUserId";

        sql += " ORDER BY e.EscalatedAt DESC";

        var result = await conn.QueryAsync<EscalationDetailRow>(sql, new { Status = status, EscalatedToUserId = escalatedToUserId });
        return result.ToList();
    }

    public async Task<int> CreateAsync(Escalation escalation)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            INSERT INTO Escalations
            (ConversationId, EscalatedFromUserId, EscalatedToUserId, Reason, Priority, Status,
             EscalatedAt, LastEscalatedAt, EscalationLevel)
            VALUES
            (@ConversationId, @EscalatedFromUserId, @EscalatedToUserId, @Reason, @Priority, @Status,
             @EscalatedAt, @LastEscalatedAt, @EscalationLevel);
            SELECT CAST(SCOPE_IDENTITY() as int);";

        return await conn.QuerySingleAsync<int>(sql, escalation);
    }

    public async Task<bool> UpdateAsync(Escalation escalation)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            UPDATE Escalations
            SET Status = @Status,
                ResolvedAt = @ResolvedAt,
                ResolutionNotes = @ResolutionNotes,
                Priority = @Priority
            WHERE Id = @Id";

        var rows = await conn.ExecuteAsync(sql, escalation);
        return rows > 0;
    }

    /// <summary>Transition status only (Pending → InProgress, etc.) — used by the dashboard's status buttons.</summary>
    public async Task<bool> UpdateStatusAsync(int id, string status)
    {
        using var conn = _db.CreateConnection();
        // Marking an escalation In Progress means someone has picked it up — restart its timeout
        // window so the matrix doesn't bump it away from them moments later.
        var rows = await conn.ExecuteAsync(@"
            UPDATE Escalations
            SET Status = @Status,
                LastEscalatedAt = CASE WHEN @Status = 'InProgress' THEN GETUTCDATE() ELSE LastEscalatedAt END
            WHERE Id = @Id",
            new { Id = id, Status = status });
        return rows > 0;
    }

    /// <summary>Reassign an open escalation to another user and reset the timeout clock (same level).</summary>
    public async Task<bool> ReassignAsync(int id, int newUserId)
    {
        using var conn = _db.CreateConnection();
        var rows = await conn.ExecuteAsync(
            "UPDATE Escalations SET EscalatedToUserId = @NewUserId, LastEscalatedAt = GETUTCDATE() WHERE Id = @Id",
            new { Id = id, NewUserId = newUserId });
        return rows > 0;
    }

    /// <summary>
    /// Resolves any active (Pending/InProgress) escalation on a conversation — called when the
    /// conversation is closed so the timeout matrix stops bumping/notifying on a closed conversation.
    /// Returns the number of escalations resolved.
    /// </summary>
    public async Task<int> ResolveActiveByConversationAsync(int conversationId, string? notes = null)
    {
        using var conn = _db.CreateConnection();
        return await conn.ExecuteAsync(@"
            UPDATE Escalations
            SET Status = 'Resolved',
                ResolvedAt = GETUTCDATE(),
                ResolutionNotes = @Notes
            WHERE ConversationId = @ConversationId AND Status IN ('Pending', 'InProgress')",
            new { ConversationId = conversationId, Notes = notes });
    }

    public async Task<bool> ResolveAsync(int id, string? resolutionNotes = null)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            UPDATE Escalations
            SET Status = 'Resolved',
                ResolvedAt = GETUTCDATE(),
                ResolutionNotes = @ResolutionNotes
            WHERE Id = @Id";

        var rows = await conn.ExecuteAsync(sql, new { Id = id, ResolutionNotes = resolutionNotes });
        return rows > 0;
    }

}

// Flat projection for escalation list view — avoids N+1 queries
public class EscalationDetailRow
{
    public int Id { get; set; }
    public int ConversationId { get; set; }
    public int? EscalatedFromUserId { get; set; }
    public int EscalatedToUserId { get; set; }
    public string? Reason { get; set; }
    public string Priority { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime EscalatedAt { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public string? ResolutionNotes { get; set; }
    public int EscalationLevel { get; set; } = 1;
    public DateTime? LastEscalatedAt { get; set; }
    // Joined fields
    public string? CustomerPhone { get; set; }
    public string? CustomerName { get; set; }
    public string? BusinessPhone { get; set; }
    public string EscalatedToUserName { get; set; } = string.Empty;
    public string? EscalatedFromUserName { get; set; }
}
