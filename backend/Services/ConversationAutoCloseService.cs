using Dapper;
using TejooWhatsApp.Repositories;
using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Services;

/// <summary>
/// Runs every hour. If auto-close is enabled in SystemSettings, closes all Open/Escalated
/// conversations whose LastMessageAt is older than the configured threshold (default 24h).
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
        var closed = await conn.ExecuteAsync(@"
            UPDATE Conversations
            SET Status  = 'Closed',
                ClosedAt = GETUTCDATE()
            WHERE Status IN ('Open', 'Escalated')
              AND (
                    (LastMessageAt IS NULL    AND CreatedAt    < @Cutoff)
                 OR (LastMessageAt IS NOT NULL AND LastMessageAt < @Cutoff)
              )",
            new { Cutoff = cutoff });

        if (closed > 0)
            _logger.LogInformation(
                "Auto-close: closed {Count} conversation(s) inactive for >{Hours}h.",
                closed, inactiveHours);
    }
}
