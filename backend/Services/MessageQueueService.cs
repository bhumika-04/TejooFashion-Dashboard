using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Services;

public record IncomingMessageJob(
    long    DbId,          // InboxMessages.Id — used to mark Done/Failed
    string  Provider,
    string  BusinessPhone,
    string  CustomerPhone,
    string  MessageContent,
    string? CustomerName,
    string  MessageType,
    string? MediaUrl,
    string? ProviderMessageId
);

/// <summary>
/// SQL-backed message queue (outbox pattern).
/// Webhook handlers call EnqueueAsync → row inserted into InboxMessages.
/// MessageProcessorService polls PickNextBatchAsync, processes, then marks Done/Failed.
/// Messages survive a server restart; failed ones are retried up to MaxRetries times.
/// </summary>
public class MessageQueueService
{
    private readonly DatabaseHelper _db;
    private readonly ILogger<MessageQueueService> _logger;

    public MessageQueueService(DatabaseHelper db, ILogger<MessageQueueService> logger)
        => (_db, _logger) = (db, logger);

    /// <summary>Insert a new job. Returns the InboxMessages.Id.</summary>
    public async Task<long> EnqueueAsync(
        string  provider,
        string  businessPhone,
        string  customerPhone,
        string  messageContent,
        string? customerName,
        string  messageType       = "text",
        string? mediaUrl          = null,
        string? providerMessageId = null)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            INSERT INTO InboxMessages
                (Provider, BusinessPhone, CustomerPhone, MessageContent, CustomerName,
                 MessageType, MediaUrl, ProviderMessageId, Status, MaxRetries, CreatedAt)
            VALUES
                (@Provider, @BusinessPhone, @CustomerPhone, @MessageContent, @CustomerName,
                 @MessageType, @MediaUrl, @ProviderMessageId, 'Pending', 3, GETUTCDATE());
            SELECT CAST(SCOPE_IDENTITY() AS BIGINT);";

