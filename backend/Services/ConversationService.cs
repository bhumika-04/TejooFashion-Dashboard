using Microsoft.Data.SqlClient;
using TejooWhatsApp.AI;
using TejooWhatsApp.Models.DTOs;
using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Repositories;

namespace TejooWhatsApp.Services;

public class ConversationService
{
    private readonly ConversationRepository _conversationRepo;
    private readonly MessageRepository _messageRepo;
    private readonly WhatsAppSessionRepository _sessionRepo;
    private readonly UserRepository _userRepo;
    private readonly ConversationSummaryRepository _summaryRepo;
    private readonly OpenAiClient _openAiClient;
    private readonly NotificationService _notificationService;
    private readonly CustomerRepository _customerRepo;

    public ConversationService(
        ConversationRepository conversationRepo,
        MessageRepository messageRepo,
        WhatsAppSessionRepository sessionRepo,
        UserRepository userRepo,
        ConversationSummaryRepository summaryRepo,
        OpenAiClient openAiClient,
        NotificationService notificationService,
        CustomerRepository customerRepo)
    {
        _conversationRepo = conversationRepo;
        _messageRepo = messageRepo;
        _sessionRepo = sessionRepo;
        _userRepo = userRepo;
        _summaryRepo = summaryRepo;
        _openAiClient = openAiClient;
        _notificationService = notificationService;
        _customerRepo = customerRepo;
    }

    public async Task<ConversationDetailDTO?> GetConversationDetailAsync(int id)
    {
        var conversation = await _conversationRepo.GetByIdAsync(id);
        if (conversation == null) return null;

        var messages = await _messageRepo.GetByConversationIdAsync(id);
        var session = await _sessionRepo.GetByIdAsync(conversation.SessionId);
        var assignedUser = await _userRepo.GetByIdAsync(conversation.AssignedUserId);

        return new ConversationDetailDTO
        {
            Id = conversation.Id,
            SessionId = conversation.SessionId,
            CustomerPhone = conversation.CustomerPhone,
            CustomerName = conversation.CustomerName,
            BusinessPhone = conversation.BusinessPhone,
            Status = conversation.Status,
            Priority = conversation.Priority,
            AssignedUser = assignedUser != null ? MapToUserDTO(assignedUser) : null!,
            Session = session != null ? MapToSessionDTO(session, assignedUser?.FullName ?? "") : null!,
            Messages = messages.Select(MapToMessageDTO).ToList(),
            LastMessageAt = conversation.LastMessageAt,
            CreatedAt = conversation.CreatedAt,
            ClosedAt = conversation.ClosedAt
        };
    }

    public async Task<List<ConversationListDTO>> GetAllConversationsAsync(
        string? status = null,
        int? assignedUserId = null,
        int? sessionId = null,
        int limit = 100,
        int offset = 0)
    {
        var rows = await _conversationRepo.GetAllWithLastMessageAsync(status, assignedUserId, sessionId, limit, offset);

        return rows.Select(row => new ConversationListDTO
        {
            Id = row.Id,
            AssignedUserId = row.AssignedUserId,
            CustomerPhone = row.CustomerPhone,
            CustomerName = row.CustomerName,
            BusinessPhone = row.BusinessPhone,
            Status = row.Status,
            Priority = row.Priority,
            AssignedUserName = row.AssignedUserName,
            SessionDisplayName = row.SessionDisplayName ?? row.SessionPhoneNumber ?? "",
            LastMessageAt = row.LastMessageAt,
            LastMessagePreview = row.LastMessageContent,
            UnreadCount = 0,
            CreatedAt = row.CreatedAt,
            ClosedAt = row.ClosedAt
        }).ToList();
    }

