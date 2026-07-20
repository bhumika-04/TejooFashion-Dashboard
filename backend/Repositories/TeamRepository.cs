using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Repositories;

public class TeamRepository
{
    private readonly DatabaseHelper _db;

    public TeamRepository(DatabaseHelper db)
    {
        _db = db;
    }

    public async Task<Team?> GetByIdAsync(int id)
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM Teams WHERE Id = @Id";
        return await conn.QueryFirstOrDefaultAsync<Team>(sql, new { Id = id });
    }

    public async Task<List<Team>> GetAllAsync(bool? isActive = null)
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM Teams WHERE 1=1";

        if (isActive.HasValue)
            sql += " AND IsActive = @IsActive";

        sql += " ORDER BY Name";

        var result = await conn.QueryAsync<Team>(sql, new { IsActive = isActive });
        return result.ToList();
    }

    // Get member count from TeamMembers table
    public async Task<int> GetMemberCountAsync(int teamId)
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT COUNT(*) FROM TeamMembers WHERE TeamId = @TeamId AND IsActive = 1";
        return await conn.QuerySingleAsync<int>(sql, new { TeamId = teamId });
    }

    public async Task<int> CreateAsync(Team team)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            INSERT INTO Teams
            (Name, Description, ManagerId, IsActive, CreatedAt, UpdatedAt)
            VALUES
            (@Name, @Description, @ManagerId, @IsActive, @CreatedAt, @UpdatedAt);
            SELECT CAST(SCOPE_IDENTITY() as int);";

        return await conn.QuerySingleAsync<int>(sql, team);
    }

    public async Task<bool> UpdateAsync(Team team)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            UPDATE Teams
            SET Name = @Name,
                Description = @Description,
                ManagerId = @ManagerId,
                IsActive = @IsActive,
                UpdatedAt = @UpdatedAt
            WHERE Id = @Id";

        var rows = await conn.ExecuteAsync(sql, team);
        return rows > 0;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        using var conn = _db.CreateConnection();
        var sql = "DELETE FROM Teams WHERE Id = @Id";
        var rows = await conn.ExecuteAsync(sql, new { Id = id });
        return rows > 0;
    }

}
