using Microsoft.Extensions.DependencyInjection;
using TejooWhatsApp.Repositories;

namespace TejooWhatsApp.Services;

/// <summary>
/// Drains the CatalogSendQueue, delivering catalog images to customers ONE AT A TIME
/// with a small gap between sends so the BSP isn't rate-limited. Runs continuously:
/// while jobs remain it sends back-to-back (spaced), otherwise it idles.
/// </summary>
public class CatalogSendService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<CatalogSendService> _logger;
    private static readonly TimeSpan _gapBetweenSends = TimeSpan.FromMilliseconds(1200);
    private static readonly TimeSpan _idleDelay       = TimeSpan.FromSeconds(5);

    public CatalogSendService(IServiceScopeFactory scopeFactory, ILogger<CatalogSendService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("CatalogSendService started — draining catalog image sends one-by-one.");
        await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken); // staggered startup

        while (!stoppingToken.IsCancellationRequested)
        {
            bool sentSomething = false;
            try
            {
                sentSomething = await ProcessOneAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "CatalogSendService: unexpected error in drain loop.");
            }

            // Space back-to-back sends; idle longer when the queue is empty.
            await Task.Delay(sentSomething ? _gapBetweenSends : _idleDelay, stoppingToken);
        }
    }

    /// <returns>true if a job was claimed and processed (so the loop keeps draining).</returns>
    private async Task<bool> ProcessOneAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var queue        = scope.ServiceProvider.GetRequiredService<CatalogSendQueueRepository>();
        var orchestrator = scope.ServiceProvider.GetRequiredService<WhatsAppOrchestrator>();

        var job = await queue.ClaimNextAsync();
        if (job == null) return false;

        try
        {
            var (ok, error) = await orchestrator.SendManualMessageAsync(job.ConversationId, "", "image", job.MediaUrl);
            if (ok)
            {
                await queue.MarkDoneAsync(job.Id);
                _logger.LogInformation("CatalogSendService: sent image to conversation #{Conv} (job {Job}).", job.ConversationId, job.Id);
            }
            else
            {
                await queue.MarkFailedAsync(job.Id, error ?? "send failed");
                _logger.LogWarning("CatalogSendService: send failed for job {Job} (conv #{Conv}): {Error}", job.Id, job.ConversationId, error);
            }
        }
        catch (Exception ex)
        {
            await queue.MarkFailedAsync(job.Id, ex.Message);
            _logger.LogError(ex, "CatalogSendService: exception sending job {Job}.", job.Id);
        }
        return true;
    }
}