    public async Task<Conversation?> GetOrCreateConversationAsync(int sessionId, string customerPhone, string? customerName = null)
    {
        // Try to get existing conversation
        var existing = await _conversationRepo.GetBySessionAndCustomerAsync(sessionId, customerPhone);
        if (existing != null)
        {
            // Update customer's last seen time on every inbound message
            await _customerRepo.UpsertAsync(customerPhone, customerName);
            return existing;
        }

        // Get session to get business phone and assigned user
        var session = await _sessionRepo.GetByIdAsync(sessionId);
        if (session == null) throw new Exception("Session not found");

        // Create new conversation
        var conversation = new Conversation
        {
            SessionId = sessionId,
            CustomerPhone = customerPhone,
            CustomerName = customerName,
            BusinessPhone = session.PhoneNumber,
            AssignedUserId = session.AssignedUserId,
            Status = "Open",
            Priority = "Normal",
            CreatedAt = DateTime.UtcNow
        };

        try
        {
            conversation.Id = await _conversationRepo.CreateAsync(conversation);
            // Upsert customer record so Customers page stays in sync
            await _customerRepo.UpsertAsync(customerPhone, customerName);
            return conversation;
        }
        catch (SqlException ex) when (ex.Number == 2627 || ex.Number == 2601)
        {
            // Unique constraint violation — two messages from the same customer arrived
            // simultaneously and both threads tried to INSERT. Re-select the one that won.
            var created = await _conversationRepo.GetBySessionAndCustomerAsync(sessionId, customerPhone);
            return created ?? throw new Exception($"Conversation race condition unresolvable for session {sessionId} / {customerPhone}");
        }
    }

    public async Task<bool> UpdateConversationStatusAsync(int id, string status)
    {
        return await _conversationRepo.UpdateStatusAsync(id, status);
    }

    public async Task<bool> DeleteConversationAsync(int id)
    {
        return await _conversationRepo.DeleteAsync(id);
    }

    public async Task<bool> UpdateLastMessageTimeAsync(int conversationId)
    {
        var conversation = await _conversationRepo.GetByIdAsync(conversationId);
        if (conversation == null) return false;

        conversation.LastMessageAt = DateTime.UtcNow;
        return await _conversationRepo.UpdateAsync(conversation);
    }

    public async Task<bool> AssignConversationAsync(int conversationId, int assignedUserId)
    {
        var updated = await _conversationRepo.UpdateAssignedUserAsync(conversationId, assignedUserId);
        if (!updated) return false;

        // Notify the newly assigned user via SignalR (skip when unassigning)
        if (assignedUserId > 0)
        {
            var conversation = await _conversationRepo.GetByIdAsync(conversationId);
            if (conversation != null)
            {
                await _notificationService.NotifyConversationAssignedAsync(
                    assignedUserId,
                    conversationId,
                    conversation.CustomerPhone,
                    conversation.CustomerName ?? conversation.CustomerPhone);
            }
        }

        return true;
    }

    public async Task<List<ConversationListDTO>> SearchConversationsAsync(string query, int limit = 30, int? assignedUserId = null)
    {
        var rows = await _conversationRepo.SearchAsync(query, limit, assignedUserId);
        return rows.Select(row => new ConversationListDTO
        {
            Id = row.Id,
            AssignedUserId = row.AssignedUserId,
            CustomerPhone = row.CustomerPhone,
            CustomerName = row.CustomerName,
            BusinessPhone = row.BusinessPhone,
            Status = row.Status,
            Priority = row.Priority,
            AssignedUserName = row.AssignedUserName,
            SessionDisplayName = row.SessionDisplayName ?? row.SessionPhoneNumber ?? "",
            LastMessageAt = row.LastMessageAt,
            LastMessagePreview = row.LastMessageContent,
            UnreadCount = 0,
            CreatedAt = row.CreatedAt,
            ClosedAt = row.ClosedAt
        }).ToList();
    }

    public async Task<ConversationSummaryDTO?> GetSummaryAsync(int conversationId)
    {
        var summary = await _summaryRepo.GetByConversationIdAsync(conversationId);
        if (summary == null) return null;
        return new ConversationSummaryDTO
        {
            SummaryText = summary.SummaryText,
            KeyTopics = summary.KeyTopics,
            SentimentScore = summary.SentimentScore,
            LastUpdatedAt = summary.LastUpdatedAt
        };
    }

