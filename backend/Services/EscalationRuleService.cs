using TejooWhatsApp.Models.DTOs;
using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Repositories;
using Microsoft.Extensions.Logging;

namespace TejooWhatsApp.Services;

public class EscalationRuleService
{
    private readonly EscalationRuleRepository _ruleRepository;
    private readonly UserRepository _userRepository;
    private readonly ILogger<EscalationRuleService> _logger;

    public EscalationRuleService(
        EscalationRuleRepository ruleRepository,
        UserRepository userRepository,
        ILogger<EscalationRuleService> logger)
    {
        _ruleRepository = ruleRepository;
        _userRepository = userRepository;
        _logger = logger;
    }

    public async Task<List<EscalationRuleResponse>> GetAllRulesAsync()
    {
        var rules = await _ruleRepository.GetAllWithUserAsync();
        return rules.Select(rule =>
        {
            var response = MapToResponse(rule);
            response.AssigneeUserName = rule.AssigneeUserName;
            return response;
        }).ToList();
    }

    public async Task<EscalationRuleResponse?> GetRuleByIdAsync(int id)
    {
        var rule = await _ruleRepository.GetByIdAsync(id);
        if (rule == null) return null;

        var response = MapToResponse(rule);

        if (rule.AssigneeUserId.HasValue)
        {
            var user = await _userRepository.GetByIdAsync(rule.AssigneeUserId.Value);
            response.AssigneeUserName = user?.FullName;
        }

        return response;
    }

    public async Task<EscalationRuleResponse> CreateRuleAsync(CreateEscalationRuleRequest request)
    {
        var rule = new EscalationRule
        {
            Name = request.Name,
            Description = request.Description,
            RuleType = request.RuleType,
            Priority = request.Priority,
            IsActive = request.IsActive,
            ConditionThreshold = request.ConditionThreshold,
            ConditionKeywords = request.ConditionKeywords,
            AssigneeTeam = request.AssigneeTeam,
            AssigneeUserId = request.AssigneeUserId,
            NotifyDashboard = request.NotifyDashboard,
            NotifyEmail = request.NotifyEmail,
            NotifySMS = request.NotifySMS
        };

        rule = await _ruleRepository.CreateAsync(rule);

        _logger.LogInformation("✓ Escalation rule created: '{RuleName}' (Type: {RuleType}, Priority: {Priority})",
            rule.Name, rule.RuleType, rule.Priority);

        var response = MapToResponse(rule);
        if (rule.AssigneeUserId.HasValue)
        {
            var user = await _userRepository.GetByIdAsync(rule.AssigneeUserId.Value);
            response.AssigneeUserName = user?.FullName;
        }

        return response;
    }

    public async Task<EscalationRuleResponse?> UpdateRuleAsync(int id, UpdateEscalationRuleRequest request)
    {
        var rule = await _ruleRepository.GetByIdAsync(id);
        if (rule == null) return null;

        rule.Name = request.Name;
        rule.Description = request.Description;
        rule.RuleType = request.RuleType;
        rule.Priority = request.Priority;
        rule.IsActive = request.IsActive;
        rule.ConditionThreshold = request.ConditionThreshold;
        rule.ConditionKeywords = request.ConditionKeywords;
        rule.AssigneeTeam = request.AssigneeTeam;
        rule.AssigneeUserId = request.AssigneeUserId;
        rule.NotifyDashboard = request.NotifyDashboard;
        rule.NotifyEmail = request.NotifyEmail;
        rule.NotifySMS = request.NotifySMS;

        await _ruleRepository.UpdateAsync(rule);

        _logger.LogInformation("✓ Escalation rule updated: '{RuleName}' (ID: {RuleId})", rule.Name, rule.Id);

        var response = MapToResponse(rule);
        if (rule.AssigneeUserId.HasValue)
        {
            var user = await _userRepository.GetByIdAsync(rule.AssigneeUserId.Value);
            response.AssigneeUserName = user?.FullName;
        }

        return response;
    }

    public async Task<bool> DeleteRuleAsync(int id)
    {
        var rule = await _ruleRepository.GetByIdAsync(id);
        var result = await _ruleRepository.DeleteAsync(id);
        if (result)
        {
            _logger.LogInformation("✓ Escalation rule deleted: '{RuleName}' (ID: {RuleId})",
                rule?.Name ?? "Unknown", id);
        }
        return result;
    }

    public async Task<bool> ToggleRuleActiveAsync(int id, bool isActive)
    {
        var rule = await _ruleRepository.GetByIdAsync(id);
        var result = await _ruleRepository.ToggleActiveAsync(id, isActive);
        if (result)
        {
            _logger.LogInformation("✓ Escalation rule {Action}: '{RuleName}' (ID: {RuleId})",
                isActive ? "activated" : "deactivated", rule?.Name ?? "Unknown", id);
        }
        return result;
    }

    private EscalationRuleResponse MapToResponse(EscalationRule rule)
    {
        return new EscalationRuleResponse
        {
            Id = rule.Id,
            Name = rule.Name,
            Description = rule.Description,
            RuleType = rule.RuleType,
            Priority = rule.Priority,
            IsActive = rule.IsActive,
            ConditionThreshold = rule.ConditionThreshold,
            ConditionKeywords = rule.ConditionKeywords,
            AssigneeTeam = rule.AssigneeTeam,
            AssigneeUserId = rule.AssigneeUserId,
            NotifyDashboard = rule.NotifyDashboard,
            NotifyEmail = rule.NotifyEmail,
            NotifySMS = rule.NotifySMS,
            CreatedAt = rule.CreatedAt,
            UpdatedAt = rule.UpdatedAt
        };
    }
}
