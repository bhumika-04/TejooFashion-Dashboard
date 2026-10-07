using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Security;
using TejooWhatsApp.Services;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/[controller]")]
public class MessagesController : ControllerBase
{
    private readonly MessageService _messageService;
    private readonly VisibilityService _visibility;

    public MessagesController(MessageService messageService, VisibilityService visibility)
    {
        _messageService = messageService;
        _visibility = visibility;
    }

    [HttpGet("conversation/{conversationId}")]
    public async Task<IActionResult> GetByConversation(int conversationId, [FromQuery] int limit = 50)
    {
        if (!await _visibility.CanAccessConversationAsync(User, conversationId))
            return NotFound(new { error = "Conversation not found" });

        var messages = await _messageService.GetConversationMessagesAsync(conversationId, Math.Clamp(limit, 1, 2000));
        return Ok(messages);
    }
}
