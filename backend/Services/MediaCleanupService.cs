using TejooWhatsApp.Repositories;
using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Services;

/// <summary>
/// Runs once per day. Deletes uploaded media folders for:
///   1. Conversations that are Closed and whose ClosedAt is older than media.retentionDays.
///   2. Orphaned folders where the conversation no longer exists in the DB.
/// Retention period is read from SystemSettings key "media.retentionDays" (default 30).
/// </summary>
public class MediaCleanupService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<MediaCleanupService> _logger;
    private static readonly TimeSpan _checkInterval = TimeSpan.FromHours(24);

    public MediaCleanupService(
        IServiceScopeFactory scopeFactory,
        IWebHostEnvironment env,
        ILogger<MediaCleanupService> logger)
    {
        _scopeFactory = scopeFactory;
        _env          = env;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("MediaCleanupService started.");

        // Offset startup by 10 minutes so it doesn't compete with other boot-time work
        await Task.Delay(TimeSpan.FromMinutes(10), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await RunCleanupAsync(stoppingToken); }
            catch (Exception ex) { _logger.LogError(ex, "Media cleanup cycle failed."); }

            await Task.Delay(_checkInterval, stoppingToken);
        }
    }

    private async Task RunCleanupAsync(CancellationToken ct)
    {
        // Keep the InboxMessages queue table from growing forever — drop processed rows older than
        // 7 days. Runs first (and unconditionally) so it isn't skipped when there's no uploads folder.
        try
        {
            using var purgeScope = _scopeFactory.CreateScope();
            var queue = purgeScope.ServiceProvider.GetRequiredService<MessageQueueService>();
            var purged = await queue.PurgeProcessedAsync(olderThanDays: 7);
            if (purged > 0)
                _logger.LogInformation("InboxCleanup: purged {Count} processed inbox row(s) older than 7 days.", purged);
        }
        catch (Exception ex)
        {
            _logger.LogWarning("InboxCleanup: purge failed: {Error}", ex.Message);
        }

        // Prune the Notifications table (read >30 days, or anything >90 days) so the bell history stays
        // bounded. Also unconditional — not gated on the uploads folder existing.
        try
        {
            using var notifScope = _scopeFactory.CreateScope();
            var notifRepo = notifScope.ServiceProvider.GetRequiredService<NotificationRepository>();
            var purgedNotifs = await notifRepo.PurgeOldAsync(readRetentionDays: 30, hardCapDays: 90);
            if (purgedNotifs > 0)
                _logger.LogInformation("NotificationCleanup: purged {Count} old notification(s).", purgedNotifs);
        }
        catch (Exception ex)
        {
            _logger.LogWarning("NotificationCleanup: purge failed: {Error}", ex.Message);
        }

        var uploadsRoot = Path.Combine(_env.WebRootPath, "uploads", "conversations");
        if (!Directory.Exists(uploadsRoot)) return;

        using var scope = _scopeFactory.CreateScope();
        var settings = scope.ServiceProvider.GetRequiredService<SystemSettingsRepository>();
        var db       = scope.ServiceProvider.GetRequiredService<DatabaseHelper>();
        var catalogs = scope.ServiceProvider.GetRequiredService<CatalogRepository>();

        var retentionDaysStr = await settings.GetAsync("media.retentionDays") ?? "30";
        var retentionDays    = int.TryParse(retentionDaysStr, out var d) ? d : 30;
        var cutoff           = DateTime.UtcNow.AddDays(-retentionDays);

        // Load all conversation IDs that are either closed (past cutoff) or deleted
        using var conn = db.CreateConnection();
        var closedIds = (await conn.QueryAsync<int>(
            "SELECT Id FROM Conversations WHERE Status = 'Closed' AND ClosedAt < @Cutoff",
            new { Cutoff = cutoff })).ToHashSet();

        var allDbIds = (await conn.QueryAsync<int>("SELECT Id FROM Conversations")).ToHashSet();

        var dirs = Directory.GetDirectories(uploadsRoot);
        int deleted = 0, freed = 0;

        foreach (var dir in dirs)
        {
            ct.ThrowIfCancellationRequested();

            if (!int.TryParse(Path.GetFileName(dir), out var convId)) continue;

            var shouldDelete = closedIds.Contains(convId)   // closed + past retention
                            || !allDbIds.Contains(convId);  // orphaned (conversation deleted)

            if (!shouldDelete) continue;

            // Never delete media a catalog still points to (would break the catalog's images).
            if (await catalogs.ConversationHasCatalogMediaAsync(convId))
            {
                _logger.LogInformation("MediaCleanup: keeping folder for conversation #{Id} — referenced by a catalog.", convId);
                continue;
            }

            try
            {
                var sizeBytes = Directory.GetFiles(dir, "*", SearchOption.AllDirectories)
                                         .Sum(f => new FileInfo(f).Length);
                Directory.Delete(dir, recursive: true);
                deleted++;
                freed += (int)(sizeBytes / 1024); // KB
                _logger.LogInformation("MediaCleanup: deleted folder for conversation #{Id} ({Size} KB freed)", convId, sizeBytes / 1024);
            }
            catch (Exception ex)
            {
                _logger.LogWarning("MediaCleanup: failed to delete folder {Dir}: {Error}", dir, ex.Message);
            }
        }

        if (deleted > 0)
            _logger.LogInformation("MediaCleanup: removed {Count} folder(s), ~{Freed} KB freed.", deleted, freed);
        else
            _logger.LogDebug("MediaCleanup: nothing to clean up.");
    }
}
