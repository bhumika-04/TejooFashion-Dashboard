using Dapper;
using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Repositories;

public class RolePermissionRepository
{
    private readonly DatabaseHelper _db;

    public RolePermissionRepository(DatabaseHelper db)
    {
        _db = db;
    }

    public async Task<List<RolePermission>> GetAllAsync()
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM RolePermissions ORDER BY Role, Page";
        var result = await conn.QueryAsync<RolePermission>(sql);
        return result.ToList();
    }

    public async Task<List<RolePermission>> GetByRoleAsync(string role)
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM RolePermissions WHERE Role = @Role ORDER BY Page";
        var result = await conn.QueryAsync<RolePermission>(sql, new { Role = role });
        return result.ToList();
    }

    public async Task<List<string>> GetAccessiblePagesAsync(string role)
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT Page FROM RolePermissions WHERE Role = @Role AND CanAccess = 1";
        var result = await conn.QueryAsync<string>(sql, new { Role = role });
        return result.ToList();
    }

    public async Task UpsertAsync(string role, string page, bool canAccess)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            MERGE RolePermissions AS target
            USING (SELECT @Role AS Role, @Page AS Page) AS source
            ON target.Role = source.Role AND target.Page = source.Page
            WHEN MATCHED THEN
                UPDATE SET CanAccess = @CanAccess, UpdatedAt = GETUTCDATE()
            WHEN NOT MATCHED THEN
                INSERT (Role, Page, CanAccess, UpdatedAt)
                VALUES (@Role, @Page, @CanAccess, GETUTCDATE());";

        await conn.ExecuteAsync(sql, new { Role = role, Page = page, CanAccess = canAccess });
    }

    public async Task BulkUpsertAsync(string role, Dictionary<string, bool> pageAccess)
    {
        foreach (var (page, canAccess) in pageAccess)
        {
            await UpsertAsync(role, page, canAccess);
        }
    }
}
