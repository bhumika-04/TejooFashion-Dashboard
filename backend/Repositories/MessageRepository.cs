using Dapper;
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
            WHERE CAST(CreatedAt AS DATE) = CAST(GETUTCDATE() AS DATE)";
        return await conn.ExecuteScalarAsync<int>(sql);
    }

    public async Task<int> GetTodayCountByDirectionAsync(string direction)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT COUNT(*) FROM Messages
            WHERE CAST(CreatedAt AS DATE) = CAST(GETUTCDATE() AS DATE)
            AND Direction = @Direction";
        return await conn.ExecuteScalarAsync<int>(sql, new { Direction = direction });
    }

    public async Task<int> GetTodayAiRepliesCountAsync()
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT COUNT(*) FROM Messages
            WHERE CAST(CreatedAt AS DATE) = CAST(GETUTCDATE() AS DATE)
            AND IsAiGenerated = 1";
        return await conn.ExecuteScalarAsync<int>(sql);
    }
}
