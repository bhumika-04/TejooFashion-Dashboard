using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Repositories;
using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Services;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/[controller]")]
public class NotificationsController : ControllerBase
{
    private readonly NotificationRepository _notificationRepo;
    private readonly ConversationViewRepository _conversationViewRepo;
    private readonly NotificationService _notificationService;
    private readonly ILogger<NotificationsController> _logger;

    public NotificationsController(
        NotificationRepository notificationRepo,
        ConversationViewRepository conversationViewRepo,
        NotificationService notificationService,
        ILogger<NotificationsController> logger)
    {
        _notificationRepo = notificationRepo;
        _conversationViewRepo = conversationViewRepo;
        _notificationService = notificationService;
        _logger = logger;
    }

    // Get notifications for a user
    [HttpGet("user/{userId:int}")]
    public async Task<IActionResult> GetUserNotifications(int userId, [FromQuery] bool unreadOnly = false, [FromQuery] int limit = 50)
    {
        var notifications = await _notificationRepo.GetByUserIdAsync(userId, unreadOnly, limit);
        var unreadCount = await _notificationRepo.GetUnreadCountAsync(userId);

        return Ok(new
        {
            notifications,
            unreadCount
        });
    }

    // Get unread count only
    [HttpGet("user/{userId:int}/unread-count")]
    public async Task<IActionResult> GetUnreadCount(int userId)
    {
        var count = await _notificationRepo.GetUnreadCountAsync(userId);
        return Ok(new { unreadCount = count });
    }

    // Mark notification as read
    [HttpPost("{notificationId}/read")]
    public async Task<IActionResult> MarkAsRead(int notificationId)
    {
        var result = await _notificationRepo.MarkAsReadAsync(notificationId);
        if (!result)
        {
            return NotFound(new { error = "Notification not found" });
        }

        _logger.LogInformation("✓ Notification marked as read: {NotificationId}", notificationId);
        return Ok(new { success = true });
    }

    // Mark all notifications as read for a user
    [HttpPost("user/{userId:int}/read-all")]
    public async Task<IActionResult> MarkAllAsRead(int userId)
    {
        var count = await _notificationRepo.MarkAllAsReadAsync(userId);
        _logger.LogInformation("✓ Marked {Count} notifications as read for user {UserId}", count, userId);
        return Ok(new { success = true, markedCount = count });
    }

    // Record that user viewed a conversation (for unread tracking)
    [HttpPost("conversation/{conversationId}/view")]
    public async Task<IActionResult> MarkConversationViewed(int conversationId, [FromQuery] int userId)
    {
        await _conversationViewRepo.UpdateLastViewedAsync(conversationId, userId);
        _logger.LogInformation("✓ Conversation {ConversationId} marked as viewed by user {UserId}", conversationId, userId);
        return Ok(new { success = true });
    }

    // Get unread message count for a specific conversation
    [HttpGet("conversation/{conversationId}/unread")]
    public async Task<IActionResult> GetConversationUnreadCount(int conversationId, [FromQuery] int userId)
    {
        var count = await _conversationViewRepo.GetUnreadMessageCountAsync(conversationId, userId);
        return Ok(new { unreadCount = count });
    }

    // Get total unread conversations count for a user
    [HttpGet("user/{userId:int}/unread-conversations")]
    public async Task<IActionResult> GetUnreadConversations(int userId)
    {
        var totalUnread = await _conversationViewRepo.GetTotalUnreadConversationsAsync(userId);
        var conversations = await _conversationViewRepo.GetConversationsWithUnreadAsync(userId);

        return Ok(new
        {
            totalUnreadConversations = totalUnread,
            conversations
        });
    }

    // Create a test notification (for development)
    [HttpPost("test")]
    public async Task<IActionResult> CreateTestNotification([FromBody] CreateNotificationRequest request)
    {
        var notification = new Notification
        {
            UserId = request.UserId,
            Type = request.Type,
            Title = request.Title,
            Message = request.Message,
            ConversationId = request.ConversationId,
            Priority = request.Priority ?? "Normal"
        };

        notification.Id = await _notificationRepo.CreateAsync(notification);

        // Send real-time notification via SignalR
        await _notificationService.SendToUserAsync(request.UserId, new NotificationMessage
        {
            Type = notification.Type,
            Title = notification.Title,
            Message = notification.Message,
            ConversationId = notification.ConversationId,
            Priority = notification.Priority
        });

        _logger.LogInformation("✓ Test notification created for user {UserId}: {Title}", request.UserId, request.Title);

        return Ok(new { success = true, notificationId = notification.Id });
    }
}

public class CreateNotificationRequest
{
    public int UserId { get; set; }
    public string Type { get; set; } = "system";
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public int? ConversationId { get; set; }
    public string? Priority { get; set; }
}