    public async Task<ConversationSummaryDTO> GenerateSummaryAsync(int conversationId)
    {
        var messages = await _messageRepo.GetByConversationIdAsync(conversationId);
        if (messages.Count == 0)
            throw new Exception("No messages to summarize");

        // Build conversation transcript for OpenAI
        var transcript = string.Join("\n", messages.Select(m =>
            $"{(m.Direction == "inbound" ? "Customer" : "Agent")}: {m.Content}"));

        var systemPrompt = "You are a customer support analyst. Summarize this WhatsApp conversation in 2-3 sentences. " +
            "Also extract key topics as a comma-separated list and a sentiment score from -1.0 (negative) to 1.0 (positive). " +
            "Reply in this exact format:\nSUMMARY: <summary text>\nTOPICS: <topic1, topic2>\nSENTIMENT: <score>";

        var aiResponse = await _openAiClient.GetSimpleCompletionAsync(systemPrompt, transcript) ?? string.Empty;

        // Parse response
        var summaryText = ExtractField(aiResponse, "SUMMARY:") ?? "Summary not available";
        var keyTopics = ExtractField(aiResponse, "TOPICS:");
        decimal? sentiment = null;
        var sentimentStr = ExtractField(aiResponse, "SENTIMENT:");
        if (decimal.TryParse(sentimentStr, System.Globalization.NumberStyles.Any,
            System.Globalization.CultureInfo.InvariantCulture, out var parsed))
            sentiment = Math.Clamp(parsed, -1, 1);

        var entity = new ConversationSummary
        {
            ConversationId = conversationId,
            SummaryText = summaryText,
            KeyTopics = keyTopics,
            SentimentScore = sentiment,
            LastUpdatedAt = DateTime.UtcNow
        };

        await _summaryRepo.UpsertAsync(entity);

        return new ConversationSummaryDTO
        {
            SummaryText = summaryText,
            KeyTopics = keyTopics,
            SentimentScore = sentiment,
            LastUpdatedAt = entity.LastUpdatedAt
        };
    }

    private static string? ExtractField(string text, string fieldPrefix)
    {
        var line = text.Split('\n')
            .FirstOrDefault(l => l.TrimStart().StartsWith(fieldPrefix, StringComparison.OrdinalIgnoreCase));
        if (line == null) return null;
        var idx = line.IndexOf(':', StringComparison.Ordinal);
        return idx >= 0 ? line[(idx + 1)..].Trim() : null;
    }

    private UserDTO MapToUserDTO(User user) => new()
    {
        Id = user.Id,
        FullName = user.FullName,
        Email = user.Email,
        Phone = user.Phone,
        Role = user.Role,
        IsActive = user.IsActive,
        CreatedAt = user.CreatedAt
    };

    private WhatsAppSessionDTO MapToSessionDTO(WhatsAppSession session, string assignedUserName) => new()
    {
        Id = session.Id,
        Provider = session.Provider,
        PhoneNumber = session.PhoneNumber,
        DisplayName = session.DisplayName,
        AssignedUserName = assignedUserName,
        IsConnected = session.IsConnected,
        IsActive = session.IsActive,
        AutoReplyEnabled = session.AutoReplyEnabled,
        MessagesToday = session.MessagesToday,
        LastActiveAt = session.LastActiveAt,
        CreatedAt = session.CreatedAt
    };

    private MessageDTO MapToMessageDTO(Message message) => new()
    {
        Id = message.Id,
        ConversationId = message.ConversationId,
        Direction = message.Direction,
        MessageType = message.MessageType,
        Content = message.Content,
        MediaUrl = message.MediaUrl,
        IsAiGenerated = message.IsAiGenerated,
        Intent = message.Intent,
        Confidence = message.Confidence,
        CreatedAt = message.CreatedAt,
        DeliveredAt = message.DeliveredAt,
        ReadAt = message.ReadAt
    };
}
