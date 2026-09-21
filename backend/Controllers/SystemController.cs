using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Services;

namespace TejooWhatsApp.Controllers;

/// <summary>
/// Operational health for admins/HODs: incoming-message queue status (backlog, failures,
/// dead letters with retry/discard) and public-URL (ngrok) configuration sanity.
/// </summary>
[Authorize(Roles = "Admin,HOD")]
[ApiController]
[Route("api/[controller]")]
public class SystemController : ControllerBase
{
    private readonly MessageQueueService _queue;
    private readonly IConfiguration _config;
    private readonly TejooWhatsApp.AI.AiHealthState _aiHealth;

    public SystemController(MessageQueueService queue, IConfiguration config, TejooWhatsApp.AI.AiHealthState aiHealth)
    {
        _queue = queue;
        _config = config;
        _aiHealth = aiHealth;
    }

    // GET /api/system/ai-status — is the OpenAI account out of credits? Drives the dashboard warning banner.
    [HttpGet("ai-status")]
    public IActionResult GetAiStatus()
    {
        return Ok(new
        {
            creditsExhausted = _aiHealth.CreditsExhausted,
            since = _aiHealth.SinceUtc,
            message = _aiHealth.Message,
        });
    }

    // GET /api/system/queue-health
    [HttpGet("queue-health")]
    public async Task<IActionResult> GetQueueHealth()
    {
        var health = await _queue.GetHealthAsync();

        var publicBaseUrl = (_config["ExternalApis:PublicBaseUrl"] ?? "").TrimEnd('/');
        var isMissing = string.IsNullOrEmpty(publicBaseUrl);
        var isLocal = !isMissing &&
            (publicBaseUrl.Contains("localhost", StringComparison.OrdinalIgnoreCase)
             || publicBaseUrl.Contains("127.0.0.1")
             || publicBaseUrl.Contains("[::1]"));

        return Ok(new
        {
            queue = health,
            publicUrl = new
            {
                value = publicBaseUrl,
                configured = !isMissing,
                looksLocal = isLocal,
                healthy = !isMissing && !isLocal,
            }
        });
    }

    // POST /api/system/queue/{id}/retry
    [HttpPost("queue/{id:long}/retry")]
    public async Task<IActionResult> Retry(long id)
    {
        var ok = await _queue.RetryAsync(id);
        if (!ok) return NotFound(new { error = "Job not found or not in a retryable state" });
        return Ok(new { success = true });
    }

    // POST /api/system/queue/{id}/discard
    [HttpPost("queue/{id:long}/discard")]
    public async Task<IActionResult> Discard(long id)
    {
        var ok = await _queue.DiscardAsync(id);
        if (!ok) return NotFound(new { error = "Job not found or not a dead letter" });
        return Ok(new { success = true });
    }
}
