using Dapper;
using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Repositories;

public class WebhookLogRepository
{
    private readonly DatabaseHelper _db;

    public WebhookLogRepository(DatabaseHelper db)
    {
        _db = db;
    }

    public async Task<int> CreateAsync(WebhookLog log)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            INSERT INTO WebhookLogs
            (Provider, Payload, StatusCode, ErrorMessage, ProcessedSuccessfully, ReceivedAt)
            VALUES
            (@Provider, @Payload, @StatusCode, @ErrorMessage, @ProcessedSuccessfully, @ReceivedAt);
            SELECT CAST(SCOPE_IDENTITY() as int);";

        return await conn.QuerySingleAsync<int>(sql, log);
    }

    public async Task<List<WebhookLog>> GetRecentAsync(int limit = 100)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT TOP (@Limit) * FROM WebhookLogs
            ORDER BY ReceivedAt DESC";

        var result = await conn.QueryAsync<WebhookLog>(sql, new { Limit = limit });
        return result.ToList();
    }

    public async Task<List<WebhookLog>> GetFailedAsync(int limit = 50)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT TOP (@Limit) * FROM WebhookLogs
            WHERE ProcessedSuccessfully = 0
            ORDER BY ReceivedAt DESC";

        var result = await conn.QueryAsync<WebhookLog>(sql, new { Limit = limit });
        return result.ToList();
    }
}
