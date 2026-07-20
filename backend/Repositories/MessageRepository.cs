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
        string messageType, int page, int pageSize, int? assignedUserId)
    {
        using var conn = _db.CreateConnection();
        var where = @"
            FROM Messages m
            JOIN Conversations c ON c.Id = m.ConversationId
            WHERE m.MessageType = @MessageType
              AND m.MediaUrl IS NOT NULL AND m.MediaUrl <> ''
              AND (@AssignedUserId IS NULL OR c.AssignedUserId = @AssignedUserId)";
        var p = new { MessageType = messageType, AssignedUserId = assignedUserId };

        var total = await conn.ExecuteScalarAsync<int>($"SELECT COUNT(*) {where}", p);

        var items = await conn.QueryAsync<GalleryItem>($@"
            SELECT m.Id, m.MediaUrl, m.MessageType, m.Direction, m.Content, m.CreatedAt,
                   m.ConversationId, c.CustomerName, c.CustomerPhone
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
}
