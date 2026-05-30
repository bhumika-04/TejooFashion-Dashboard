using Dapper;
using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Repositories;

public class AuditLog
{
    public int Id { get; set; }
    public int? UserId { get; set; }
    public string? UserName { get; set; }
    public string Action { get; set; } = string.Empty;
    public string? EntityType { get; set; }
    public int? EntityId { get; set; }
    public string? OldValue { get; set; }
    public string? NewValue { get; set; }
    public string? IpAddress { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class AuditLogRepository
{
    private readonly DatabaseHelper _db;
    public AuditLogRepository(DatabaseHelper db) => _db = db;

    public async Task LogAsync(string action, int? userId = null, string? userName = null,
        string? entityType = null, int? entityId = null,
        string? oldValue = null, string? newValue = null, string? ipAddress = null)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync(@"
            INSERT INTO AuditLogs (Action, UserId, UserName, EntityType, EntityId, OldValue, NewValue, IpAddress)
            VALUES (@Action, @UserId, @UserName, @EntityType, @EntityId, @OldValue, @NewValue, @IpAddress)",
            new { Action = action, UserId = userId, UserName = userName,
                  EntityType = entityType, EntityId = entityId,
                  OldValue = oldValue, NewValue = newValue, IpAddress = ipAddress });
    }

    public async Task<(IEnumerable<AuditLog> Logs, int Total)> GetPagedAsync(
        int page = 1, int pageSize = 50,
        string? action = null, string? entityType = null, int? userId = null,
        DateTime? from = null, DateTime? to = null)
    {
        using var conn = _db.CreateConnection();

        var where = new List<string>();
        if (!string.IsNullOrEmpty(action))     where.Add("Action LIKE '%' + @Action + '%'");
        if (!string.IsNullOrEmpty(entityType)) where.Add("EntityType = @EntityType");
        if (userId.HasValue)                   where.Add("UserId = @UserId");
        if (from.HasValue)                     where.Add("CreatedAt >= @From");
        if (to.HasValue)                       where.Add("CreatedAt <= @To");

        var whereClause = where.Count > 0 ? "WHERE " + string.Join(" AND ", where) : "";

        var total = await conn.ExecuteScalarAsync<int>(
            $"SELECT COUNT(*) FROM AuditLogs {whereClause}",
            new { Action = action, EntityType = entityType, UserId = userId, From = from, To = to });

        var logs = await conn.QueryAsync<AuditLog>($@"
            SELECT * FROM AuditLogs {whereClause}
            ORDER BY CreatedAt DESC
            OFFSET {(page - 1) * pageSize} ROWS FETCH NEXT {pageSize} ROWS ONLY",
            new { Action = action, EntityType = entityType, UserId = userId, From = from, To = to });

        return (logs, total);
    }
}
