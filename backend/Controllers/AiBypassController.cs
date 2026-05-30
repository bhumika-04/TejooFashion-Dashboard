using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Repositories;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/aibypass")]
public class AiBypassController : ControllerBase
{
    private readonly AiBypassRepository _repo;
    public AiBypassController(AiBypassRepository repo) => _repo = repo;

    [HttpGet]
    public async Task<IActionResult> GetAll()
        => Ok(await _repo.GetAllAsync());

    [HttpPost]
    public async Task<IActionResult> Add([FromBody] AddBypassRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Phone))
            return BadRequest(new { error = "Phone is required" });

        var phone = NormalizePhone(req.Phone);
        var id = await _repo.AddAsync(phone, req.Name, req.Reason, req.Type ?? "customer");
        return Ok(new { success = true, id });
    }

    [HttpPost("bulk")]
    public async Task<IActionResult> BulkAdd([FromBody] BulkBypassRequest req)
    {
        if (req.Entries == null || !req.Entries.Any())
            return BadRequest(new { error = "No entries provided" });

        var entries = req.Entries
            .Where(e => !string.IsNullOrWhiteSpace(e.Phone))
            .Select(e => (NormalizePhone(e.Phone!), e.Name, e.Type ?? "customer"))
            .ToList();

        var count = await _repo.BulkAddAsync(entries);
        return Ok(new { success = true, added = count });
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var ok = await _repo.DeleteAsync(id);
        return ok ? Ok(new { success = true }) : NotFound();
    }

    [HttpPatch("{id:int}/toggle")]
    public async Task<IActionResult> Toggle(int id, [FromBody] ToggleRequest req)
    {
        var ok = await _repo.ToggleActiveAsync(id, req.IsActive);
        return ok ? Ok(new { success = true }) : NotFound();
    }

    private static string NormalizePhone(string raw)
    {
        var p = raw.Trim().Replace(" ", "").Replace("-", "");
        if (p.StartsWith("+")) return p;
        if (p.Length == 12 && p.StartsWith("91")) return "+" + p;
        if (p.Length == 10) return "+91" + p;
        return p.Length > 0 ? "+" + p : "";
    }
}

public record AddBypassRequest(string Phone, string? Name, string? Reason, string? Type);
public record ToggleRequest(bool IsActive);
public class BulkBypassRequest
{
    public List<BulkEntry>? Entries { get; set; }
}
public class BulkEntry
{
    public string? Phone { get; set; }
    public string? Name { get; set; }
    public string? Type { get; set; }
}
