using Microsoft.AspNetCore.SignalR;
using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Repositories;

namespace TejooWhatsApp.Services;

public class NotificationHub : Hub
{
    private readonly ILogger<NotificationHub> _logger;

    public NotificationHub(ILogger<NotificationHub> logger)
    {
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        _logger.LogInformation("✓ Client connected: {ConnectionId}", Context.ConnectionId);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _logger.LogInformation("✓ Client disconnected: {ConnectionId}", Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }

    // Join user-specific group for targeted notifications
    public async Task JoinUserGroup(int userId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"user_{userId}");
        _logger.LogInformation("✓ User {UserId} joined notification group", userId);
    }

    // Join team group for team-wide notifications
    public async Task JoinTeamGroup(int teamId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"team_{teamId}");
        _logger.LogInformation("✓ User joined team {TeamId} notification group", teamId);
    }

    // Join a specific conversation — anyone viewing this conversation receives its messages in real-time
    public async Task JoinConversation(int conversationId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"conv_{conversationId}");
    }

    public async Task LeaveConversation(int conversationId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"conv_{conversationId}");
    }

    // Leave groups on logout
    public async Task LeaveUserGroup(int userId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"user_{userId}");
    }

    public async Task LeaveTeamGroup(int teamId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"team_{teamId}");
    }
}

// Service to send notifications from anywhere in the application
public class NotificationService
{
    private readonly IHubContext<NotificationHub> _hubContext;
    private readonly NotificationRepository _notificationRepo;
    private readonly UserRepository _userRepo;
    private readonly ILogger<NotificationService> _logger;

    public NotificationService(IHubContext<NotificationHub> hubContext, NotificationRepository notificationRepo, UserRepository userRepo, ILogger<NotificationService> logger)
    {
        _hubContext = hubContext;
        _notificationRepo = notificationRepo;
        _userRepo = userRepo;
        _logger = logger;
    }

    // Send notification to a specific user (real-time push + DB persistence)
    public async Task SendToUserAsync(int userId, NotificationMessage notification)
    {
        // Persist so the notification bell shows missed notifications after refresh/login
        await _notificationRepo.CreateAsync(new Notification
        {
            UserId = userId,
            Type = notification.Type,
            Title = notification.Title,
            Message = notification.Message,
            ConversationId = notification.ConversationId,
            EscalationId = notification.EscalationId,
            Priority = notification.Priority,
        });

        await _hubContext.Clients.Group($"user_{userId}").SendAsync("ReceiveNotification", notification);
        _logger.LogInformation("✓ Notification sent to user {UserId}: {Type}", userId, notification.Type);
    }

    // Send notification to all users in a team
    public async Task SendToTeamAsync(int teamId, NotificationMessage notification)
    {
        await _hubContext.Clients.Group($"team_{teamId}").SendAsync("ReceiveNotification", notification);
        _logger.LogInformation("✓ Notification sent to team {TeamId}: {Type}", teamId, notification.Type);
    }

    // Send notification to all active users (real-time + DB persisted per user)
    public async Task SendToAllAsync(NotificationMessage notification)
    {
        await _hubContext.Clients.All.SendAsync("ReceiveNotification", notification);
        // Persist for every active user so they see it after refresh/login
        var activeUsers = await _userRepo.GetAllAsync(isActive: true);
        foreach (var user in activeUsers)
        {
            await _notificationRepo.CreateAsync(new Notification
            {
                UserId      = user.Id,
                Type        = notification.Type,
                Title       = notification.Title,
                Message     = notification.Message,
                ConversationId = notification.ConversationId,
                Priority    = notification.Priority,
            });
        }
        _logger.LogInformation("✓ Notification broadcast to {Count} active users: {Type}", activeUsers.Count, notification.Type);
    }

    // Notify about new message — persisted to assigned user + Admins/Managers + real-time to anyone viewing
    public async Task NotifyNewMessageAsync(int userId, int conversationId, string customerPhone, string customerName, string messagePreview)
    {
        var notification = new NotificationMessage
        {
            Type = "new_message",
            Title = "New Message",
            Message = $"New message from {customerName ?? customerPhone}: {messagePreview}",
            ConversationId = conversationId,
            CustomerPhone = customerPhone,
            CustomerName = customerName
        };

        // Persist + push to the assigned user
        await SendToUserAsync(userId, notification);

        // Also persist + push to all Admin/HOD/Manager users so they always see activity
        // (skip if the assigned user is already an admin role to avoid duplicate)
        var supervisors = await _userRepo.GetAllAsync(isActive: true);
        foreach (var sup in supervisors.Where(u => u.Id != userId &&
            (u.Role == "Admin" || u.Role == "HOD" || u.Role == "Manager")))
        {
            await SendToUserAsync(sup.Id, notification);
        }

        // Also push to anyone currently viewing this conversation (regardless of assignment)
        await _hubContext.Clients.Group($"conv_{conversationId}").SendAsync("ReceiveNotification", notification);
    }

    // Notify about escalation
    public async Task NotifyEscalationAsync(int userId, int escalationId, int conversationId, string customerPhone, string reason, string priority)
    {
        var notification = new NotificationMessage
        {
            Type = "escalation",
            Title = $"{priority} Priority Escalation",
            Message = $"Conversation from {customerPhone} has been escalated: {reason}",
            EscalationId = escalationId,
            ConversationId = conversationId,
            CustomerPhone = customerPhone,
            Priority = priority
        };
        await SendToUserAsync(userId, notification);
    }

    // Notify about conversation assignment
    public async Task NotifyConversationAssignedAsync(int userId, int conversationId, string customerPhone, string customerName)
    {
        var notification = new NotificationMessage
        {
            Type = "conversation_assigned",
            Title = "New Conversation Assigned",
            Message = $"You have been assigned a conversation with {customerName ?? customerPhone}",
            ConversationId = conversationId,
            CustomerPhone = customerPhone,
            CustomerName = customerName
        };
        await SendToUserAsync(userId, notification);
    }

    // Notify about unread count update — real-time signal only, not persisted to DB
    public async Task NotifyUnreadCountAsync(int userId, int unreadCount)
    {
        var notification = new NotificationMessage
        {
            Type = "unread_count",
            Title = "Unread Messages",
            Message = $"You have {unreadCount} unread messages"
        };
        await _hubContext.Clients.Group($"user_{userId}").SendAsync("ReceiveNotification", notification);
    }
}

// Notification message model
public class NotificationMessage
{
    public string Type { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public int? ConversationId { get; set; }
    public int? EscalationId { get; set; }
    public string? CustomerPhone { get; set; }
    public string? CustomerName { get; set; }
    public string Priority { get; set; } = "Normal";
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}
