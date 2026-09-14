using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using TejooWhatsApp.Repositories;

namespace TejooWhatsApp.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public class GalleryController : ControllerBase
{
    private readonly MessageRepository _messages;

    public GalleryController(MessageRepository messages) => _messages = messages;

    /// <summary>
    /// Paged media gallery, newest first. Defaults to images.
    /// Shared media library — visible to ALL roles (it's the source for product catalogs).
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> Get(
        [FromQuery] string type = "image",
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 30,
        [FromQuery] string? direction = null,
        [FromQuery] int? sessionId = null,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null)
    {
        if (page < 1) page = 1;
        pageSize = Math.Clamp(pageSize, 1, 200);
        // Normalise direction to the stored casing; ignore anything else.
        var dir = direction?.ToLowerInvariant() switch
        {
            "inbound"  => "inbound",
            "outbound" => "outbound",
            _          => null
        };

        // null = no user filter: the gallery is a shared library every role can browse.
        var (items, total) = await _messages.GetMediaAsync(
            type, page, pageSize, null, dir, sessionId, from, to);
        return Ok(new { items, total, page, pageSize });
    }
}
