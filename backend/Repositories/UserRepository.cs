using Dapper;
using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Repositories;

public class UserRepository
{
    private readonly DatabaseHelper _db;

    public UserRepository(DatabaseHelper db)
    {
        _db = db;
    }

    public async Task<User?> GetByIdAsync(int id)
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM Users WHERE Id = @Id";
        return await conn.QueryFirstOrDefaultAsync<User>(sql, new { Id = id });
    }

    public async Task<User?> GetByEmailAsync(string email)
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM Users WHERE Email = @Email";
        return await conn.QueryFirstOrDefaultAsync<User>(sql, new { Email = email });
    }

    public async Task<List<User>> GetAllAsync(bool? isActive = null, string? role = null)
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM Users WHERE 1=1";

        if (isActive.HasValue)
            sql += " AND IsActive = @IsActive";

        if (!string.IsNullOrEmpty(role))
            sql += " AND Role = @Role";

        sql += " ORDER BY FullName";

        var result = await conn.QueryAsync<User>(sql, new { IsActive = isActive, Role = role });
        return result.ToList();
    }

    public async Task<List<User>> GetByRoleAsync(string role)
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM Users WHERE Role = @Role AND IsActive = 1 ORDER BY FullName";
        var result = await conn.QueryAsync<User>(sql, new { Role = role });
        return result.ToList();
    }

    public async Task<int> CreateAsync(User user)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            INSERT INTO Users
            (FullName, Email, PasswordHash, Role, IsActive, CreatedAt, UpdatedAt)
            VALUES
            (@FullName, @Email, @PasswordHash, @Role, @IsActive, @CreatedAt, @UpdatedAt);
            SELECT CAST(SCOPE_IDENTITY() as int);";

        return await conn.QuerySingleAsync<int>(sql, user);
    }

    public async Task<bool> UpdateAsync(User user)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            UPDATE Users
            SET FullName = @FullName,
                Email = @Email,
                PasswordHash = @PasswordHash,
                Role = @Role,
                IsActive = @IsActive,
                UpdatedAt = @UpdatedAt
            WHERE Id = @Id";

        var rows = await conn.ExecuteAsync(sql, user);
        return rows > 0;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        using var conn = _db.CreateConnection();
        var sql = "DELETE FROM Users WHERE Id = @Id";
        var rows = await conn.ExecuteAsync(sql, new { Id = id });
        return rows > 0;
    }

    // Returns any active Manager or CRR — used as a last-resort escalation target
    // when the normal hierarchy chain produces no result (e.g. unassigned conversation)
    public async Task<User?> GetFirstAvailableAgentAsync()
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT TOP 1 * FROM Users
            WHERE IsActive = 1 AND Role IN ('Manager', 'CRR')
            ORDER BY CASE Role WHEN 'Manager' THEN 1 ELSE 2 END, Id";
        return await conn.QueryFirstOrDefaultAsync<User>(sql);
    }

    public async Task<bool> EmailExistsAsync(string email, int? excludeUserId = null)
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT COUNT(*) FROM Users WHERE Email = @Email";

        if (excludeUserId.HasValue)
            sql += " AND Id != @ExcludeUserId";

        var count = await conn.ExecuteScalarAsync<int>(sql, new { Email = email, ExcludeUserId = excludeUserId });
        return count > 0;
    }
}
