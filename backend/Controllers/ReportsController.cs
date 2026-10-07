using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;
using TejooWhatsApp.Repositories;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/[controller]")]
public class ReportsController : ControllerBase
{
    private readonly ReportRepository _reportRepo;
    private readonly AiSuggestionRepository _aiSuggestions;

    public ReportsController(ReportRepository reportRepo, AiSuggestionRepository aiSuggestions)
    {
        _reportRepo = reportRepo;
        _aiSuggestions = aiSuggestions;
    }

    // CRR/agents only ever see their OWN data (personal Overview). Resolved from the JWT so it
    // can't be bypassed by a client-supplied param. Null = privileged role (company-wide view).
    private int? ScopeUserId() =>
        TejooWhatsApp.Security.PageAccessService.IsAgentRole(User)
            ? TejooWhatsApp.Security.PageAccessService.UserIdOf(User) ?? -1   // -1 = matches nothing, fail closed
            : null;

    /// <summary>Midnight today in India (IST, UTC+5:30), as a UTC instant — "today" everywhere else in the app.</summary>
    private static DateTime IstTodayStartUtc() => DateTime.UtcNow.AddMinutes(330).Date.AddMinutes(-330);

    // from/to are IST calendar dates (yyyy-MM-dd); omitted → today. Scopes the historical
    // dashboard metrics (conversations, messages, AI rate) to the selected range.
    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboardStats([FromQuery] string? from = null, [FromQuery] string? to = null)
    {
        var stats = await _reportRepo.GetDashboardStatsAsync(from, to, ScopeUserId());
        return Ok(stats);
    }

    [TejooWhatsApp.Security.RequirePage("reports", "performance")]
    [HttpGet("conversation-trends")]
    public async Task<IActionResult> GetConversationTrends([FromQuery] int days = 7)
    {
        var trends = await _reportRepo.GetConversationTrendsAsync(days);
        return Ok(trends);
    }

    [HttpGet("session-activity")]
    public async Task<IActionResult> GetSessionActivity()
    {
        var activity = await _reportRepo.GetSessionActivityAsync(ScopeUserId());
        return Ok(activity);
    }

    [TejooWhatsApp.Security.RequirePage("reports", "performance")]
    [HttpGet("agent-stats")]
    public async Task<IActionResult> GetAgentStats([FromQuery] int days = 36500)
    {
        var stats = await _reportRepo.GetAgentStatsAsync(days);
        return Ok(stats);
    }

    /// <summary>
    /// Per-agent performance for a period: today | week | month
    /// Returns real avg response time computed from message timestamps.
    /// </summary>
    [TejooWhatsApp.Security.RequirePage("reports", "performance")]
    [HttpGet("performance")]
    public async Task<IActionResult> GetPerformance([FromQuery] string period = "today")
    {
        var now = DateTime.UtcNow;
        var from = period switch
        {
            "week"  => now.AddDays(-7),
            "month" => now.AddDays(-30),
            _       => IstTodayStartUtc()
        };
        var stats = await _reportRepo.GetPerformanceStatsAsync(from, now);
        return Ok(stats);
    }

    // AI copilot acceptance analytics: how often CRRs used the AI drafts (as-is / edited / dismissed).
    [TejooWhatsApp.Security.RequirePage("reports", "performance")]
    [HttpGet("ai-suggestions")]
    public async Task<IActionResult> GetAiSuggestionStats([FromQuery] string period = "week")
    {
        var now = DateTime.UtcNow;
        var from = period switch
        {
            "today" => IstTodayStartUtc(),
            "month" => now.AddDays(-30),
            _       => now.AddDays(-7)
        };
        var stats = await _aiSuggestions.GetAcceptanceStatsAsync(from, now);
        return Ok(stats);
    }

