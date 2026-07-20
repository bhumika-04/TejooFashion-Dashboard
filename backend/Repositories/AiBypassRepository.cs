using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Repositories;

public class AiBypassNumber
{
    public int Id { get; set; }
    public string Phone { get; set; } = string.Empty;
    public string? Name { get; set; }
    public string? Reason { get; set; }
    public string Type { get; set; } = "customer"; // customer | internal
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
}

public class AiBypassRepository
{
    private readonly DatabaseHelper _db;
    public AiBypassRepository(DatabaseHelper db) => _db = db;

    public async Task<IEnumerable<AiBypassNumber>> GetAllAsync()
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<AiBypassNumber>(
            "SELECT * FROM AiBypassNumbers ORDER BY [Type], CreatedAt DESC");
    }

    // Used by orchestrator on every inbound message — must be fast
    public async Task<bool> IsActiveBypassAsync(string phone)
    {
        using var conn = _db.CreateConnection();
        var count = await conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(1) FROM AiBypassNumbers WHERE Phone = @Phone AND IsActive = 1",
            new { Phone = phone });
        return count > 0;
    }

    public async Task<int> AddAsync(string phone, string? name, string? reason, string type)
    {
        using var conn = _db.CreateConnection();
        return await conn.ExecuteScalarAsync<int>(@"
            MERGE AiBypassNumbers AS target
            USING (SELECT @Phone AS Phone) AS source ON target.Phone = source.Phone
            WHEN MATCHED THEN
                UPDATE SET Name = COALESCE(@Name, target.Name),
                           Reason = COALESCE(@Reason, target.Reason),
                           [Type] = @Type, IsActive = 1
            WHEN NOT MATCHED THEN
                INSERT (Phone, Name, Reason, [Type]) VALUES (@Phone, @Name, @Reason, @Type)
            OUTPUT inserted.Id;",
            new { Phone = phone, Name = name, Reason = reason, Type = type });
    }

    public async Task<int> BulkAddAsync(IEnumerable<(string Phone, string? Name, string Type)> entries)
    {
        var added = 0;
        foreach (var (phone, name, type) in entries)
        {
            try { await AddAsync(phone, name, null, type); added++; }
            catch { /* skip duplicates */ }
        }
        return added;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        using var conn = _db.CreateConnection();
        return await conn.ExecuteAsync(
            "DELETE FROM AiBypassNumbers WHERE Id = @Id", new { Id = id }) > 0;
    }

    public async Task<bool> ToggleActiveAsync(int id, bool isActive)
    {
        using var conn = _db.CreateConnection();
        return await conn.ExecuteAsync(
            "UPDATE AiBypassNumbers SET IsActive = @IsActive WHERE Id = @Id",
            new { Id = id, IsActive = isActive }) > 0;
    }
}
