using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Repositories;

public class MessageRepository
{
    private readonly DatabaseHelper _db;

    public MessageRepository(DatabaseHelper db)
    {
        _db = db;
    }

    public async Task<Message?> GetByIdAsync(int id)
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM Messages WHERE Id = @Id";
        return await conn.QueryFirstOrDefaultAsync<Message>(sql, new { Id = id });
    }

    // Used for idempotency — prevents saving duplicate messages when Interakt retries webhooks
    public async Task<bool> ExistsByProviderMessageIdAsync(string providerMessageId)
    {
        using var conn = _db.CreateConnection();
        var count = await conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(1) FROM Messages WHERE ProviderMessageId = @Id",
            new { Id = providerMessageId });
        return count > 0;
    }

    /// <summary>
    /// Paged media gallery — messages of a given type (e.g. 'image') that carry a media URL,
    /// newest first, with customer context. Scoped to a user's own conversations when assignedUserId is set.
    /// </summary>
    public async Task<(List<GalleryItem> Items, int Total)> GetMediaAsync(
        string messageType, int page, int pageSize, IReadOnlyList<int>? assignedUserIds,
        string? direction = null, int? sessionId = null, DateTime? from = null, DateTime? to = null)
    {
        using var conn = _db.CreateConnection();
        // Date filters compare against IST (+330 min) so the range matches the local calendar;
        // @To is inclusive of the whole end day (compared to the start of the next day).
        var where = @"
            FROM Messages m
            JOIN Conversations c ON c.Id = m.ConversationId
            WHERE m.MessageType = @MessageType
              AND m.MediaUrl IS NOT NULL AND m.MediaUrl <> ''
              AND (@Direction IS NULL OR m.Direction = @Direction)
              AND (@SessionId IS NULL OR c.SessionId = @SessionId)
              AND (@From IS NULL OR DATEADD(MINUTE, 330, m.CreatedAt) >= @From)
              AND (@To IS NULL OR DATEADD(MINUTE, 330, m.CreatedAt) < DATEADD(day, 1, @To))";
        // null = no user filter (Admin); otherwise scope to the caller's visible user set.
        if (assignedUserIds != null) where += " AND c.AssignedUserId IN @AssignedUserIds";
        var p = new { MessageType = messageType, AssignedUserIds = assignedUserIds,
                      Direction = direction, SessionId = sessionId, From = from, To = to };

        var total = await conn.ExecuteScalarAsync<int>($"SELECT COUNT(*) {where}", p);

        var items = await conn.QueryAsync<GalleryItem>($@"
            SELECT m.Id, m.MediaUrl, m.MessageType, m.Direction, m.Content, m.CreatedAt,
                   m.ConversationId, c.CustomerName, c.CustomerPhone,
                   (SELECT STRING_AGG(cat.Name, ', ')
                    FROM CatalogItems ci JOIN Catalogs cat ON cat.Id = ci.CatalogId
                    WHERE ci.SourceMessageId = m.Id) AS CatalogNames
            {where}
            ORDER BY m.CreatedAt DESC
            OFFSET {(page - 1) * pageSize} ROWS FETCH NEXT {pageSize} ROWS ONLY", p);

        return (items.ToList(), total);
    }

    public async Task<List<Message>> GetByConversationIdAsync(int conversationId, int limit = 50)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT TOP (@Limit) * FROM Messages
            WHERE ConversationId = @ConversationId
            ORDER BY CreatedAt ASC";

        var result = await conn.QueryAsync<Message>(sql, new { ConversationId = conversationId, Limit = limit });
        return result.ToList();
    }

    public async Task<List<Message>> GetRecentMessagesAsync(int conversationId, int count = 10)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT TOP (@Count) * FROM Messages
            WHERE ConversationId = @ConversationId
            ORDER BY CreatedAt DESC";

        var result = await conn.QueryAsync<Message>(sql, new { ConversationId = conversationId, Count = count });
        return result.OrderBy(m => m.CreatedAt).ToList();
    }

    public async Task<int> CreateAsync(Message message)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            INSERT INTO Messages
            (ConversationId, Direction, MessageType, Content, MediaUrl, ProviderMessageId,
             IsAiGenerated, Intent, Confidence, CreatedAt, DeliveredAt, ReadAt)
            VALUES
            (@ConversationId, @Direction, @MessageType, @Content, @MediaUrl, @ProviderMessageId,
             @IsAiGenerated, @Intent, @Confidence, @CreatedAt, @DeliveredAt, @ReadAt);
            SELECT CAST(SCOPE_IDENTITY() as int);";

        return await conn.QuerySingleAsync<int>(sql, message);
    }

    public async Task<bool> UpdateAsync(Message message)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            UPDATE Messages
            SET Direction = @Direction,
                MessageType = @MessageType,
                Content = @Content,
                MediaUrl = @MediaUrl,
                ProviderMessageId = @ProviderMessageId,
                IsAiGenerated = @IsAiGenerated,
                Intent = @Intent,
                Confidence = @Confidence,
                DeliveredAt = @DeliveredAt,
                ReadAt = @ReadAt
            WHERE Id = @Id";

        var rows = await conn.ExecuteAsync(sql, message);
        return rows > 0;
    }

    public async Task UpdateDeliveryAsync(int messageId, string providerMessageId)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            UPDATE Messages
            SET DeliveredAt = GETUTCDATE(),
                ProviderMessageId = @ProviderMessageId
            WHERE Id = @Id";
        await conn.ExecuteAsync(sql, new { Id = messageId, ProviderMessageId = providerMessageId });
    }

    /// <summary>Conversation ids that still have at least one message older than the cutoff (retention candidates).</summary>
    public async Task<List<int>> GetConversationsWithMessagesBeforeAsync(DateTime cutoff, int batchSize)
    {
        using var conn = _db.CreateConnection();
        return (await conn.QueryAsync<int>(
            "SELECT DISTINCT TOP (@Batch) ConversationId FROM Messages WHERE CreatedAt < @Cutoff",
            new { Batch = batchSize, Cutoff = cutoff })).ToList();
    }

    /// <summary>Hard-delete messages older than the cutoff for one conversation (30-day retention). Returns rows deleted.</summary>
    public async Task<int> DeleteMessagesBeforeAsync(int conversationId, DateTime cutoff)
    {
        using var conn = _db.CreateConnection();
        return await conn.ExecuteAsync(
            "DELETE FROM Messages WHERE ConversationId = @ConversationId AND CreatedAt < @Cutoff",
            new { ConversationId = conversationId, Cutoff = cutoff });
    }

    public async Task SetTranscriptAsync(int messageId, string transcript)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync(
            "UPDATE Messages SET Transcript = @Transcript WHERE Id = @Id",
            new { Id = messageId, Transcript = transcript });
    }

    public async Task<int> GetTodayCountAsync()
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT COUNT(*) FROM Messages
            WHERE CAST(DATEADD(MINUTE, 330, CreatedAt) AS DATE) = CAST(DATEADD(MINUTE, 330, GETUTCDATE()) AS DATE)";
        return await conn.ExecuteScalarAsync<int>(sql);
    }

    public async Task<int> GetTodayCountByDirectionAsync(string direction)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT COUNT(*) FROM Messages
            WHERE CAST(DATEADD(MINUTE, 330, CreatedAt) AS DATE) = CAST(DATEADD(MINUTE, 330, GETUTCDATE()) AS DATE)
            AND Direction = @Direction";
        return await conn.ExecuteScalarAsync<int>(sql, new { Direction = direction });
    }

    public async Task<int> GetTodayAiRepliesCountAsync()
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT COUNT(*) FROM Messages
            WHERE CAST(DATEADD(MINUTE, 330, CreatedAt) AS DATE) = CAST(DATEADD(MINUTE, 330, GETUTCDATE()) AS DATE)
            AND IsAiGenerated = 1";
        return await conn.ExecuteScalarAsync<int>(sql);
    }
}

/// <summary>Flat row for the media gallery (message media + customer context).</summary>
public class GalleryItem
{
    public int Id { get; set; }
    public string? MediaUrl { get; set; }
    public string MessageType { get; set; } = "";
    public string Direction { get; set; } = "";
    public string? Content { get; set; }
    public DateTime CreatedAt { get; set; }
    public int ConversationId { get; set; }
    public string? CustomerName { get; set; }
    public string? CustomerPhone { get; set; }
    public string? CatalogNames { get; set; }   // comma-joined names of catalogs this image is in
}
