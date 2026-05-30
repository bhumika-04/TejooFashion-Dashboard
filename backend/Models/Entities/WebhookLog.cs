namespace TejooWhatsApp.Models.Entities;

public class WebhookLog
{
    public int Id { get; set; }
    public string Provider { get; set; } = string.Empty;
    public string? Payload { get; set; }
    public int? StatusCode { get; set; }
    public string? ErrorMessage { get; set; }
    public bool ProcessedSuccessfully { get; set; } = true;
    public DateTime ReceivedAt { get; set; } = DateTime.UtcNow;
}
