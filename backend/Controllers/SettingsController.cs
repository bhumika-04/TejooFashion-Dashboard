using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Repositories;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/[controller]")]
public class SettingsController : ControllerBase
{
    private readonly SystemSettingsRepository _settings;

    public SettingsController(SystemSettingsRepository settings) => _settings = settings;

    // ── Escalation Policy ──────────────────────────────────────────────────────

    [HttpGet("escalation-policy")]
    public async Task<IActionResult> GetEscalationPolicy()
    {
        var all = await _settings.GetByPrefixAsync("escalation.");
        return Ok(new
        {
            mode                = all.GetValueOrDefault("escalation.mode",                "auto"),
            confidenceThreshold = int.TryParse(all.GetValueOrDefault("escalation.confidenceThreshold", "50"), out var t) ? t : 50
        });
    }

    [HttpPut("escalation-policy")]
    public async Task<IActionResult> UpdateEscalationPolicy([FromBody] EscalationPolicyRequest req)
    {
        var allowed = new HashSet<string> { "auto", "manual", "hybrid" };
        if (!allowed.Contains(req.Mode))
            return BadRequest(new { error = "mode must be auto | manual | hybrid" });
        if (req.ConfidenceThreshold < 0 || req.ConfidenceThreshold > 100)
            return BadRequest(new { error = "confidenceThreshold must be 0–100" });

        await _settings.SetManyAsync(new Dictionary<string, string>
        {
            ["escalation.mode"]                = req.Mode,
            ["escalation.confidenceThreshold"] = req.ConfidenceThreshold.ToString()
        });

        return Ok(new { success = true });
    }

    // ── Business Hours ──────────────────────────────────────────────────────────

    [HttpGet("business-hours")]
    public async Task<IActionResult> GetBusinessHours()
    {
        var all = await _settings.GetByPrefixAsync("businessHours.");
        return Ok(new
        {
            enabled  = all.GetValueOrDefault("businessHours.enabled", "false") == "true",
            start    = all.GetValueOrDefault("businessHours.start",   "09:00"),
            end      = all.GetValueOrDefault("businessHours.end",     "18:00"),
            timezone = all.GetValueOrDefault("businessHours.timezone","Asia/Kolkata")
        });
    }

    [HttpPut("business-hours")]
    public async Task<IActionResult> UpdateBusinessHours([FromBody] BusinessHoursRequest req)
    {
        await _settings.SetManyAsync(new Dictionary<string, string>
        {
            ["businessHours.enabled"]  = req.Enabled.ToString().ToLower(),
            ["businessHours.start"]    = req.Start,
            ["businessHours.end"]      = req.End,
            ["businessHours.timezone"] = req.Timezone
        });
        return Ok(new { success = true });
    }

    // ── Auto-Close ──────────────────────────────────────────────────────────────

    [HttpGet("auto-close")]
    public async Task<IActionResult> GetAutoClose()
    {
        var all = await _settings.GetByPrefixAsync("autoClose.");
        return Ok(new
        {
            enabled       = all.GetValueOrDefault("autoClose.enabled",       "false") == "true",
            inactiveHours = int.TryParse(all.GetValueOrDefault("autoClose.inactiveHours", "24"), out var h) ? h : 24
        });
    }

    [HttpPut("auto-close")]
    public async Task<IActionResult> UpdateAutoClose([FromBody] AutoCloseRequest req)
    {
        if (req.InactiveHours < 1)
            return BadRequest(new { error = "inactiveHours must be >= 1" });

        await _settings.SetManyAsync(new Dictionary<string, string>
        {
            ["autoClose.enabled"]       = req.Enabled.ToString().ToLower(),
            ["autoClose.inactiveHours"] = req.InactiveHours.ToString()
        });
        return Ok(new { success = true });
    }
}

public record EscalationPolicyRequest(string Mode, int ConfidenceThreshold);
public record BusinessHoursRequest(bool Enabled, string Start, string End, string Timezone);
public record AutoCloseRequest(bool Enabled, int InactiveHours);
