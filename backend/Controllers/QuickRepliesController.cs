using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Repositories;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/[controller]")]
public class QuickRepliesController : ControllerBase
{
    private readonly QuickReplyRepository _repo;

    public QuickRepliesController(QuickReplyRepository repo) => _repo = repo;

    [HttpGet]
    public async Task<IActionResult> GetAll()
        => Ok(await _repo.GetAllActiveAsync());

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] QuickReplyRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Title) || string.IsNullOrWhiteSpace(req.Content))
            return BadRequest(new { error = "Title and Content are required" });

        var item = await _repo.CreateAsync(req.Title.Trim(), req.Content.Trim(), req.Category?.Trim());
        return Ok(item);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] QuickReplyRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Title) || string.IsNullOrWhiteSpace(req.Content))
            return BadRequest(new { error = "Title and Content are required" });

        var ok = await _repo.UpdateAsync(id, req.Title.Trim(), req.Content.Trim(), req.Category?.Trim());
        return ok ? Ok(new { success = true }) : NotFound();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var ok = await _repo.DeleteAsync(id);
        return ok ? Ok(new { success = true }) : NotFound();
    }
}

public record QuickReplyRequest(string Title, string Content, string? Category);
