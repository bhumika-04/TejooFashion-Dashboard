using Dapper;
using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Repositories;

public class ConversationRepository
{
    private readonly DatabaseHelper _db;

    public ConversationRepository(DatabaseHelper db)
    {
        _db = db;
    }

    public async Task<Conversation?> GetByIdAsync(int id)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT * FROM Conversations WHERE Id = @Id";
        return await conn.QueryFirstOrDefaultAsync<Conversation>(sql, new { Id = id });
    }

    public async Task<Conversation?> GetBySessionAndCustomerAsync(int sessionId, string customerPhone)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT * FROM Conversations
            WHERE SessionId = @SessionId AND CustomerPhone = @CustomerPhone
            ORDER BY CreatedAt DESC";
        return await conn.QueryFirstOrDefaultAsync<Conversation>(sql, new { SessionId = sessionId, CustomerPhone = customerPhone });
    }

    public async Task<List<Conversation>> GetAllAsync(string? status = null, int? assignedUserId = null)
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM Conversations WHERE 1=1";

        if (!string.IsNullOrEmpty(status))
            sql += " AND Status = @Status";

        if (assignedUserId.HasValue)
            sql += " AND AssignedUserId = @AssignedUserId";

        sql += " ORDER BY CASE WHEN LastMessageAt IS NULL THEN 1 ELSE 0 END, LastMessageAt DESC, CreatedAt DESC";

        var result = await conn.QueryAsync<Conversation>(sql, new { Status = status, AssignedUserId = assignedUserId });
        return result.ToList();
    }

    // Returns conversations joined with last message content — avoids N+1 for list views
    public async Task<List<ConversationListRow>> GetAllWithLastMessageAsync(
        string? status = null,
        int? assignedUserId = null,
        int? sessionId = null,
        int limit = 100,
        int offset = 0)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT
                c.*,
                u.FullName AS AssignedUserName,
                s.DisplayName AS SessionDisplayName,
                s.PhoneNumber AS SessionPhoneNumber,
                m.Content AS LastMessageContent,
                CAST(CASE WHEN EXISTS (
                    SELECT 1 FROM Messages WHERE ConversationId = c.Id AND IsAiGenerated = 1
                ) THEN 1 ELSE 0 END AS BIT) AS HasAiMessages
            FROM Conversations c
            LEFT JOIN Users u ON c.AssignedUserId = u.Id
            LEFT JOIN WhatsAppSessions s ON c.SessionId = s.Id
            LEFT JOIN Messages m ON m.Id = (
                SELECT TOP 1 Id FROM Messages
                WHERE ConversationId = c.Id
                ORDER BY CreatedAt DESC
            )
            WHERE 1=1";

        if (!string.IsNullOrEmpty(status))
            sql += " AND c.Status = @Status";

        if (assignedUserId.HasValue)
            sql += " AND c.AssignedUserId = @AssignedUserId";

        if (sessionId.HasValue)
            sql += " AND c.SessionId = @SessionId";

        sql += @" ORDER BY CASE WHEN c.LastMessageAt IS NULL THEN 1 ELSE 0 END, c.LastMessageAt DESC, c.CreatedAt DESC
                  OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY";

        var result = await conn.QueryAsync<ConversationListRow>(sql,
            new { Status = status, AssignedUserId = assignedUserId, SessionId = sessionId, Offset = offset, Limit = limit });
        return result.ToList();
    }

    public async Task<int> CreateAsync(Conversation conversation)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            INSERT INTO Conversations
            (SessionId, AssignedUserId, CustomerPhone, CustomerName, BusinessPhone, Status, Priority, LastMessageAt, CreatedAt)
            VALUES
            (@SessionId, @AssignedUserId, @CustomerPhone, @CustomerName, @BusinessPhone, @Status, @Priority, @LastMessageAt, @CreatedAt);
            SELECT CAST(SCOPE_IDENTITY() as int);";

        return await conn.QuerySingleAsync<int>(sql, conversation);
    }

    public async Task<bool> UpdateAsync(Conversation conversation)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            UPDATE Conversations
            SET SessionId = @SessionId,
                AssignedUserId = @AssignedUserId,
                CustomerPhone = @CustomerPhone,
                CustomerName = @CustomerName,
                BusinessPhone = @BusinessPhone,
                Status = @Status,
                Priority = @Priority,
                LastMessageAt = @LastMessageAt,
                ClosedAt = @ClosedAt
            WHERE Id = @Id";

        var rows = await conn.ExecuteAsync(sql, conversation);
        return rows > 0;
    }

    public async Task<bool> UpdateStatusAsync(int id, string status)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            UPDATE Conversations
            SET Status = @Status,
                ClosedAt = CASE WHEN @Status = 'Closed' THEN GETUTCDATE() ELSE NULL END
            WHERE Id = @Id";

        var rows = await conn.ExecuteAsync(sql, new { Id = id, Status = status });
        return rows > 0;
    }

    public async Task UpdateLastMessageAtAsync(int conversationId)
    {
        using var conn = _db.CreateConnection();
        var sql = "UPDATE Conversations SET LastMessageAt = GETUTCDATE() WHERE Id = @Id";
        await conn.ExecuteAsync(sql, new { Id = conversationId });
    }

    public async Task<bool> UpdateAssignedUserAsync(int conversationId, int assignedUserId)
    {
        using var conn = _db.CreateConnection();
        var sql = "UPDATE Conversations SET AssignedUserId = @AssignedUserId WHERE Id = @Id";
        var rows = await conn.ExecuteAsync(sql, new { Id = conversationId, AssignedUserId = assignedUserId });
        return rows > 0;
    }

    public async Task<List<ConversationListRow>> SearchAsync(string query, int limit = 30, int? assignedUserId = null)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT TOP (@Limit)
                c.*,
                u.FullName AS AssignedUserName,
                s.DisplayName AS SessionDisplayName,
                s.PhoneNumber AS SessionPhoneNumber,
                m.Content AS LastMessageContent
            FROM Conversations c
            LEFT JOIN Users u ON c.AssignedUserId = u.Id
            LEFT JOIN WhatsAppSessions s ON c.SessionId = s.Id
            LEFT JOIN Messages m ON m.Id = (
                SELECT TOP 1 Id FROM Messages
                WHERE ConversationId = c.Id
                ORDER BY CreatedAt DESC
            )
            WHERE (c.CustomerPhone LIKE @Query OR c.CustomerName LIKE @Query)
              AND (@AssignedUserId IS NULL OR c.AssignedUserId = @AssignedUserId)
            ORDER BY c.LastMessageAt DESC, c.CreatedAt DESC";

        var result = await conn.QueryAsync<ConversationListRow>(sql,
            new { Query = $"%{query}%", Limit = limit, AssignedUserId = assignedUserId });
        return result.ToList();
    }

    public async Task<bool> DeleteAsync(int id)
    {
        using var conn = _db.CreateConnection();
        var sql = "DELETE FROM Conversations WHERE Id = @Id";
        var rows = await conn.ExecuteAsync(sql, new { Id = id });
        return rows > 0;
    }

    public async Task<IEnumerable<ConversationListRow>> GetByCustomerPhoneAsync(string phone)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT
                c.*,
                u.FullName AS AssignedUserName,
                s.DisplayName AS SessionDisplayName,
                s.PhoneNumber AS SessionPhoneNumber,
                (SELECT TOP 1 Content FROM Messages WHERE ConversationId = c.Id ORDER BY CreatedAt DESC) AS LastMessageContent,
                (SELECT COUNT(*) FROM Messages WHERE ConversationId = c.Id) AS MessageCount,
                ISNULL(
                    (SELECT STRING_AGG(t.Name + '|' + t.Color, ';;')
                     FROM ConversationTags ct
                     JOIN Tags t ON ct.TagId = t.Id
                     WHERE ct.ConversationId = c.Id), ''
                ) AS TagsRaw,
                (SELECT TOP 1 SummaryText
                 FROM ConversationSummaries WHERE ConversationId = c.Id
                 ORDER BY LastUpdatedAt DESC) AS SummaryText
            FROM Conversations c
            LEFT JOIN Users u ON c.AssignedUserId = u.Id
            LEFT JOIN WhatsAppSessions s ON c.SessionId = s.Id
            WHERE c.CustomerPhone = @Phone
            ORDER BY c.LastMessageAt DESC";
        return await conn.QueryAsync<ConversationListRow>(sql, new { Phone = phone });
    }
}

// Flat projection for list view — avoids N+1 queries
public class ConversationListRow
{
    public int Id { get; set; }
    public int SessionId { get; set; }
    public int AssignedUserId { get; set; }
    public string CustomerPhone { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public string BusinessPhone { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Priority { get; set; } = string.Empty;
    public DateTime? LastMessageAt { get; set; }
    public DateTime? ClosedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public string AssignedUserName { get; set; } = string.Empty;
    public string? SessionDisplayName { get; set; }
    public string? SessionPhoneNumber { get; set; }
    public string? LastMessageContent { get; set; }
    public int MessageCount { get; set; }
    public string? TagsRaw { get; set; }     // "Name|Color;;Name2|Color2"
    public string? SummaryText { get; set; }
    public bool HasAiMessages { get; set; }
}
