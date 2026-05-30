namespace TejooWhatsApp.Models.Entities;

public class WhatsAppSession
{
    public int Id { get; set; }

    // Provider Configuration
    public string Provider { get; set; } = string.Empty; // Interakt | Meta
    public string PhoneNumber { get; set; } = string.Empty;
    public string? DisplayName { get; set; }

    // User Assignment
    public int AssignedUserId { get; set; }

    // Provider-specific credentials
    public string? InteraktApiKey { get; set; }
    public string? InteraktWebhookSecret { get; set; }
    public string? MetaPhoneNumberId { get; set; }
    public string? MetaAccessToken { get; set; }

    // Status & Settings
    public bool IsConnected { get; set; } = false;
    public bool IsActive { get; set; } = true;
    public bool AutoReplyEnabled { get; set; } = true;

    // Metrics
    public int MessagesToday { get; set; } = 0;
    public DateTime? LastActiveAt { get; set; }
    public DateTime? LastConnectedAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public User AssignedUser { get; set; } = null!;
    public ICollection<Conversation> Conversations { get; set; } = new List<Conversation>();
}
