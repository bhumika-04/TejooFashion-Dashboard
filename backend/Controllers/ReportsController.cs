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

    [HttpGet("hourly-distribution")]
    public async Task<IActionResult> GetHourlyDistribution([FromQuery] int days = 7)
    {
        var data = await _reportRepo.GetHourlyDistributionAsync(days);
        return Ok(data);
    }

    [HttpGet("top-customers")]
    public async Task<IActionResult> GetTopCustomers([FromQuery] int days = 7, [FromQuery] int top = 10)
    {
        var data = await _reportRepo.GetTopCustomersAsync(days, top);
        return Ok(data);
    }
}
