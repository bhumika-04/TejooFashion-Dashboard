using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Repositories;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/[controller]")]
public class TagsController : ControllerBase
{
    private readonly TagRepository _tags;
    public TagsController(TagRepository tags) => _tags = tags;

    // GET /api/tags?type=conversation|customer
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? type = null)
        => Ok(await _tags.GetAllAsync(type));

    // POST /api/tags
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTagRequest req)
    {
        var id = await _tags.CreateAsync(req.Name, req.Color ?? "#6366f1");
        return Ok(new { id });
    }

    // DELETE /api/tags/{id}
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        await _tags.DeleteAsync(id);
        return Ok(new { success = true });
    }

    // GET /api/tags/conversation/{conversationId}
    [HttpGet("conversation/{conversationId}")]
    public async Task<IActionResult> GetByConversation(int conversationId)
        => Ok(await _tags.GetByConversationAsync(conversationId));

    // POST /api/tags/conversation/{conversationId}/{tagId}
    [HttpPost("conversation/{conversationId}/{tagId}")]
    public async Task<IActionResult> AddToConversation(int conversationId, int tagId, [FromQuery] int? userId)
    {
        await _tags.AddToConversationAsync(conversationId, tagId, userId);
        return Ok(new { success = true });
    }

    // DELETE /api/tags/conversation/{conversationId}/{tagId}
    [HttpDelete("conversation/{conversationId}/{tagId}")]
    public async Task<IActionResult> RemoveFromConversation(int conversationId, int tagId)
    {
        await _tags.RemoveFromConversationAsync(conversationId, tagId);
        return Ok(new { success = true });
    }
}

public record CreateTagRequest(string Name, string? Color);
