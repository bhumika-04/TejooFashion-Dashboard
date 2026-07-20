using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Repositories;

public class QuickReply
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string? Category { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class QuickReplyRepository
{
    private readonly DatabaseHelper _db;

    public QuickReplyRepository(DatabaseHelper db) => _db = db;

    public async Task<List<QuickReply>> GetAllActiveAsync()
    {
        using var conn = _db.CreateConnection();
        var result = await conn.QueryAsync<QuickReply>(
            "SELECT * FROM QuickReplies WHERE IsActive = 1 ORDER BY Category, Title");
        return result.ToList();
    }

    public async Task<QuickReply?> GetByIdAsync(int id)
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryFirstOrDefaultAsync<QuickReply>(
            "SELECT * FROM QuickReplies WHERE Id = @Id", new { Id = id });
    }

    public async Task<QuickReply> CreateAsync(string title, string content, string? category)
    {
        using var conn = _db.CreateConnection();
        var id = await conn.QuerySingleAsync<int>(@"
            INSERT INTO QuickReplies (Title, Content, Category, IsActive, CreatedAt, UpdatedAt)
            VALUES (@Title, @Content, @Category, 1, GETUTCDATE(), GETUTCDATE());
            SELECT CAST(SCOPE_IDENTITY() AS INT);",
            new { Title = title, Content = content, Category = category });

        return (await GetByIdAsync(id))!;
    }

    public async Task<bool> UpdateAsync(int id, string title, string content, string? category)
    {
        using var conn = _db.CreateConnection();
        var rows = await conn.ExecuteAsync(@"
            UPDATE QuickReplies
            SET Title = @Title, Content = @Content, Category = @Category, UpdatedAt = GETUTCDATE()
            WHERE Id = @Id",
            new { Id = id, Title = title, Content = content, Category = category });
        return rows > 0;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        using var conn = _db.CreateConnection();
        var rows = await conn.ExecuteAsync(
            "DELETE FROM QuickReplies WHERE Id = @Id", new { Id = id });
        return rows > 0;
    }
}
