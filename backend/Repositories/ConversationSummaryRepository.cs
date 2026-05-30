using Dapper;
using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Repositories;

public class ConversationSummaryRepository
{
    private readonly DatabaseHelper _db;

    public ConversationSummaryRepository(DatabaseHelper db)
    {
        _db = db;
    }

    public async Task<ConversationSummary?> GetByConversationIdAsync(int conversationId)
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM ConversationSummaries WHERE ConversationId = @ConversationId";
        return await conn.QueryFirstOrDefaultAsync<ConversationSummary>(sql, new { ConversationId = conversationId });
    }

    public async Task UpsertAsync(ConversationSummary summary)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            IF EXISTS (SELECT 1 FROM ConversationSummaries WHERE ConversationId = @ConversationId)
                UPDATE ConversationSummaries
                SET SummaryText   = @SummaryText,
                    KeyTopics     = @KeyTopics,
                    SentimentScore = @SentimentScore,
                    LastUpdatedAt = GETUTCDATE()
                WHERE ConversationId = @ConversationId
            ELSE
                INSERT INTO ConversationSummaries (ConversationId, SummaryText, KeyTopics, SentimentScore, LastUpdatedAt)
                VALUES (@ConversationId, @SummaryText, @KeyTopics, @SentimentScore, GETUTCDATE())";

        await conn.ExecuteAsync(sql, summary);
    }
}
