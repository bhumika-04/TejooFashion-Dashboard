using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Repositories;

public class CatalogSendJob
{
    public long Id { get; set; }
    public int ConversationId { get; set; }
    public string MediaUrl { get; set; } = string.Empty;
    public int Attempts { get; set; }
    public int MaxRetries { get; set; }
}

public class CatalogSendQueueRepository
{
    private readonly DatabaseHelper _db;
    public CatalogSendQueueRepository(DatabaseHelper db) => _db = db;

    /// <summary>Enqueue one image-send per URL for a conversation. Returns how many were queued.</summary>
    public async Task<int> EnqueueAsync(int conversationId, IEnumerable<string> mediaUrls, int? createdByUserId)
    {
        using var conn = _db.CreateConnection();
        var queued = 0;
        foreach (var url in mediaUrls)
        {
            if (string.IsNullOrWhiteSpace(url)) continue;
            await conn.ExecuteAsync(@"
                INSERT INTO CatalogSendQueue (ConversationId, MediaUrl, Status, CreatedByUserId, CreatedAt)
                VALUES (@ConversationId, @MediaUrl, 'Pending', @CreatedByUserId, SYSUTCDATETIME());",
                new { ConversationId = conversationId, MediaUrl = url, CreatedByUserId = createdByUserId });
            queued++;
        }
        return queued;
    }

    /// <summary>Atomically claim the oldest Pending job (→ Processing) and return it, or null if none.</summary>
    public async Task<CatalogSendJob?> ClaimNextAsync()
    {
        using var conn = _db.CreateConnection();
        var row = await conn.QueryFirstOrDefaultAsync<CatalogSendJob>(@"
            UPDATE TOP (1) CatalogSendQueue
            SET Status = 'Processing', Attempts = Attempts + 1
            OUTPUT INSERTED.Id, INSERTED.ConversationId, INSERTED.MediaUrl,
                   INSERTED.Attempts, INSERTED.MaxRetries
            WHERE Id = (SELECT TOP 1 Id FROM CatalogSendQueue WITH (UPDLOCK, READPAST)
                        WHERE Status = 'Pending' ORDER BY Id);");
        return row;
    }

    public async Task MarkDoneAsync(long id)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync(
            "UPDATE CatalogSendQueue SET Status = 'Done', ProcessedAt = SYSUTCDATETIME(), Error = NULL WHERE Id = @Id",
            new { Id = id });
    }

    /// <summary>Fail a job: retry (→ Pending) while attempts remain, else mark Failed.</summary>
    public async Task MarkFailedAsync(long id, string error)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync(@"
            UPDATE CatalogSendQueue
            SET Status = CASE WHEN Attempts >= MaxRetries THEN 'Failed' ELSE 'Pending' END,
                Error = @Error,
                ProcessedAt = CASE WHEN Attempts >= MaxRetries THEN SYSUTCDATETIME() ELSE ProcessedAt END
            WHERE Id = @Id;",
            new { Id = id, Error = error.Length > 1000 ? error[..1000] : error });
    }
}
