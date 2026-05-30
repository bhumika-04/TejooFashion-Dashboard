using Dapper;
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

        // CTE selects the oldest pending rows, UPDATE marks them Processing atomically
        var sql = @"
            WITH cte AS (
                SELECT TOP (@BatchSize) Id
                FROM InboxMessages WITH (UPDLOCK, READPAST)
                WHERE Status = 'Pending'
                   OR (Status = 'Failed' AND RetryCount < MaxRetries)
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

    /// <summary>Number of rows currently pending or in-progress (approximate).</summary>
    public async Task<int> GetPendingCountAsync()
    {
        using var conn = _db.CreateConnection();
        return await conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM InboxMessages WHERE Status IN ('Pending', 'Processing')");
    }
}
