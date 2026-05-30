using Dapper;
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
            (ConversationId, EscalatedFromUserId, EscalatedToUserId, Reason, Priority, Status, EscalatedAt)
            VALUES
            (@ConversationId, @EscalatedFromUserId, @EscalatedToUserId, @Reason, @Priority, @Status, @EscalatedAt);
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

    public async Task<int> GetPendingCountAsync()
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT COUNT(*) FROM Escalations WHERE Status = 'Pending'";
        return await conn.ExecuteScalarAsync<int>(sql);
    }

    public async Task<int> GetResolvedCountAsync()
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT COUNT(*) FROM Escalations WHERE Status = 'Resolved'";
        return await conn.ExecuteScalarAsync<int>(sql);
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
    // Joined fields
    public string? CustomerPhone { get; set; }
    public string? CustomerName { get; set; }
    public string? BusinessPhone { get; set; }
    public string EscalatedToUserName { get; set; } = string.Empty;
    public string? EscalatedFromUserName { get; set; }
}
