using Dapper;
using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Repositories;

public class AiPromptRepository
{
    private readonly DatabaseHelper _db;

    public AiPromptRepository(DatabaseHelper db)
    {
        _db = db;
    }

    public async Task<AiPrompt?> GetByKeyAsync(string promptKey)
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM AiPrompts WHERE PromptKey = @PromptKey AND IsActive = 1";
        return await conn.QueryFirstOrDefaultAsync<AiPrompt>(sql, new { PromptKey = promptKey });
    }

    public async Task<List<AiPrompt>> GetAllActiveAsync()
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM AiPrompts WHERE IsActive = 1 ORDER BY PromptKey";
        var result = await conn.QueryAsync<AiPrompt>(sql);
        return result.ToList();
    }

    public async Task<List<AiPrompt>> GetAllAsync()
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM AiPrompts ORDER BY PromptType, PromptKey";
        var result = await conn.QueryAsync<AiPrompt>(sql);
        return result.ToList();
    }

    public async Task<AiPrompt?> GetRouterPromptAsync()
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM AiPrompts WHERE PromptType = 'router' AND IsActive = 1";
        return await conn.QueryFirstOrDefaultAsync<AiPrompt>(sql);
    }

    public async Task<bool> UpdateAsync(AiPrompt prompt)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            UPDATE AiPrompts
            SET SystemPrompt = @SystemPrompt,
                Description = @Description,
                IsActive = @IsActive,
                UpdatedAt = GETUTCDATE()
            WHERE Id = @Id";

        var rows = await conn.ExecuteAsync(sql, prompt);
        return rows > 0;
    }
}
