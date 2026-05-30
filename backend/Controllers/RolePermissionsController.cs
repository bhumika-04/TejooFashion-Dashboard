using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Repositories;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/[controller]")]
public class RolePermissionsController : ControllerBase
{
    private readonly RolePermissionRepository _repo;
    private readonly ILogger<RolePermissionsController> _logger;

    public RolePermissionsController(RolePermissionRepository repo, ILogger<RolePermissionsController> logger)
    {
        _repo = repo;
        _logger = logger;
    }

    // GET api/rolepermissions — all permissions grouped by role
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var all = await _repo.GetAllAsync();
        var grouped = all
            .GroupBy(p => p.Role)
            .ToDictionary(
                g => g.Key,
                g => g.ToDictionary(p => p.Page, p => p.CanAccess)
            );
        return Ok(grouped);
    }

    // GET api/rolepermissions/{role}/pages — accessible page list for a role
    [HttpGet("{role}/pages")]
    public async Task<IActionResult> GetPages(string role)
    {
        var pages = await _repo.GetAccessiblePagesAsync(role);
        return Ok(pages);
    }

    // POST api/rolepermissions — upsert a single permission
    [HttpPost]
    public async Task<IActionResult> Upsert([FromBody] UpsertPermissionRequest request)
    {
        await _repo.UpsertAsync(request.Role, request.Page, request.CanAccess);
        _logger.LogInformation("✓ Role permission updated: {Role}/{Page} = {CanAccess}", request.Role, request.Page, request.CanAccess);
        return Ok(new { success = true });
    }

    // PUT api/rolepermissions/{role} — bulk update all pages for a role
    [HttpPut("{role}")]
    public async Task<IActionResult> BulkUpdate(string role, [FromBody] Dictionary<string, bool> pageAccess)
    {
        await _repo.BulkUpsertAsync(role, pageAccess);
        _logger.LogInformation("✓ Bulk role permissions updated for {Role} ({Count} pages)", role, pageAccess.Count);
        return Ok(new { success = true });
    }
}

public class UpsertPermissionRequest
{
    public string Role { get; set; } = string.Empty;
    public string Page { get; set; } = string.Empty;
    public bool CanAccess { get; set; }
}
