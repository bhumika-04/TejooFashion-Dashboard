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

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateEscalationRuleRequest request)
    {
        if (string.IsNullOrEmpty(request.Name) || string.IsNullOrEmpty(request.RuleType))
        {
            return BadRequest(new { error = "Name and RuleType are required" });
        }

        var rule = await _ruleService.CreateRuleAsync(request);
        return Ok(rule);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateEscalationRuleRequest request)
    {
        var rule = await _ruleService.UpdateRuleAsync(id, request);
        if (rule == null)
        {
            return NotFound(new { error = "Rule not found" });
        }
        return Ok(rule);
    }

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
}

public class ToggleActiveRequest
{
    public bool IsActive { get; set; }
}
