using Dapper;
using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/[controller]")]
public class WebhookLogsController : ControllerBase
{
    private readonly DatabaseHelper _db;
    public WebhookLogsController(DatabaseHelper db) => _db = db;

    // GET /api/webhooklogs?page=1&pageSize=50&provider=&success=
    [HttpGet]
    public async Task<IActionResult> Get(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? provider = null,
        [FromQuery] bool? success = null)
    {
        using var conn = _db.CreateConnection();

        var where = new List<string>();
        if (!string.IsNullOrEmpty(provider)) where.Add("Provider = @Provider");
        if (success.HasValue)               where.Add("ProcessedSuccessfully = @Success");
        var whereClause = where.Count > 0 ? "WHERE " + string.Join(" AND ", where) : "";

        var total = await conn.ExecuteScalarAsync<int>(
            $"SELECT COUNT(*) FROM WebhookLogs {whereClause}",
            new { Provider = provider, Success = success });

        var logs = await conn.QueryAsync<WebhookLogDto>($@"
            SELECT Id, Provider, Payload, ProcessedSuccessfully, ErrorMessage, ReceivedAt
            FROM WebhookLogs {whereClause}
            ORDER BY ReceivedAt DESC
            OFFSET {(page - 1) * pageSize} ROWS FETCH NEXT {pageSize} ROWS ONLY",
            new { Provider = provider, Success = success });

        return Ok(new { logs, total, page, pageSize });
    }
}

public class WebhookLogDto
{
    public int Id { get; set; }
    public string? Provider { get; set; }
    public string? Payload { get; set; }
    public bool ProcessedSuccessfully { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTime? ReceivedAt { get; set; }
}