    // Per-agent AI-copilot acceptance breakdown.
    [TejooWhatsApp.Security.RequirePage("reports", "performance")]
    [HttpGet("ai-suggestions/by-agent")]
    public async Task<IActionResult> GetAiSuggestionsByAgent([FromQuery] string period = "week")
    {
        var now = DateTime.UtcNow;
        var from = period switch { "today" => IstTodayStartUtc(), "month" => now.AddDays(-30), _ => now.AddDays(-7) };
        return Ok(await _aiSuggestions.GetAcceptanceByAgentAsync(from, now));
    }

    // Customer sentiment analytics (distribution + daily trend) from conversation summaries.
    [TejooWhatsApp.Security.RequirePage("reports", "performance")]
    [HttpGet("sentiment")]
    public async Task<IActionResult> GetSentiment([FromQuery] int days = 7)
        => Ok(await _reportRepo.GetSentimentAnalyticsAsync(days));

    // Daily average first-response time (minutes) trend over the period.
    [TejooWhatsApp.Security.RequirePage("reports", "performance")]
    [HttpGet("response-time-trend")]
    public async Task<IActionResult> GetResponseTimeTrend([FromQuery] int days = 7)
        => Ok(await _reportRepo.GetResponseTimeTrendAsync(days));

    // Team KPI trends: current window vs equal-length previous window (real deltas, no hardcoding).
    [TejooWhatsApp.Security.RequirePage("reports", "performance")]
    [HttpGet("performance-summary")]
    public async Task<IActionResult> GetPerformanceSummary([FromQuery] string period = "today")
    {
        var days = period switch { "week" => 7, "month" => 30, _ => 1 };
        var data = await _reportRepo.GetPerformanceComparisonAsync(days);
        return Ok(data);
    }

    [TejooWhatsApp.Security.RequirePage("reports", "performance")]
    [HttpGet("hourly-distribution")]
    public async Task<IActionResult> GetHourlyDistribution([FromQuery] int days = 7)
    {
        var data = await _reportRepo.GetHourlyDistributionAsync(days);
        return Ok(data);
    }

    // First-response-time SLA: overall + per-agent breach breakdown
    [TejooWhatsApp.Security.RequirePage("reports", "performance", "sessions")]
    [HttpGet("response-sla")]
    public async Task<IActionResult> GetResponseSla([FromQuery] int days = 7, [FromQuery] int slaMinutes = 30)
    {
        var data = await _reportRepo.GetResponseSlaAsync(days, slaMinutes);
        return Ok(data);
    }

    // Current vs previous window comparison for headline KPIs
    [TejooWhatsApp.Security.RequirePage("reports", "performance")]
    [HttpGet("period-comparison")]
    public async Task<IActionResult> GetPeriodComparison([FromQuery] int days = 7)
    {
        var data = await _reportRepo.GetPeriodComparisonAsync(days);
        return Ok(data);
    }

    // Resolution + escalation analytics over the period
    [TejooWhatsApp.Security.RequirePage("reports", "performance")]
    [HttpGet("resolution")]
    public async Task<IActionResult> GetResolution([FromQuery] int days = 7)
    {
        var data = await _reportRepo.GetResolutionStatsAsync(days);
        return Ok(data);
    }

    // Tag distribution over the period — type=conversation|customer
    [TejooWhatsApp.Security.RequirePage("reports", "performance")]
    [HttpGet("tag-distribution")]
    public async Task<IActionResult> GetTagDistribution([FromQuery] string type = "conversation", [FromQuery] int days = 7)
    {
        var t = type?.ToLowerInvariant() == "customer" ? "customer" : "conversation";
        var data = await _reportRepo.GetTagDistributionAsync(t, days);
        return Ok(data);
    }

    [TejooWhatsApp.Security.RequirePage("reports", "performance")]
    [HttpGet("top-customers")]
    public async Task<IActionResult> GetTopCustomers([FromQuery] int days = 7, [FromQuery] int top = 10)
    {
        var data = await _reportRepo.GetTopCustomersAsync(days, top);
        return Ok(data);
    }
}
