using TejooWhatsApp.AI;
using TejooWhatsApp.Repositories;
using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Services;

/// <summary>
/// Runs every hour. If auto-close is enabled in SystemSettings, closes Open conversations that have
/// been idle longer than the configured threshold (default 24h) AND aren't waiting on us — i.e. the
/// customer's messages since our last reply are only acknowledgements ("Ok", "Thanks"). A customer
/// still waiting for an answer is never auto-closed: that chat stays on Overdue Replies until someone
/// replies. Escalated conversations are left alone — they're in the CRR→Manager→HOD workflow.
/// </summary>
public class ConversationAutoCloseService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ConversationAutoCloseService> _logger;
    private static readonly TimeSpan _checkInterval = TimeSpan.FromHours(1);

    public ConversationAutoCloseService(
        IServiceScopeFactory scopeFactory,
        ILogger<ConversationAutoCloseService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("ConversationAutoCloseService started.");

        // Stagger startup by 5 minutes so it doesn't run at the same time as other services
        await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await RunAutoCloseAsync(stoppingToken); }
            catch (Exception ex) { _logger.LogError(ex, "Auto-close cycle failed."); }

            await Task.Delay(_checkInterval, stoppingToken);
        }
    }

    private async Task RunAutoCloseAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var settings = scope.ServiceProvider.GetRequiredService<SystemSettingsRepository>();
        var db       = scope.ServiceProvider.GetRequiredService<DatabaseHelper>();

        var enabled       = (await settings.GetAsync("autoClose.enabled"))       == "true";
        var hoursStr      =  await settings.GetAsync("autoClose.inactiveHours")  ?? "24";
        var inactiveHours = int.TryParse(hoursStr, out var h) ? h : 24;

        if (!enabled) return;

        var cutoff = DateTime.UtcNow.AddHours(-inactiveHours);

        using var conn = db.CreateConnection();

        // Idle Open chats, each with the customer messages received since our last reply (if any).
        var rows = (await conn.QueryAsync<IdleRow>(@"
            SELECT c.Id, m.Content, m.MessageType
            FROM Conversations c
            OUTER APPLY (
                SELECT MAX(o.CreatedAt) AS LastOutboundAt
                FROM Messages o
                WHERE o.ConversationId = c.Id AND o.Direction = 'outbound'
            ) lo
            LEFT JOIN Messages m ON m.ConversationId = c.Id AND m.Direction = 'inbound'
                                AND (lo.LastOutboundAt IS NULL OR m.CreatedAt > lo.LastOutboundAt)
            WHERE c.Status = 'Open'
              AND ((c.LastMessageAt IS NULL AND c.CreatedAt < @Cutoff)
                OR (c.LastMessageAt IS NOT NULL AND c.LastMessageAt < @Cutoff))",
            new { Cutoff = cutoff })).ToList();

        var closable = rows
            .GroupBy(r => r.Id)
            .Where(g => g.All(r => r.Content == null && r.MessageType == null      // no customer message since our reply
                                || AiHeuristics.IsAcknowledgement(r.Content, r.MessageType)))
            .Select(g => g.Key)
            .ToList();
        var stillWaiting = rows.Select(r => r.Id).Distinct().Count() - closable.Count;

        var closed = 0;
        foreach (var batch in closable.Chunk(500))
        {
            ct.ThrowIfCancellationRequested();
            closed += await conn.ExecuteAsync(@"
                UPDATE Conversations
                SET Status = 'Closed', ClosedAt = GETUTCDATE()
                WHERE Status = 'Open' AND Id IN @Ids",
                new { Ids = batch });
        }

        if (closed > 0 || stillWaiting > 0)
            _logger.LogInformation(
                "Auto-close: closed {Closed} conversation(s) idle >{Hours}h; kept {Waiting} open because the customer is still waiting for a reply.",
                closed, inactiveHours, stillWaiting);
    }

    private class IdleRow
    {
        public int Id { get; set; }
        public string? Content { get; set; }
        public string? MessageType { get; set; }
    }
}
