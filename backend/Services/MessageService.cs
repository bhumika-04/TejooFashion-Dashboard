using TejooWhatsApp.Models.DTOs;
using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Repositories;

namespace TejooWhatsApp.Services;

public class MessageService
{
    private readonly MessageRepository _messageRepo;
    private readonly ConversationRepository _conversationRepo;
    private readonly WhatsAppSessionRepository _sessionRepo;

    public MessageService(
        MessageRepository messageRepo,
        ConversationRepository conversationRepo,
        WhatsAppSessionRepository sessionRepo)
    {
        _messageRepo = messageRepo;
        _conversationRepo = conversationRepo;
        _sessionRepo = sessionRepo;
    }

    public async Task<Message> SaveInboundMessageAsync(
        int conversationId,
        string content,
        string messageType = "text",
        string? mediaUrl = null,
        string? providerMessageId = null)
    {
        var message = new Message
        {
            ConversationId = conversationId,
            Direction = "inbound",
            MessageType = messageType,
            Content = content,
            MediaUrl = mediaUrl,
            ProviderMessageId = providerMessageId,
            IsAiGenerated = false,
            CreatedAt = DateTime.UtcNow
        };

        message.Id = await _messageRepo.CreateAsync(message);

        // Update conversation last message time
        await UpdateConversationLastMessage(conversationId);

        return message;
    }

    public async Task<Message> SaveOutboundMessageAsync(
        int conversationId,
        string content,
        bool isAiGenerated = false,
        string? intent = null,
        decimal? confidence = null,
        string messageType = "text",
        string? mediaUrl = null,
        string? providerMessageId = null)
    {
        var message = new Message
        {
            ConversationId = conversationId,
            Direction = "outbound",
            MessageType = messageType,
            Content = content,
            MediaUrl = mediaUrl,
            ProviderMessageId = providerMessageId,
            IsAiGenerated = isAiGenerated,
            Intent = intent,
            Confidence = confidence,
            CreatedAt = DateTime.UtcNow
        };

        message.Id = await _messageRepo.CreateAsync(message);

        // Update conversation last message time
        await UpdateConversationLastMessage(conversationId);

        return message;
    }

    public async Task<List<MessageDTO>> GetConversationMessagesAsync(int conversationId, int limit = 50)
    {
        var messages = await _messageRepo.GetByConversationIdAsync(conversationId, limit);

        return messages.Select(m => new MessageDTO
        {
            Id = m.Id,
            ConversationId = m.ConversationId,
            Direction = m.Direction,
            MessageType = m.MessageType,
            Content = m.Content,
            MediaUrl = m.MediaUrl,
            IsAiGenerated = m.IsAiGenerated,
            Intent = m.Intent,
            Confidence = m.Confidence,
            CreatedAt = m.CreatedAt,
            DeliveredAt = m.DeliveredAt,
            ReadAt = m.ReadAt
        }).ToList();
    }

    public async Task<List<Message>> GetRecentMessagesForContextAsync(int conversationId, int count = 10)
    {
        return await _messageRepo.GetRecentMessagesAsync(conversationId, count);
    }

    private async Task UpdateConversationLastMessage(int conversationId)
    {
        await _conversationRepo.UpdateLastMessageAtAsync(conversationId);
    }
}
