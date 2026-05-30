using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Services;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/[controller]")]
public class MessagesController : ControllerBase
{
    private readonly MessageService _messageService;

    public MessagesController(MessageService messageService)
    {
        _messageService = messageService;
    }

    [HttpGet("conversation/{conversationId}")]
    public async Task<IActionResult> GetByConversation(int conversationId, [FromQuery] int limit = 50)
    {
        var messages = await _messageService.GetConversationMessagesAsync(conversationId, limit);
        return Ok(messages);
    }
}
