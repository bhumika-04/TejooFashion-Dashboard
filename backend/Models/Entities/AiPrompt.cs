namespace TejooWhatsApp.Models.Entities;

public class AiPrompt
{
    public int Id { get; set; }
    public string PromptKey { get; set; } = string.Empty; // router | general_query | order_status | payment_query
    public string PromptType { get; set; } = string.Empty; // router | specialist
    public string SystemPrompt { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
