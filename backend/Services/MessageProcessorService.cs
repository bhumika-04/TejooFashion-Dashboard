namespace TejooWhatsApp.Services;

public class MessageProcessorService : BackgroundService
{
    private readonly MessageQueueService _queue;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<MessageProcessorService> _logger;

    // Max concurrent jobs — 30 covers 25 sessions with burst headroom
    private readonly SemaphoreSlim _concurrencyLimiter = new(30, 30);

    // Poll interval when no jobs are found (back-off to avoid busy-loop)
    private static readonly TimeSpan _idlePoll   = TimeSpan.FromSeconds(2);
    private static readonly TimeSpan _activePoll = TimeSpan.FromMilliseconds(200);

    public MessageProcessorService(
        MessageQueueService queue,
        IServiceScopeFactory scopeFactory,
        ILogger<MessageProcessorService> logger)
    {
        _queue        = queue;
        _scopeFactory = scopeFactory;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("MessageProcessorService started — polling SQL inbox, concurrency limit: 30.");

        while (!stoppingToken.IsCancellationRequested)
        {
            List<IncomingMessageJob> batch;
            try
            {
                batch = await _queue.PickNextBatchAsync(batchSize: 10);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to pick next batch from InboxMessages.");
                await Task.Delay(_idlePoll, stoppingToken);
                continue;
            }

            if (batch.Count == 0)
            {
                await Task.Delay(_idlePoll, stoppingToken);
                continue;
            }

            // Fire each job in its own task, bounded by the semaphore
            foreach (var job in batch)
            {
                await _concurrencyLimiter.WaitAsync(stoppingToken);

                _ = Task.Run(async () =>
                {
                    try   { await ProcessJobAsync(job, stoppingToken); }
                    finally { _concurrencyLimiter.Release(); }
                }, stoppingToken);
            }

            // If we got a full batch there may be more — poll immediately
            await Task.Delay(batch.Count >= 10 ? _activePoll : _idlePoll, stoppingToken);
        }

        _logger.LogInformation("MessageProcessorService stopped.");
    }

    private async Task ProcessJobAsync(IncomingMessageJob job, CancellationToken ct)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var orchestrator = scope.ServiceProvider.GetRequiredService<WhatsAppOrchestrator>();

            await orchestrator.ProcessIncomingMessageAsync(
                provider:          job.Provider,
                businessPhone:     job.BusinessPhone,
                customerPhone:     job.CustomerPhone,
                messageContent:    job.MessageContent,
                customerName:      job.CustomerName,
                messageType:       job.MessageType,
                mediaUrl:          job.MediaUrl,
                providerMessageId: job.ProviderMessageId);

            await _queue.MarkDoneAsync(job.DbId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Failed to process InboxMessage #{DbId} — Provider: {Provider}, CustomerPhone: {CustomerPhone}",
                job.DbId, job.Provider, job.CustomerPhone);

            await _queue.MarkFailedAsync(job.DbId, ex.Message);
        }
    }
}
