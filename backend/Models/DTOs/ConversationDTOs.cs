namespace TejooWhatsApp.Models.DTOs;

public class ConversationListDTO
{
    public int Id { get; set; }
    public int AssignedUserId { get; set; }
    public string CustomerPhone { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public string BusinessPhone { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Priority { get; set; } = string.Empty;
    public string AssignedUserName { get; set; } = string.Empty;
    public string SessionDisplayName { get; set; } = string.Empty;
    public DateTime? LastMessageAt { get; set; }
    public bool IsUnread { get; set; }       // inbound message newer than the viewer's last view
    public bool HasAiMessages { get; set; }  // drives the "AI Turn" filter on the conversations list
    public string? LastMessagePreview { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ClosedAt { get; set; }
}

public class ConversationDetailDTO
{
    public int Id { get; set; }
    public int SessionId { get; set; }
    public string CustomerPhone { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public string BusinessPhone { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Priority { get; set; } = string.Empty;
    public UserDTO AssignedUser { get; set; } = null!;
    public WhatsAppSessionDTO Session { get; set; } = null!;
    public List<MessageDTO> Messages { get; set; } = new();
    public ConversationSummaryDTO? Summary { get; set; }
    public DateTime? LastMessageAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ClosedAt { get; set; }
}

public class ConversationSummaryDTO
{
    public string SummaryText { get; set; } = string.Empty;
    public string? KeyTopics { get; set; }
    public decimal? SentimentScore { get; set; }
    public DateTime LastUpdatedAt { get; set; }
}

public class CreateConversationRequest
{
    public int SessionId { get; set; }
    public string CustomerPhone { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
}

public class UpdateConversationRequest
{
    public string? Status { get; set; }
    public string? Priority { get; set; }
    public int? AssignedUserId { get; set; }
}

public class AssignConversationRequest
{
    public int AssignedUserId { get; set; }
}

public class BulkActionRequest
{
    public int[] Ids { get; set; } = System.Array.Empty<int>();
    public string Action { get; set; } = "";   // "close" | "assign" | "tag"
    public int? UserId { get; set; }            // for "assign"
    public int? TagId { get; set; }             // for "tag"
}
