using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Repositories;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/[controller]")]
public class AuditLogsController : ControllerBase
{
    private readonly AuditLogRepository _audit;
    public AuditLogsController(AuditLogRepository audit) => _audit = audit;

    // GET /api/auditlogs?page=1&pageSize=50&action=&entityType=&userId=&from=&to=
    [HttpGet]
    public async Task<IActionResult> Get(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? action = null,
        [FromQuery] string? entityType = null,
        [FromQuery] int? userId = null,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null)
    {
        var (logs, total) = await _audit.GetPagedAsync(page, pageSize, action, entityType, userId, from, to);
        return Ok(new { logs, total, page, pageSize });
    }
}
