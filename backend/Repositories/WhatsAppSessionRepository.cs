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
        // "Messages today" is computed LIVE from the Messages table (IST day), not the stored
        // WhatsAppSessions.MessagesToday counter — that counter is cumulative and never resets,
        // so it would show an all-time total mislabelled as "today". This column is selected LAST
        // so it overrides ws.MessagesToday in the row mapper.
        var sql = @"
            SELECT ws.*, u.FullName AS AssignedUserName,
                   (SELECT MAX(m.CreatedAt)
                      FROM Messages m
                      INNER JOIN Conversations c ON c.Id = m.ConversationId
                      WHERE c.SessionId = ws.Id AND m.Direction = 'inbound') AS LastInboundAt,
                   (SELECT COUNT(*)
                      FROM Messages m
                      INNER JOIN Conversations c ON c.Id = m.ConversationId
                      WHERE c.SessionId = ws.Id
                        AND CAST(DATEADD(MINUTE,330,m.CreatedAt) AS DATE)
                          = CAST(DATEADD(MINUTE,330,GETUTCDATE()) AS DATE)) AS MessagesToday
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

    // "Messages today" is computed live from the Messages table in GetAllWithUserAsync, so the stored
    // WhatsAppSessions.MessagesToday counter is intentionally no longer maintained — it was cumulative,
    // never reset, and mislabelled as "today". This just stamps the session's last-activity time.
    public async Task TouchLastActiveAsync(int sessionId)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            UPDATE WhatsAppSessions
            SET LastActiveAt = GETUTCDATE()
            WHERE Id = @Id";
        await conn.ExecuteAsync(sql, new { Id = sessionId });
    }
}

// Flat projection for list view — includes user name without N+1
public class WhatsAppSessionWithUser : TejooWhatsApp.Models.Entities.WhatsAppSession
{
    public string AssignedUserName { get; set; } = string.Empty;
    public DateTime? LastInboundAt { get; set; }   // newest inbound message across this session's conversations
}
