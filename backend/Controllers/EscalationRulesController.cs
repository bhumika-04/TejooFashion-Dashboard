using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Models.DTOs;
using TejooWhatsApp.Services;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/[controller]")]
public class EscalationRulesController : ControllerBase
{
    private readonly EscalationRuleService _ruleService;

    public EscalationRulesController(EscalationRuleService ruleService)
    {
        _ruleService = ruleService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var rules = await _ruleService.GetAllRulesAsync();
        return Ok(rules);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var rule = await _ruleService.GetRuleByIdAsync(id);
        if (rule == null)
        {
            return NotFound(new { error = "Rule not found" });
        }
        return Ok(rule);
    }

    [TejooWhatsApp.Security.RequirePage("escalations")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateEscalationRuleRequest request)
    {
        var error = Validate(request.Name, request.RuleType, request.ConditionThreshold, request.ConditionKeywords);
        if (error != null) return BadRequest(new { error });

        var rule = await _ruleService.CreateRuleAsync(request);
        return Ok(rule);
    }

    [TejooWhatsApp.Security.RequirePage("escalations")]
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateEscalationRuleRequest request)
    {
        var error = Validate(request.Name, request.RuleType, request.ConditionThreshold, request.ConditionKeywords);
        if (error != null) return BadRequest(new { error });

        var rule = await _ruleService.UpdateRuleAsync(id, request);
        if (rule == null)
        {
            return NotFound(new { error = "Rule not found" });
        }
        return Ok(rule);
    }

    [TejooWhatsApp.Security.RequirePage("escalations")]
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await _ruleService.DeleteRuleAsync(id);
        if (!result)
        {
            return NotFound(new { error = "Rule not found" });
        }
        return Ok(new { success = true });
    }

    [TejooWhatsApp.Security.RequirePage("escalations")]
    [HttpPatch("{id}/toggle")]
    public async Task<IActionResult> ToggleActive(int id, [FromBody] ToggleActiveRequest request)
    {
        var result = await _ruleService.ToggleRuleActiveAsync(id, request.IsActive);
        if (!result)
        {
            return NotFound(new { error = "Rule not found" });
        }
        return Ok(new { success = true });
    }

    // Rules are applied to live messages (EscalationRuleEngine), so reject ones that could never fire.
    private static string? Validate(string? name, string? ruleType, string? threshold, string? keywords)
    {
        if (string.IsNullOrWhiteSpace(name)) return "Rule name is required.";
        var probe = new TejooWhatsApp.Models.Entities.EscalationRule { RuleType = ruleType ?? "", ConditionThreshold = threshold, ConditionKeywords = keywords };
        return EscalationRuleEngine.NormalizeType(ruleType) switch
        {
            "LowConfidence" when EscalationRuleEngine.ThresholdPercent(probe) is not { } t || t > 100
                => "Low Confidence rules need a threshold between 1 and 100 (AI confidence %, e.g. 50).",
            "Custom" when EscalationRuleEngine.Keywords(probe).Count == 0
                => "Custom rules need at least one keyword.",
            _ => null,
        };
    }
}

public class ToggleActiveRequest
{
    public bool IsActive { get; set; }
}
