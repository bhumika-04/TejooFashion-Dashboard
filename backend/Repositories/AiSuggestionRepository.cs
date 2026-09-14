using TejooWhatsApp.Utilities;
using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Models.DTOs;

namespace TejooWhatsApp.Repositories;

public class AiSuggestionRepository
{
    private readonly DatabaseHelper _db;
    public AiSuggestionRepository(DatabaseHelper db) => _db = db;

    /// <summary>Supersede any existing pending draft on the conversation, then insert the new one. Returns its id.</summary>
    public async Task<int> CreateSupersedingAsync(int conversationId, int? sourceMessageId,
        string suggestedText, string? intent, decimal? confidence)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync(
            "UPDATE AiSuggestions SET Status = 'Superseded' WHERE ConversationId = @ConversationId AND Status = 'Pending'",
            new { ConversationId = conversationId });

        return await conn.QuerySingleAsync<int>(@"
            INSERT INTO AiSuggestions (ConversationId, SourceMessageId, SuggestedText, Intent, Confidence, Status, CreatedAt)
            VALUES (@ConversationId, @SourceMessageId, @SuggestedText, @Intent, @Confidence, 'Pending', SYSUTCDATETIME());
            SELECT CAST(SCOPE_IDENTITY() AS int);",
            new { ConversationId = conversationId, SourceMessageId = sourceMessageId, SuggestedText = suggestedText, Intent = intent, Confidence = confidence });
    }

    /// <summary>The current pending draft for a conversation, or null.</summary>
    public async Task<AiSuggestion?> GetPendingAsync(int conversationId)
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryFirstOrDefaultAsync<AiSuggestion>(
            "SELECT TOP 1 * FROM AiSuggestions WHERE ConversationId = @ConversationId AND Status = 'Pending' ORDER BY Id DESC",
            new { ConversationId = conversationId });
    }

    /// <summary>Acceptance analytics over a window (by draft creation time).</summary>
    public async Task<AiSuggestionStatsDTO> GetAcceptanceStatsAsync(DateTime from, DateTime to)
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryFirstOrDefaultAsync<AiSuggestionStatsDTO>(@"
            SELECT
                COUNT(*)                                              AS Total,
                SUM(CASE WHEN Status='Pending'    THEN 1 ELSE 0 END)  AS Pending,
                SUM(CASE WHEN Status='Superseded' THEN 1 ELSE 0 END)  AS Superseded,
                SUM(CASE WHEN Status='Sent'       THEN 1 ELSE 0 END)  AS Sent,
                SUM(CASE WHEN Status='Edited'     THEN 1 ELSE 0 END)  AS Edited,
                SUM(CASE WHEN Status='Dismissed'  THEN 1 ELSE 0 END)  AS Dismissed
            FROM AiSuggestions
            WHERE CreatedAt >= @From AND CreatedAt <= @To",
            new { From = from, To = to }) ?? new AiSuggestionStatsDTO();
    }

    /// <summary>Per-agent acceptance breakdown over a window (by action time).</summary>
    public async Task<List<AiAgentAcceptanceDTO>> GetAcceptanceByAgentAsync(DateTime from, DateTime to)
    {
        using var conn = _db.CreateConnection();
        return (await conn.QueryAsync<AiAgentAcceptanceDTO>(@"
            SELECT u.FullName AS AgentName,
                   SUM(CASE WHEN s.Status='Sent'      THEN 1 ELSE 0 END) AS Sent,
                   SUM(CASE WHEN s.Status='Edited'    THEN 1 ELSE 0 END) AS Edited,
                   SUM(CASE WHEN s.Status='Dismissed' THEN 1 ELSE 0 END) AS Dismissed
            FROM AiSuggestions s
            JOIN Users u ON u.Id = s.ActedByUserId
            WHERE s.ActedByUserId IS NOT NULL AND s.ActedAt >= @From AND s.ActedAt <= @To
              AND s.Status IN ('Sent','Edited','Dismissed')
            GROUP BY u.FullName
            ORDER BY SUM(CASE WHEN s.Status IN ('Sent','Edited') THEN 1 ELSE 0 END) DESC",
            new { From = from, To = to })).ToList();
    }

    /// <summary>Record the CRR's action (Sent | Edited | Dismissed) on a pending suggestion.</summary>
    public async Task<bool> ResolveAsync(int id, string status, int? actedByUserId)
    {
        using var conn = _db.CreateConnection();
        var rows = await conn.ExecuteAsync(@"
            UPDATE AiSuggestions
            SET Status = @Status, ActedByUserId = @ActedByUserId, ActedAt = SYSUTCDATETIME()
            WHERE Id = @Id AND Status = 'Pending'",
            new { Id = id, Status = status, ActedByUserId = actedByUserId });
        return rows > 0;
    }
}
