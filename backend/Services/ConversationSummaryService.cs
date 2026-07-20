using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Services;

/// <summary>
/// Periodically keeps conversation summaries fresh. Every cycle it picks a small batch of
/// conversations that either have no summary or whose newest message is newer than their last
/// summary (and have at least a few messages), and regenerates the summary via AI. This populates
/// the customer-profile recap for active and auto-closed conversations without summarizing
/// everything on every message. Sentiment-based prioritization is applied inside GenerateSummaryAsync.
/// </summary>
public class ConversationSummaryService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ConversationSummaryService> _logger;
    private static readonly TimeSpan _interval = TimeSpan.FromMinutes(30);
    private const int BatchSize = 15;          // conversations summarized per cycle (caps OpenAI cost)
    private const int MinMessages = 3;         // skip near-empty threads

    public ConversationSummaryService(
        IServiceScopeFactory scopeFactory,
        ILogger<ConversationSummaryService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("ConversationSummaryService started — refreshing summaries every {Min} min.", _interval.TotalMinutes);

        // Stagger startup so it doesn't run alongside the other boot-time background services
        await Task.Delay(TimeSpan.FromMinutes(3), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await RunAsync(stoppingToken); }
            catch (Exception ex) { _logger.LogError(ex, "Summary refresh cycle failed."); }

            await Task.Delay(_interval, stoppingToken);
        }
    }

    private async Task RunAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db          = scope.ServiceProvider.GetRequiredService<DatabaseHelper>();
        var convService = scope.ServiceProvider.GetRequiredService<ConversationService>();

        List<int> ids;
        using (var conn = db.CreateConnection())
        {
            ids = (await conn.QueryAsync<int>(@"
                SELECT TOP (@Batch) c.Id
                FROM Conversations c
                LEFT JOIN ConversationSummaries s ON s.ConversationId = c.Id
                WHERE (s.ConversationId IS NULL OR c.LastMessageAt > s.LastUpdatedAt)
                  AND (SELECT COUNT(*) FROM Messages m WHERE m.ConversationId = c.Id) >= @MinMessages
                  -- only summarize 'settled' conversations (idle >=10 min) to avoid re-summarizing
                  -- a chat on every cycle while it's still active; cuts redundant OpenAI calls
                  AND c.LastMessageAt < DATEADD(MINUTE, -10, GETUTCDATE())
                ORDER BY c.LastMessageAt DESC",
                new { Batch = BatchSize, MinMessages })).ToList();
        }

        if (ids.Count == 0) { _logger.LogDebug("Summary refresh: nothing to do."); return; }

        var done = 0;
        foreach (var id in ids)
        {
            ct.ThrowIfCancellationRequested();
            try { await convService.GenerateSummaryAsync(id); done++; }
            catch (Exception ex) { _logger.LogWarning("Summary gen failed for conversation #{Id}: {Error}", id, ex.Message); }
            await Task.Delay(500, ct); // gentle pacing for the OpenAI API
        }

        _logger.LogInformation("Summary refresh: updated {Done}/{Total} conversation(s).", done, ids.Count);
    }
}
