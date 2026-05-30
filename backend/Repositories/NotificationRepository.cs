using Dapper;
using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Repositories;

public class NotificationRepository
{
    private readonly DatabaseHelper _db;

    public NotificationRepository(DatabaseHelper db)
    {
        _db = db;
    }

    // Get notifications for a user
    public async Task<List<Notification>> GetByUserIdAsync(int userId, bool unreadOnly = false, int limit = 50)
    {
        using var connection = _db.CreateConnection();
        var sql = @"
            SELECT TOP (@Limit) n.*, c.CustomerPhone, c.CustomerName
            FROM Notifications n
            LEFT JOIN Conversations c ON n.ConversationId = c.Id
            WHERE n.UserId = @UserId
            " + (unreadOnly ? "AND n.IsRead = 0" : "") + @"
            ORDER BY n.CreatedAt DESC";

        var notifications = await connection.QueryAsync<Notification>(sql, new { UserId = userId, Limit = limit });
        return notifications.ToList();
    }

    // Get unread count for a user
    public async Task<int> GetUnreadCountAsync(int userId)
    {
        using var connection = _db.CreateConnection();
        var sql = "SELECT COUNT(*) FROM Notifications WHERE UserId = @UserId AND IsRead = 0";
        return await connection.ExecuteScalarAsync<int>(sql, new { UserId = userId });
    }

    // Create a notification
    public async Task<int> CreateAsync(Notification notification)
    {
        using var connection = _db.CreateConnection();
        var sql = @"
            INSERT INTO Notifications (UserId, Type, Title, Message, ConversationId, EscalationId, Priority, IsRead, CreatedAt)
            VALUES (@UserId, @Type, @Title, @Message, @ConversationId, @EscalationId, @Priority, 0, GETUTCDATE());
            SELECT CAST(SCOPE_IDENTITY() as int)";

        notification.Id = await connection.ExecuteScalarAsync<int>(sql, notification);
        return notification.Id;
    }

    // Mark notification as read
    public async Task<bool> MarkAsReadAsync(int notificationId)
    {
        using var connection = _db.CreateConnection();
        var sql = "UPDATE Notifications SET IsRead = 1, ReadAt = GETUTCDATE() WHERE Id = @Id";
        var affected = await connection.ExecuteAsync(sql, new { Id = notificationId });
        return affected > 0;
    }

    // Mark all notifications as read for a user
    public async Task<int> MarkAllAsReadAsync(int userId)
    {
        using var connection = _db.CreateConnection();
        var sql = "UPDATE Notifications SET IsRead = 1, ReadAt = GETUTCDATE() WHERE UserId = @UserId AND IsRead = 0";
        return await connection.ExecuteAsync(sql, new { UserId = userId });
    }

    // Delete old notifications (cleanup)
    public async Task<int> DeleteOldNotificationsAsync(int daysOld = 30)
    {
        using var connection = _db.CreateConnection();
        var sql = "DELETE FROM Notifications WHERE CreatedAt < DATEADD(day, -@DaysOld, GETUTCDATE())";
        return await connection.ExecuteAsync(sql, new { DaysOld = daysOld });
    }
}

public class ConversationViewRepository
{
    private readonly DatabaseHelper _db;

    public ConversationViewRepository(DatabaseHelper db)
    {
        _db = db;
    }

    // Update or create last viewed time
    public async Task UpdateLastViewedAsync(int conversationId, int userId)
    {
        using var connection = _db.CreateConnection();
        var sql = @"
            MERGE ConversationViews AS target
            USING (SELECT @ConversationId AS ConversationId, @UserId AS UserId) AS source
            ON target.ConversationId = source.ConversationId AND target.UserId = source.UserId
            WHEN MATCHED THEN
                UPDATE SET LastViewedAt = GETUTCDATE()
            WHEN NOT MATCHED THEN
                INSERT (ConversationId, UserId, LastViewedAt)
                VALUES (@ConversationId, @UserId, GETUTCDATE());";

        await connection.ExecuteAsync(sql, new { ConversationId = conversationId, UserId = userId });
    }

    // Get last viewed time for a conversation
    public async Task<DateTime?> GetLastViewedAsync(int conversationId, int userId)
    {
        using var connection = _db.CreateConnection();
        var sql = "SELECT LastViewedAt FROM ConversationViews WHERE ConversationId = @ConversationId AND UserId = @UserId";
        return await connection.QueryFirstOrDefaultAsync<DateTime?>(sql, new { ConversationId = conversationId, UserId = userId });
    }

    // Get unread message count for a conversation (messages after last view)
    public async Task<int> GetUnreadMessageCountAsync(int conversationId, int userId)
    {
        using var connection = _db.CreateConnection();
        var sql = @"
            SELECT COUNT(*)
            FROM Messages m
            WHERE m.ConversationId = @ConversationId
              AND m.Direction = 'inbound'
              AND m.CreatedAt > ISNULL(
                  (SELECT LastViewedAt FROM ConversationViews WHERE ConversationId = @ConversationId AND UserId = @UserId),
                  '1900-01-01'
              )";

        return await connection.ExecuteScalarAsync<int>(sql, new { ConversationId = conversationId, UserId = userId });
    }

    // Get total unread conversations count for a user
    public async Task<int> GetTotalUnreadConversationsAsync(int userId)
    {
        using var connection = _db.CreateConnection();
        var sql = @"
            SELECT COUNT(DISTINCT c.Id)
            FROM Conversations c
            INNER JOIN Messages m ON m.ConversationId = c.Id
            LEFT JOIN ConversationViews cv ON cv.ConversationId = c.Id AND cv.UserId = @UserId
            WHERE c.AssignedUserId = @UserId
              AND c.Status != 'Closed'
              AND m.Direction = 'inbound'
              AND m.CreatedAt > ISNULL(cv.LastViewedAt, '1900-01-01')";

        return await connection.ExecuteScalarAsync<int>(sql, new { UserId = userId });
    }

    // Get conversations with unread counts for a user
    public async Task<List<ConversationUnreadInfo>> GetConversationsWithUnreadAsync(int userId)
    {
        using var connection = _db.CreateConnection();
        var sql = @"
            SELECT
                c.Id AS ConversationId,
                c.CustomerPhone,
                c.CustomerName,
                COUNT(m.Id) AS UnreadCount,
                MAX(m.CreatedAt) AS LastMessageAt
            FROM Conversations c
            INNER JOIN Messages m ON m.ConversationId = c.Id
            LEFT JOIN ConversationViews cv ON cv.ConversationId = c.Id AND cv.UserId = @UserId
            WHERE c.AssignedUserId = @UserId
              AND c.Status != 'Closed'
              AND m.Direction = 'inbound'
              AND m.CreatedAt > ISNULL(cv.LastViewedAt, '1900-01-01')
            GROUP BY c.Id, c.CustomerPhone, c.CustomerName
            ORDER BY MAX(m.CreatedAt) DESC";

        var results = await connection.QueryAsync<ConversationUnreadInfo>(sql, new { UserId = userId });
        return results.ToList();
    }
}

public class ConversationUnreadInfo
{
    public int ConversationId { get; set; }
    public string CustomerPhone { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public int UnreadCount { get; set; }
    public DateTime LastMessageAt { get; set; }
}