        return await conn.QuerySingleAsync<long>(sql, new
        {
            Provider          = provider,
            BusinessPhone     = businessPhone,
            CustomerPhone     = customerPhone,
            MessageContent    = messageContent,
            CustomerName      = customerName,
            MessageType       = messageType,
            MediaUrl          = mediaUrl,
            ProviderMessageId = providerMessageId
        });
    }

    /// <summary>
    /// Atomically picks up to <paramref name="batchSize"/> Pending rows,
    /// marks them Processing, and returns them for the worker to process.
    /// Uses OUTPUT so the SELECT + UPDATE is a single round-trip with no race.
    /// </summary>
    public async Task<List<IncomingMessageJob>> PickNextBatchAsync(int batchSize = 10)
    {
        using var conn = _db.CreateConnection();

        // CTE selects the oldest pending rows, UPDATE marks them Processing atomically.
        // Also reclaims rows stuck in 'Processing' for >5 min (the server died mid-process before
        // marking Done/Failed) — reprocessing is safe because the orchestrator dedupes on
        // ProviderMessageId. Without this, a crash would silently strand those messages forever.
        var sql = @"
            WITH cte AS (
                SELECT TOP (@BatchSize) Id
                FROM InboxMessages WITH (UPDLOCK, READPAST)
                WHERE Status = 'Pending'
                   OR (Status = 'Failed' AND RetryCount < MaxRetries)
                   OR (Status = 'Processing' AND PickedUpAt < DATEADD(MINUTE, -5, GETUTCDATE()))
                ORDER BY CreatedAt ASC
            )
            UPDATE InboxMessages
            SET Status     = 'Processing',
                PickedUpAt = GETUTCDATE()
            OUTPUT
                INSERTED.Id, INSERTED.Provider, INSERTED.BusinessPhone,
                INSERTED.CustomerPhone, INSERTED.MessageContent, INSERTED.CustomerName,
                INSERTED.MessageType, INSERTED.MediaUrl, INSERTED.ProviderMessageId
            FROM InboxMessages im
            INNER JOIN cte ON im.Id = cte.Id;";

        var rows = await conn.QueryAsync<dynamic>(sql, new { BatchSize = batchSize });

        return [.. rows.Select(r => new IncomingMessageJob(
            DbId:              (long)r.Id,
            Provider:          (string)r.Provider,
            BusinessPhone:     (string)r.BusinessPhone,
            CustomerPhone:     (string)r.CustomerPhone,
            MessageContent:    (string)r.MessageContent,
            CustomerName:      (string?)r.CustomerName,
            MessageType:       (string)r.MessageType,
            MediaUrl:          (string?)r.MediaUrl,
            ProviderMessageId: (string?)r.ProviderMessageId
        ))];
    }

    /// <summary>Mark a job as successfully processed.</summary>
    public async Task MarkDoneAsync(long id)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync(
            "UPDATE InboxMessages SET Status = 'Done', ProcessedAt = GETUTCDATE() WHERE Id = @Id",
            new { Id = id });
    }

    /// <summary>Mark a job as failed; increments RetryCount for re-queue logic.</summary>
    public async Task MarkFailedAsync(long id, string error)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync(@"
            UPDATE InboxMessages
            SET Status     = CASE WHEN RetryCount + 1 < MaxRetries THEN 'Failed' ELSE 'DeadLetter' END,
                RetryCount = RetryCount + 1,
                LastError  = @Error
            WHERE Id = @Id",
            new { Id = id, Error = error.Length > 2000 ? error[..2000] : error });
    }

    /// <summary>Aggregated queue health for the ops dashboard: status counts, backlog age, dead letters.</summary>
    public async Task<QueueHealth> GetHealthAsync(int deadLetterLimit = 25)
    {
        using var conn = _db.CreateConnection();

        // Status counts + oldest still-unprocessed row age (seconds). "Done today" uses IST day.
     
        var summary = await conn.QueryFirstOrDefaultAsync<QueueHealth>(@"
            SELECT
                SUM(CASE WHEN Status = 'Pending'    THEN 1 ELSE 0 END) AS Pending,
                SUM(CASE WHEN Status = 'Processing' THEN 1 ELSE 0 END) AS Processing,
                SUM(CASE WHEN Status = 'Failed'     THEN 1 ELSE 0 END) AS Failed,
                SUM(CASE WHEN Status = 'DeadLetter' THEN 1 ELSE 0 END) AS DeadLetter,
                SUM(CASE WHEN Status = 'Done'
                          AND CAST(DATEADD(MINUTE,330,ProcessedAt) AS DATE)
                            = CAST(DATEADD(MINUTE,330,GETUTCDATE()) AS DATE) THEN 1 ELSE 0 END) AS DoneToday,
                ISNULL(DATEDIFF(SECOND, MIN(CASE WHEN Status IN ('Pending','Failed','Processing')
                                                  THEN CreatedAt END), GETUTCDATE()), 0) AS OldestUnprocessedSeconds
            FROM InboxMessages") ?? new QueueHealth();

        var dead = await conn.QueryAsync<DeadLetterRow>(@"
            SELECT TOP (@Limit)
                Id, Provider, CustomerPhone, CustomerName, MessageType,
                RetryCount, MaxRetries, LastError, CreatedAt
            FROM InboxMessages
            WHERE Status = 'DeadLetter'
            ORDER BY CreatedAt DESC", new { Limit = deadLetterLimit });

        summary.DeadLetters = dead.ToList();
        return summary;
    }

    /// <summary>Re-queue a dead-lettered (or failed) job so the processor picks it up again.</summary>
    public async Task<bool> RetryAsync(long id)
    {
        using var conn = _db.CreateConnection();
        var rows = await conn.ExecuteAsync(@"
            UPDATE InboxMessages
            SET Status = 'Pending', RetryCount = 0, LastError = NULL, PickedUpAt = NULL
            WHERE Id = @Id AND Status IN ('DeadLetter', 'Failed')",
            new { Id = id });
        return rows > 0;
    }

    /// <summary>Permanently set aside a dead-lettered job so it stops surfacing (no further retries).</summary>
    public async Task<bool> DiscardAsync(long id)
    {
        using var conn = _db.CreateConnection();
        var rows = await conn.ExecuteAsync(
            "UPDATE InboxMessages SET Status = 'Discarded' WHERE Id = @Id AND Status = 'DeadLetter'",
            new { Id = id });
        return rows > 0;
    }

    /// <summary>
    /// Deletes terminal inbox rows (Done / Discarded) older than the cutoff so the table doesn't
    /// grow without bound — one row is written per inbound message and they're never otherwise removed.
    /// Active rows (Pending/Processing/Failed) and DeadLetters (kept for admin review/retry) are NOT touched.
    /// Returns the number of rows deleted.
    /// </summary>
    public async Task<int> PurgeProcessedAsync(int olderThanDays = 7)
    {
        using var conn = _db.CreateConnection();
        return await conn.ExecuteAsync(
            @"DELETE FROM InboxMessages
              WHERE Status IN ('Done', 'Discarded')
                AND CreatedAt < DATEADD(day, -@Days, GETUTCDATE())",
            new { Days = olderThanDays });
    }
}

public class QueueHealth
{
    public int Pending { get; set; }
    public int Processing { get; set; }
    public int Failed { get; set; }
    public int DeadLetter { get; set; }
    public int DoneToday { get; set; }
    public int OldestUnprocessedSeconds { get; set; }
    public List<DeadLetterRow> DeadLetters { get; set; } = new();
}

public class DeadLetterRow
{
    public long Id { get; set; }
    public string Provider { get; set; } = "";
    public string CustomerPhone { get; set; } = "";
    public string? CustomerName { get; set; }
    public string MessageType { get; set; } = "";
    public int RetryCount { get; set; }
    public int MaxRetries { get; set; }
    public string? LastError { get; set; }
    public DateTime CreatedAt { get; set; }
}
