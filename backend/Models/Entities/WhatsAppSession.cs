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

    // AI behaviour for this number: off | suggest | auto. Default 'suggest' (AI drafts, CRR reviews).
    public string AiMode { get; set; } = "suggest";

    // First-response SLA target for this number, in minutes (drives SLA reports + Performance SLA-met %)
    public int SlaMinutes { get; set; } = 30;

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
