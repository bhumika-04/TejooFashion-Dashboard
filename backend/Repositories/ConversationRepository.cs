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

    // Returns conversations joined with last message content — avoids N+1 for list views
    public async Task<List<ConversationListRow>> GetAllWithLastMessageAsync(
        string? status = null,
        IReadOnlyList<int>? assignedUserIds = null,
        int? sessionId = null,
        int limit = 100,
        int offset = 0,
        int? viewerUserId = null,
        int? tagId = null)
    {
        using var conn = _db.CreateConnection();
        // IsUnread = the conversation has an inbound message newer than the viewer's last view
        // (or never viewed). Per-user via ConversationViews.
        var sql = @"
            SELECT
                c.*,
                u.FullName AS AssignedUserName,
                s.DisplayName AS SessionDisplayName,
                s.PhoneNumber AS SessionPhoneNumber,
                m.Content AS LastMessageContent,
                CAST(CASE WHEN EXISTS (
                    SELECT 1 FROM Messages WHERE ConversationId = c.Id AND IsAiGenerated = 1
                ) THEN 1 ELSE 0 END AS BIT) AS HasAiMessages,
                CAST(CASE WHEN @ViewerUserId IS NOT NULL AND c.Status <> 'Closed' AND EXISTS (
                    SELECT 1 FROM Messages mi
                    WHERE mi.ConversationId = c.Id AND mi.Direction = 'inbound'
                      AND mi.CreatedAt > ISNULL(cv.LastViewedAt, '1900-01-01')
                ) THEN 1 ELSE 0 END AS BIT) AS IsUnread
            FROM Conversations c
            LEFT JOIN Users u ON c.AssignedUserId = u.Id
            LEFT JOIN WhatsAppSessions s ON c.SessionId = s.Id
            LEFT JOIN ConversationViews cv ON cv.ConversationId = c.Id AND cv.UserId = @ViewerUserId
            LEFT JOIN Messages m ON m.Id = (
                SELECT TOP 1 Id FROM Messages
                WHERE ConversationId = c.Id
                ORDER BY CreatedAt DESC
            )
            WHERE 1=1";

        if (!string.IsNullOrEmpty(status))
            sql += " AND c.Status = @Status";

        // null = no user filter (Admin sees all); otherwise scope to the caller's visible user set.
        if (assignedUserIds != null)
            sql += " AND c.AssignedUserId IN @AssignedUserIds";

        if (sessionId.HasValue)
            sql += " AND c.SessionId = @SessionId";

        // A saved "view" = filter to one tag. Match either a conversation tag on the chat
        // itself, or a customer tag on the chat's customer (e.g. "VIP" tagged on the customer).
        if (tagId.HasValue)
            sql += @" AND (
                EXISTS (SELECT 1 FROM ConversationTags ctag
                        WHERE ctag.ConversationId = c.Id AND ctag.TagId = @TagId)
                OR EXISTS (SELECT 1 FROM CustomerTags cust
                           JOIN Customers cu ON cu.Id = cust.CustomerId
                           WHERE cu.Phone = c.CustomerPhone AND cust.TagId = @TagId))";

        sql += @" ORDER BY CASE WHEN c.LastMessageAt IS NULL THEN 1 ELSE 0 END, c.LastMessageAt DESC, c.CreatedAt DESC
                  OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY";

        var result = await conn.QueryAsync<ConversationListRow>(sql,
            new { Status = status, AssignedUserIds = assignedUserIds, SessionId = sessionId, Offset = offset, Limit = limit, ViewerUserId = viewerUserId, TagId = tagId });
        return result.ToList();
    }

    /// <summary>
    /// Open conversations assigned to <paramref name="userId"/> that are awaiting the agent's reply
    /// PAST the session's First-Response SLA: the last message is inbound, there is no outbound after
    /// it, and the wait already exceeds the session's SlaMinutes. Longest-waiting first.
    /// </summary>
    public async Task<List<SlaBreachRow>> GetSlaBreachesForUserAsync(int userId)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT c.Id, c.CustomerName, c.CustomerPhone, c.SessionId,
                   s.PhoneNumber AS SessionPhoneNumber,
                   li.LastInboundAt,
                   DATEDIFF(MINUTE, li.LastInboundAt, GETUTCDATE()) AS MinutesWaiting,
                   s.SlaMinutes
            FROM Conversations c
            JOIN WhatsAppSessions s ON s.Id = c.SessionId
            CROSS APPLY (
                SELECT MAX(m.CreatedAt) AS LastInboundAt
                FROM Messages m
                WHERE m.ConversationId = c.Id AND m.Direction = 'inbound'
            ) li
            WHERE c.AssignedUserId = @UserId
              AND c.Status = 'Open'
              AND li.LastInboundAt IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM Messages o
                  WHERE o.ConversationId = c.Id AND o.Direction = 'outbound' AND o.CreatedAt > li.LastInboundAt)
              AND DATEDIFF(MINUTE, li.LastInboundAt, GETUTCDATE()) > s.SlaMinutes
            ORDER BY MinutesWaiting DESC";
        return (await conn.QueryAsync<SlaBreachRow>(sql, new { UserId = userId })).ToList();
    }

    /// <summary>Records that a user has viewed a conversation (upsert into ConversationViews).</summary>
    public async Task MarkViewedAsync(int conversationId, int userId)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync(@"
            MERGE ConversationViews AS t
            USING (SELECT @ConversationId AS ConversationId, @UserId AS UserId) AS src
              ON t.ConversationId = src.ConversationId AND t.UserId = src.UserId
            WHEN MATCHED THEN UPDATE SET LastViewedAt = GETUTCDATE()
            WHEN NOT MATCHED THEN INSERT (ConversationId, UserId, LastViewedAt)
                 VALUES (@ConversationId, @UserId, GETUTCDATE());",
            new { ConversationId = conversationId, UserId = userId });
    }

    /// <summary>Total / open / escalated / closed / unread counts for the same filters as the list (ignores paging).</summary>
    public async Task<ConversationCounts> GetCountsAsync(IReadOnlyList<int>? assignedUserIds = null, int? sessionId = null, int? viewerUserId = null)
    {
        using var conn = _db.CreateConnection();
        var filter = " WHERE 1=1";
        if (assignedUserIds != null) filter += " AND c.AssignedUserId IN @AssignedUserIds";
        if (sessionId.HasValue)      filter += " AND c.SessionId = @SessionId";
        var p = new { AssignedUserIds = assignedUserIds, SessionId = sessionId, ViewerUserId = viewerUserId };

        var counts = await conn.QueryFirstOrDefaultAsync<ConversationCounts>($@"
            SELECT
                COUNT(*)                                              AS Total,
                SUM(CASE WHEN Status = 'Open'      THEN 1 ELSE 0 END) AS [Open],
                SUM(CASE WHEN Status = 'Escalated' THEN 1 ELSE 0 END) AS Escalated,
                SUM(CASE WHEN Status = 'Closed'    THEN 1 ELSE 0 END) AS Closed
            FROM Conversations c{filter}", p) ?? new ConversationCounts();

        // Unread is a separate query: SQL Server forbids a subquery inside an aggregate (SUM),
        // so it's a plain COUNT(*) with the EXISTS in the WHERE clause. Actionable = not Closed.
        if (viewerUserId.HasValue)
        {
            counts.Unread = await conn.ExecuteScalarAsync<int>($@"
                SELECT COUNT(*)
                FROM Conversations c
                LEFT JOIN ConversationViews cv ON cv.ConversationId = c.Id AND cv.UserId = @ViewerUserId
                {filter} AND c.Status <> 'Closed'
                  AND EXISTS (SELECT 1 FROM Messages mi
                              WHERE mi.ConversationId = c.Id AND mi.Direction = 'inbound'
                                AND mi.CreatedAt > ISNULL(cv.LastViewedAt, '1900-01-01'))", p);
        }
        return counts;
    }

    /// <summary>Total conversations per session (optionally scoped to one assigned user) — accurate, not page-limited.</summary>
    public async Task<List<SessionConvCount>> GetCountsBySessionAsync(IReadOnlyList<int>? assignedUserIds = null)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT SessionId, COUNT(*) AS [Count]
            FROM Conversations
            WHERE 1=1";
        if (assignedUserIds != null) sql += " AND AssignedUserId IN @AssignedUserIds";
        sql += " GROUP BY SessionId";
        var rows = await conn.QueryAsync<SessionConvCount>(sql, new { AssignedUserIds = assignedUserIds });
        return rows.ToList();
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

    public async Task UpdateNotesAsync(int id, string? notes)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync("UPDATE Conversations SET Notes = @Notes WHERE Id = @Id", new { Id = id, Notes = notes });
    }

    public async Task UpdateLastMessageAtAsync(int conversationId)
    {
        using var conn = _db.CreateConnection();
        var sql = "UPDATE Conversations SET LastMessageAt = GETUTCDATE() WHERE Id = @Id";
        await conn.ExecuteAsync(sql, new { Id = conversationId });
    }

    /// <summary>Raises priority only — never downgrades an already-High conversation.</summary>
    public async Task<bool> UpdatePriorityAsync(int id, string priority)
    {
        using var conn = _db.CreateConnection();
        var rows = await conn.ExecuteAsync(
            "UPDATE Conversations SET Priority = @Priority WHERE Id = @Id AND Priority <> @Priority",
            new { Id = id, Priority = priority });
        return rows > 0;
    }

    /// <summary>Record the retention cutoff after purging old messages — drives the chat "summary of older messages" banner.</summary>
    public async Task SetSummaryArchivedAtAsync(int conversationId, DateTime at)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync("UPDATE Conversations SET SummaryArchivedAt = @At WHERE Id = @Id",
            new { Id = conversationId, At = at });
    }

    public async Task<bool> UpdateAssignedUserAsync(int conversationId, int assignedUserId)
    {
        using var conn = _db.CreateConnection();
        var sql = "UPDATE Conversations SET AssignedUserId = @AssignedUserId WHERE Id = @Id";
        var rows = await conn.ExecuteAsync(sql, new { Id = conversationId, AssignedUserId = assignedUserId });
        return rows > 0;
    }

    public async Task<List<ConversationListRow>> SearchAsync(string query, int limit = 30, IReadOnlyList<int>? assignedUserIds = null)
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
            WHERE (c.CustomerPhone LIKE @Query OR c.CustomerName LIKE @Query)";
        if (assignedUserIds != null) sql += " AND c.AssignedUserId IN @AssignedUserIds";
        sql += " ORDER BY c.LastMessageAt DESC, c.CreatedAt DESC";

        var result = await conn.QueryAsync<ConversationListRow>(sql,
            new { Query = $"%{query}%", Limit = limit, AssignedUserIds = assignedUserIds });
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

// Status counts for the list filters (independent of paging)
public class ConversationCounts
{
    public int Total { get; set; }
    public int Open { get; set; }
    public int Escalated { get; set; }
    public int Closed { get; set; }
    public int Unread { get; set; }
}

public class SessionConvCount
{
    public int SessionId { get; set; }
    public int Count { get; set; }
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
    public bool IsUnread { get; set; }
}

// Open chats awaiting the agent's reply past the session's First-Response SLA (Overview → CRR list).
public class SlaBreachRow
{
    public int Id { get; set; }
    public string? CustomerName { get; set; }
    public string CustomerPhone { get; set; } = string.Empty;
    public int SessionId { get; set; }
    public string? SessionPhoneNumber { get; set; }
    public DateTime LastInboundAt { get; set; }
    public int MinutesWaiting { get; set; }
    public int SlaMinutes { get; set; }
}
