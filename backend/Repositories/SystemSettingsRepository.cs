using Dapper;
using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Repositories;

public class SystemSettingsRepository
{
    private readonly DatabaseHelper _db;

    public SystemSettingsRepository(DatabaseHelper db) => _db = db;

    public async Task<string?> GetAsync(string key)
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryFirstOrDefaultAsync<string>(
            "SELECT [Value] FROM SystemSettings WHERE [Key] = @Key",
            new { Key = key });
    }

    public async Task<Dictionary<string, string>> GetByPrefixAsync(string prefix)
    {
        using var conn = _db.CreateConnection();
        var rows = await conn.QueryAsync<(string Key, string Value)>(
            "SELECT [Key], [Value] FROM SystemSettings WHERE [Key] LIKE @Prefix",
            new { Prefix = prefix + "%" });
        return rows.ToDictionary(r => r.Key, r => r.Value);
    }

    public async Task SetAsync(string key, string value, string? updatedBy = null)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync(@"
            MERGE SystemSettings AS target
            USING (SELECT @Key AS [Key]) AS source ON target.[Key] = source.[Key]
            WHEN MATCHED    THEN UPDATE SET [Value] = @Value, UpdatedAt = GETUTCDATE(), UpdatedBy = @UpdatedBy
            WHEN NOT MATCHED THEN INSERT ([Key], [Value], UpdatedAt, UpdatedBy)
                                  VALUES (@Key,  @Value, GETUTCDATE(), @UpdatedBy);",
            new { Key = key, Value = value, UpdatedBy = updatedBy });
    }

    public async Task SetManyAsync(Dictionary<string, string> settings, string? updatedBy = null)
    {
        foreach (var (key, value) in settings)
            await SetAsync(key, value, updatedBy);
    }
}
