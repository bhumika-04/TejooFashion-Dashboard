using Dapper;
using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Repositories;

public class WhatsAppSessionRepository
{
    private readonly DatabaseHelper _db;

    public WhatsAppSessionRepository(DatabaseHelper db)
    {
        _db = db;
    }

    public async Task<WhatsAppSession?> GetByIdAsync(int id)
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM WhatsAppSessions WHERE Id = @Id";
        return await conn.QueryFirstOrDefaultAsync<WhatsAppSession>(sql, new { Id = id });
    }

    public async Task<WhatsAppSession?> GetByPhoneNumberAsync(string phoneNumber)
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM WhatsAppSessions WHERE PhoneNumber = @PhoneNumber";
        return await conn.QueryFirstOrDefaultAsync<WhatsAppSession>(sql, new { PhoneNumber = phoneNumber });
    }

    public async Task<List<WhatsAppSession>> GetAllAsync(bool? isActive = null)
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM WhatsAppSessions WHERE 1=1";

        if (isActive.HasValue)
            sql += " AND IsActive = @IsActive";

        sql += " ORDER BY CreatedAt DESC";

        var result = await conn.QueryAsync<WhatsAppSession>(sql, new { IsActive = isActive });
        return result.ToList();
    }

    // Returns sessions with assigned user name in a single query — avoids N+1
    public async Task<List<WhatsAppSessionWithUser>> GetAllWithUserAsync(bool? isActive = null, int? assignedUserId = null)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT ws.*, u.FullName AS AssignedUserName
            FROM WhatsAppSessions ws
            LEFT JOIN Users u ON ws.AssignedUserId = u.Id
            WHERE 1=1";

        if (isActive.HasValue)
            sql += " AND ws.IsActive = @IsActive";

        if (assignedUserId.HasValue)
            sql += " AND ws.AssignedUserId = @AssignedUserId";

        sql += " ORDER BY ws.CreatedAt DESC";

        var result = await conn.QueryAsync<WhatsAppSessionWithUser>(sql, new { IsActive = isActive, AssignedUserId = assignedUserId });
        return result.ToList();
    }

    public async Task<int> CreateAsync(WhatsAppSession session)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            INSERT INTO WhatsAppSessions
            (Provider, PhoneNumber, AssignedUserId, InteraktApiKey,
             MetaPhoneNumberId, MetaAccessToken, IsConnected, IsActive, AutoReplyEnabled, MessagesToday,
             LastActiveAt, LastConnectedAt, CreatedAt, UpdatedAt)
            VALUES
            (@Provider, @PhoneNumber, @AssignedUserId, @InteraktApiKey,
             @MetaPhoneNumberId, @MetaAccessToken, @IsConnected, @IsActive, @AutoReplyEnabled, @MessagesToday,
             @LastActiveAt, @LastConnectedAt, @CreatedAt, @UpdatedAt);
            SELECT CAST(SCOPE_IDENTITY() as int);";

        return await conn.QuerySingleAsync<int>(sql, session);
    }

    public async Task<bool> UpdateAsync(WhatsAppSession session)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            UPDATE WhatsAppSessions
            SET Provider = @Provider,
                PhoneNumber = @PhoneNumber,
                AssignedUserId = @AssignedUserId,
                InteraktApiKey = @InteraktApiKey,
                MetaPhoneNumberId = @MetaPhoneNumberId,
                MetaAccessToken = @MetaAccessToken,
                IsConnected = @IsConnected,
                IsActive = @IsActive,
                AutoReplyEnabled = @AutoReplyEnabled,
                MessagesToday = @MessagesToday,
                LastActiveAt = @LastActiveAt,
                LastConnectedAt = @LastConnectedAt,
                UpdatedAt = @UpdatedAt
            WHERE Id = @Id";

        var rows = await conn.ExecuteAsync(sql, session);
        return rows > 0;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        using var conn = _db.CreateConnection();
        var sql = "DELETE FROM WhatsAppSessions WHERE Id = @Id";
        var rows = await conn.ExecuteAsync(sql, new { Id = id });
        return rows > 0;
    }

    public async Task<int> GetActiveCountAsync()
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT COUNT(*) FROM WhatsAppSessions WHERE IsActive = 1 AND IsConnected = 1";
        return await conn.ExecuteScalarAsync<int>(sql);
    }

    public async Task<bool> UpdateConnectionStatusAsync(int id, bool isConnected)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            UPDATE WhatsAppSessions
            SET IsConnected = @IsConnected,
                LastConnectedAt = CASE WHEN @IsConnected = 1 THEN GETUTCDATE() ELSE LastConnectedAt END
            WHERE Id = @Id";

        var rows = await conn.ExecuteAsync(sql, new { Id = id, IsConnected = isConnected });
        return rows > 0;
    }

    public async Task<WhatsAppSession?> GetFirstActiveByProviderAsync(string provider)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT TOP 1 * FROM WhatsAppSessions
            WHERE Provider = @Provider AND IsActive = 1
            ORDER BY CreatedAt ASC";
        return await conn.QueryFirstOrDefaultAsync<WhatsAppSession>(sql, new { Provider = provider });
    }

    public async Task IncrementMessagesTodayAsync(int sessionId)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            UPDATE WhatsAppSessions
            SET MessagesToday = MessagesToday + 1,
                LastActiveAt = GETUTCDATE()
            WHERE Id = @Id";
        await conn.ExecuteAsync(sql, new { Id = sessionId });
    }
}

// Flat projection for list view — includes user name without N+1
public class WhatsAppSessionWithUser : TejooWhatsApp.Models.Entities.WhatsAppSession
{
    public string AssignedUserName { get; set; } = string.Empty;
}
