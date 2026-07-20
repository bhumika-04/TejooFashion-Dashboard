using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Repositories;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/[controller]")]
public class ReportsController : ControllerBase
{
    private readonly ReportRepository _reportRepo;

    public ReportsController(ReportRepository reportRepo)
    {
        _reportRepo = reportRepo;
    }

    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboardStats()
    {
        var stats = await _reportRepo.GetDashboardStatsAsync();
        return Ok(stats);
    }

    [HttpGet("conversation-trends")]
    public async Task<IActionResult> GetConversationTrends([FromQuery] int days = 7)
    {
        var trends = await _reportRepo.GetConversationTrendsAsync(days);
        return Ok(trends);
    }

    [HttpGet("session-activity")]
    public async Task<IActionResult> GetSessionActivity()
    {
        var activity = await _reportRepo.GetSessionActivityAsync();
        return Ok(activity);
    }

    [HttpGet("agent-stats")]
    public async Task<IActionResult> GetAgentStats()
    {
        var stats = await _reportRepo.GetAgentStatsAsync();
        return Ok(stats);
    }

    /// <summary>
    /// Per-agent performance for a period: today | week | month
    /// Returns real avg response time computed from message timestamps.
    /// </summary>
    [HttpGet("performance")]
    public async Task<IActionResult> GetPerformance([FromQuery] string period = "today")
    {
        var now = DateTime.UtcNow;
        var from = period switch
        {
            "week"  => now.AddDays(-7),
            "month" => now.AddDays(-30),
            _       => now.Date
        };
        var stats = await _reportRepo.GetPerformanceStatsAsync(from, now);
        return Ok(stats);
    }

    // Team KPI trends: current window vs equal-length previous window (real deltas, no hardcoding).
    [HttpGet("performance-summary")]
    public async Task<IActionResult> GetPerformanceSummary([FromQuery] string period = "today")
    {
        var days = period switch { "week" => 7, "month" => 30, _ => 1 };
        var data = await _reportRepo.GetPerformanceComparisonAsync(days);
        return Ok(data);
    }

    [HttpGet("hourly-distribution")]
    public async Task<IActionResult> GetHourlyDistribution([FromQuery] int days = 7)
    {
        var data = await _reportRepo.GetHourlyDistributionAsync(days);
        return Ok(data);
    }

    // First-response-time SLA: overall + per-agent breach breakdown
    [HttpGet("response-sla")]
    public async Task<IActionResult> GetResponseSla([FromQuery] int days = 7, [FromQuery] int slaMinutes = 30)
    {
        var data = await _reportRepo.GetResponseSlaAsync(days, slaMinutes);
        return Ok(data);
    }

    // Current vs previous window comparison for headline KPIs
    [HttpGet("period-comparison")]
    public async Task<IActionResult> GetPeriodComparison([FromQuery] int days = 7)
    {
        var data = await _reportRepo.GetPeriodComparisonAsync(days);
        return Ok(data);
    }

    // Resolution + escalation analytics over the period
    [HttpGet("resolution")]
    public async Task<IActionResult> GetResolution([FromQuery] int days = 7)
    {
        var data = await _reportRepo.GetResolutionStatsAsync(days);
        return Ok(data);
    }

    // Tag distribution over the period — type=conversation|customer
    [HttpGet("tag-distribution")]
    public async Task<IActionResult> GetTagDistribution([FromQuery] string type = "conversation", [FromQuery] int days = 7)
    {
        var t = type?.ToLowerInvariant() == "customer" ? "customer" : "conversation";
        var data = await _reportRepo.GetTagDistributionAsync(t, days);
        return Ok(data);
    }

    [HttpGet("top-customers")]
    public async Task<IActionResult> GetTopCustomers([FromQuery] int days = 7, [FromQuery] int top = 10)
    {
        var data = await _reportRepo.GetTopCustomersAsync(days, top);
        return Ok(data);
    }
}
