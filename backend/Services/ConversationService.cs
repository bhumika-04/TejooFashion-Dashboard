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
    private readonly TagRepository _tagRepo;
    private readonly EscalationRepository _escalationRepo;

    public ConversationService(
        ConversationRepository conversationRepo,
        MessageRepository messageRepo,
        WhatsAppSessionRepository sessionRepo,
        UserRepository userRepo,
        ConversationSummaryRepository summaryRepo,
        OpenAiClient openAiClient,
        NotificationService notificationService,
        CustomerRepository customerRepo,
        TagRepository tagRepo,
        EscalationRepository escalationRepo)
    {
        _conversationRepo = conversationRepo;
        _messageRepo = messageRepo;
        _sessionRepo = sessionRepo;
        _userRepo = userRepo;
        _summaryRepo = summaryRepo;
        _openAiClient = openAiClient;
        _notificationService = notificationService;
        _customerRepo = customerRepo;
        _tagRepo = tagRepo;
        _escalationRepo = escalationRepo;
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

    public Task<ConversationCounts> GetCountsAsync(IReadOnlyList<int>? assignedUserIds = null, int? sessionId = null, int? viewerUserId = null)
        => _conversationRepo.GetCountsAsync(assignedUserIds, sessionId, viewerUserId);

    public async Task<List<ConversationListDTO>> GetAllConversationsAsync(
        string? status = null,
        IReadOnlyList<int>? assignedUserIds = null,
        int? sessionId = null,
        int limit = 100,
        int offset = 0,
        int? viewerUserId = null)
    {
        var rows = await _conversationRepo.GetAllWithLastMessageAsync(status, assignedUserIds, sessionId, limit, offset, viewerUserId);

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
            IsUnread = row.IsUnread,
            HasAiMessages = row.HasAiMessages,
            CreatedAt = row.CreatedAt,
            ClosedAt = row.ClosedAt
        }).ToList();
    }

    public Task MarkViewedAsync(int conversationId, int userId)
        => _conversationRepo.MarkViewedAsync(conversationId, userId);

    public Task<List<SessionConvCount>> GetCountsBySessionAsync(IReadOnlyList<int>? assignedUserIds = null)
        => _conversationRepo.GetCountsBySessionAsync(assignedUserIds);

    /// <summary>Open chats assigned to this user that are overdue for a reply past the session SLA.</summary>
    public Task<List<SlaBreachRow>> GetSlaBreachesAsync(int userId)
        => _conversationRepo.GetSlaBreachesForUserAsync(userId);

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
        var ok = await _conversationRepo.UpdateStatusAsync(id, status);

        if (ok && string.Equals(status, "Closed", StringComparison.OrdinalIgnoreCase))
        {
            // Resolve any active escalation so the timeout matrix stops bumping/notifying on it.
            try { await _escalationRepo.ResolveActiveByConversationAsync(id, "Auto-resolved: conversation closed"); }
            catch { /* best-effort */ }

            // Generate its summary immediately so the agent who closed it (and the customer profile)
            // sees an up-to-date recap. Best-effort.
            try { await GenerateSummaryAsync(id); }
            catch { /* no messages / AI unavailable — the background summarizer will retry */ }
        }

        return ok;
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

    /// <summary>
    /// Applies one action ("close" | "assign" | "tag") to many conversations.
    /// Returns the number successfully affected. Best-effort per id — one failure doesn't abort the rest.
    /// </summary>
    public async Task<int> BulkActionAsync(IEnumerable<int> ids, string action, int? userId, int? tagId)
    {
        var affected = 0;
        foreach (var id in ids.Distinct())
        {
            try
            {
                var ok = action switch
                {
                    // Bulk close updates status directly — it deliberately does NOT generate an AI
                    // summary per conversation (that would be one OpenAI call each, synchronously).
                    // The background ConversationSummaryService picks closed conversations up instead.
                    "close"  => await CloseWithoutSummaryAsync(id),
                    "assign" when userId is > 0 => await AssignConversationAsync(id, userId.Value),
                    "tag"    when tagId  is > 0 => await TagConversationAsync(id, tagId.Value),
                    _ => false,
                };
                if (ok) affected++;
            }
            catch { /* skip this id, keep going */ }
        }
        return affected;
    }

    // Closes a conversation without the synchronous AI summary (used by bulk close) but still
    // resolves any active escalation so the timeout matrix stops bumping a closed conversation.
    private async Task<bool> CloseWithoutSummaryAsync(int id)
    {
        var ok = await _conversationRepo.UpdateStatusAsync(id, "Closed");
        if (ok)
        {
            try { await _escalationRepo.ResolveActiveByConversationAsync(id, "Auto-resolved: conversation closed"); }
            catch { /* best-effort */ }
        }
        return ok;
    }

    private async Task<bool> TagConversationAsync(int conversationId, int tagId)
    {
        await _tagRepo.AddToConversationAsync(conversationId, tagId, null);
        return true;
    }

    public async Task<List<ConversationListDTO>> SearchConversationsAsync(string query, int limit = 30, IReadOnlyList<int>? assignedUserIds = null)
    {
        var rows = await _conversationRepo.SearchAsync(query, limit, assignedUserIds);
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
            HasAiMessages = row.HasAiMessages,
            CreatedAt = row.CreatedAt,
            ClosedAt = row.ClosedAt
        }).ToList();
    }

    public async Task<ConversationSummaryDTO?> GetSummaryAsync(int conversationId)
    {
        var summary = await _summaryRepo.GetByConversationIdAsync(conversationId);
        if (summary == null) return null;
        var conv = await _conversationRepo.GetByIdAsync(conversationId);
        return new ConversationSummaryDTO
        {
            SummaryText = summary.SummaryText,
            KeyTopics = summary.KeyTopics,
            SentimentScore = summary.SentimentScore,
            LastUpdatedAt = summary.LastUpdatedAt,
            SummaryArchivedAt = conv?.SummaryArchivedAt
        };
    }

    public async Task<ConversationSummaryDTO> GenerateSummaryAsync(int conversationId, int messageLimit = 50)
    {
        // The retention job passes a large limit so the pre-delete summary covers everything it is
        // about to permanently delete (not just the oldest 50), preventing silent data loss.
        var messages = await _messageRepo.GetByConversationIdAsync(conversationId, messageLimit);
        var prior = await _summaryRepo.GetByConversationIdAsync(conversationId);
        if (messages.Count == 0 && prior == null)
            throw new Exception("No messages to summarize");

        // Build conversation transcript for OpenAI
        var transcript = string.Join("\n", messages.Select(m =>
            $"{(m.Direction == "inbound" ? "Customer" : "Agent")}: {m.Content ?? m.Transcript}"));

        // CUMULATIVE: fold the previous summary in so nothing is lost once old messages are purged
        // by the 30-day retention job (the summary becomes the permanent record).
        var userMessage = !string.IsNullOrWhiteSpace(prior?.SummaryText)
            ? $"PREVIOUS SUMMARY (covers older messages, some of which may already be deleted):\n{prior.SummaryText}\n\nNEWER MESSAGES:\n{transcript}"
            : transcript;

        var systemPrompt = "You are a customer support analyst. Produce an updated CUMULATIVE summary of this WhatsApp " +
            "conversation in 2-4 sentences that preserves everything important from the PREVIOUS SUMMARY (if given) AND the " +
            "newer messages — so nothing is lost even after older messages are deleted. " +
            "Also extract key topics as a comma-separated list and a sentiment score from -1.0 (negative) to 1.0 (positive). " +
            "Reply in this exact format:\nSUMMARY: <summary text>\nTOPICS: <topic1, topic2>\nSENTIMENT: <score>";

        var aiResponse = await _openAiClient.GetSimpleCompletionAsync(systemPrompt, userMessage) ?? string.Empty;

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

        // Sentiment-driven prioritization: a clearly negative conversation is raised to High priority
        // so it surfaces for follow-up. (Tagging is left to AutoTagService against the admin taxonomy,
        // the single source of auto tags — adding a hardcoded tag here would conflict with its reconcile.)
        if (sentiment.HasValue && sentiment.Value <= AiHeuristics.ComplaintSentimentThreshold)
        {
            try { await _conversationRepo.UpdatePriorityAsync(conversationId, "High"); }
            catch { /* best-effort — never fail summary generation over a priority update */ }
        }

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
