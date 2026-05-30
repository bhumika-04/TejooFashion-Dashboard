namespace TejooWhatsApp.Models.Entities;

public class EscalationRule
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string RuleType { get; set; } = string.Empty; // "LowConfidence", "NegativeSentiment", "PaymentIntent", "Custom"
    public string Priority { get; set; } = string.Empty; // "High", "Normal", "Low"
    public bool IsActive { get; set; } = true;

    // Rule conditions (JSON serialized)
    public string? ConditionThreshold { get; set; } // e.g., "70" for confidence, "-0.5" for sentiment
    public string? ConditionKeywords { get; set; } // Comma-separated keywords

    // Assignment
    public string AssigneeTeam { get; set; } = string.Empty; // "Senior Support Team", "Sales Team", etc.
    public int? AssigneeUserId { get; set; } // Optional specific user assignment

    // Notification channels
    public bool NotifyDashboard { get; set; } = true;
    public bool NotifyEmail { get; set; } = false;
    public bool NotifySMS { get; set; } = false;

    // Audit
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
