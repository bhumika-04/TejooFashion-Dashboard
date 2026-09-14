using Microsoft.Extensions.DependencyInjection;
using TejooWhatsApp.Repositories;

namespace TejooWhatsApp.Services;

/// <summary>
/// 30-day message retention (rolling, per message). Once per day, IF enabled by the admin
/// (SystemSettings key <c>conversation.retentionEnabled</c> = "true"), it:
///   1. refreshes each candidate conversation's CUMULATIVE summary (so nothing is lost);
///   2. only then HARD-DELETES its messages older than <c>conversation.retentionDays</c> (default 30);
///   3. records the cutoff on the conversation so the chat shows a "summary of older messages" banner.
/// SAFETY: it never deletes a conversation that has no saved summary. Default OFF.
/// </summary>
public class ConversationRetentionService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ConversationRetentionService> _logger;
    private static readonly TimeSpan _interval = TimeSpan.FromHours(24);

    public ConversationRetentionService(IServiceScopeFactory scopeFactory, ILogger<ConversationRetentionService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("ConversationRetentionService started — daily check (default OFF until enabled).");
        await Task.Delay(TimeSpan.FromMinutes(3), stoppingToken); // staggered startup

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await RunAsync(stoppingToken); }
            catch (Exception ex) { _logger.LogError(ex, "ConversationRetentionService error."); }
            await Task.Delay(_interval, stoppingToken);
        }
    }

    private async Task RunAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var settings = scope.ServiceProvider.GetRequiredService<SystemSettingsRepository>();

        var enabled = string.Equals((await settings.GetAsync("conversation.retentionEnabled"))?.Trim(), "true", StringComparison.OrdinalIgnoreCase);
        if (!enabled) { _logger.LogDebug("Retention disabled — skipping."); return; }

        var days = int.TryParse(await settings.GetAsync("conversation.retentionDays"), out var d) ? Math.Max(1, d) : 30;
        var cutoff = DateTime.UtcNow.AddDays(-days);

        var messages    = scope.ServiceProvider.GetRequiredService<MessageRepository>();
        var summaryRepo = scope.ServiceProvider.GetRequiredService<ConversationSummaryRepository>();
        var convService = scope.ServiceProvider.GetRequiredService<ConversationService>();
        var convRepo    = scope.ServiceProvider.GetRequiredService<ConversationRepository>();

        var candidates = await messages.GetConversationsWithMessagesBeforeAsync(cutoff, 200);
        if (candidates.Count == 0) return;

        int archivedConvs = 0, purgedMsgs = 0;
        foreach (var convId in candidates)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                // SAFETY: refresh the cumulative summary first (wide window so it covers everything
                // about to be deleted) — never delete without a saved summary.
                try { await convService.GenerateSummaryAsync(convId, messageLimit: 1000); }
                catch (Exception ex) { _logger.LogWarning("Retention: summary refresh failed for #{Id} ({Error}) — skipping delete.", convId, ex.Message); continue; }

                var summary = await summaryRepo.GetByConversationIdAsync(convId);
                if (summary == null || string.IsNullOrWhiteSpace(summary.SummaryText))
                {
                    _logger.LogWarning("Retention: skipping conversation #{Id} — no summary available.", convId);
                    continue;
                }

                var deleted = await messages.DeleteMessagesBeforeAsync(convId, cutoff);
                if (deleted > 0)
                {
                    await convRepo.SetSummaryArchivedAtAsync(convId, cutoff);
                    archivedConvs++; purgedMsgs += deleted;
                }
            }
            catch (Exception ex) { _logger.LogWarning("Retention: failed for conversation #{Id}: {Error}", convId, ex.Message); }
            await Task.Delay(300, ct); // gentle pacing (each may call OpenAI for the summary)
        }

        _logger.LogInformation("Retention: archived {Convs} conversation(s), hard-deleted {Msgs} message(s) older than {Days}d.",
            archivedConvs, purgedMsgs, days);
    }
}
