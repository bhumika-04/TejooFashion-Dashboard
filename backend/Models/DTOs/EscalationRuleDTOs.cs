namespace TejooWhatsApp.Models.DTOs;

public class CreateEscalationRuleRequest
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string RuleType { get; set; } = string.Empty;
    public string Priority { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public string? ConditionThreshold { get; set; }
    public string? ConditionKeywords { get; set; }
    public string AssigneeTeam { get; set; } = string.Empty;
    public int? AssigneeUserId { get; set; }
    public bool NotifyDashboard { get; set; } = true;
    public bool NotifyEmail { get; set; } = false;
    public bool NotifySMS { get; set; } = false;
}

public class UpdateEscalationRuleRequest
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string RuleType { get; set; } = string.Empty;
    public string Priority { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public string? ConditionThreshold { get; set; }
    public string? ConditionKeywords { get; set; }
    public string AssigneeTeam { get; set; } = string.Empty;
    public int? AssigneeUserId { get; set; }
    public bool NotifyDashboard { get; set; }
    public bool NotifyEmail { get; set; }
    public bool NotifySMS { get; set; }
}

public class EscalationRuleResponse
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string RuleType { get; set; } = string.Empty;
    public string Priority { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public string? ConditionThreshold { get; set; }
    public string? ConditionKeywords { get; set; }
    public string AssigneeTeam { get; set; } = string.Empty;
    public int? AssigneeUserId { get; set; }
    public string? AssigneeUserName { get; set; }
    public bool NotifyDashboard { get; set; }
    public bool NotifyEmail { get; set; }
    public bool NotifySMS { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
