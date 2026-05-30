namespace TejooWhatsApp.Models.DTOs;

public class WhatsAppSessionDTO
{
    public int Id { get; set; }
    public string Provider { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public int AssignedUserId { get; set; }
    public string AssignedUserName { get; set; } = string.Empty;
    public bool IsConnected { get; set; }
    public bool IsActive { get; set; }
    public bool AutoReplyEnabled { get; set; }
    public int MessagesToday { get; set; }
    public DateTime? LastActiveAt { get; set; }
    public DateTime CreatedAt { get; set; }
    // Returned for edit pre-fill — internal dashboard only
    public string? ApiKey { get; set; }
}

public class CreateSessionRequest
{
    public string Provider { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public int AssignedUserId { get; set; }
    public string? InteraktApiKey { get; set; }
    public string? MetaPhoneNumberId { get; set; }
    public string? MetaAccessToken { get; set; }
}

public class UpdateSessionRequest
{
    public int? AssignedUserId { get; set; }
    public bool? IsActive { get; set; }
    public bool? IsConnected { get; set; }
    public bool? AutoReplyEnabled { get; set; }
    public string? InteraktApiKey { get; set; }
    public string? MetaPhoneNumberId { get; set; }
    public string? MetaAccessToken { get; set; }
}

public class TestConnectionRequest
{
    public string Provider { get; set; } = string.Empty;

    // Interakt fields
    public string? ApiKey { get; set; }

    // Meta fields
    public string? MetaPhoneNumberId { get; set; }
    public string? MetaBusinessAccountId { get; set; }
    public string? MetaAccessToken { get; set; }
}
