using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;
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
    /// CRR/Agent users are scoped to their own conversations' media.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> Get(
        [FromQuery] string type = "image",
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 30)
    {
        if (page < 1) page = 1;
        pageSize = Math.Clamp(pageSize, 1, 200);

        var (items, total) = await _messages.GetMediaAsync(type, page, pageSize, ScopeAssignedUserId());
        return Ok(new { items, total, page, pageSize });
    }

    // CRR/Agent see only their own conversations' media; others (Admin/HOD/Manager) see all.
    private int? ScopeAssignedUserId()
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value ?? "";
        var scoped = role.Equals("CRR", StringComparison.OrdinalIgnoreCase)
                  || role.Equals("Agent", StringComparison.OrdinalIgnoreCase);
        if (!scoped) return null;

        var idStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                 ?? User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        return int.TryParse(idStr, out var id) ? id : -1;
    }
}
