using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Repositories;
using TejooWhatsApp.AI;
using TejooWhatsApp.Models.Entities;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/[controller]")]
public class AiPromptsController : ControllerBase
{
    private readonly AiPromptRepository _promptRepo;
    private readonly PromptLoader _promptLoader;
    private readonly AiRouterService _aiRouter;
    private readonly MessageRepository _messageRepo;
    private readonly ILogger<AiPromptsController> _logger;

    public AiPromptsController(
        AiPromptRepository promptRepo,
        PromptLoader promptLoader,
        AiRouterService aiRouter,
        MessageRepository messageRepo,
        ILogger<AiPromptsController> logger)
    {
        _promptRepo = promptRepo;
        _promptLoader = promptLoader;
        _aiRouter = aiRouter;
        _messageRepo = messageRepo;
        _logger = logger;
    }

    // Dry-run the real AI pipeline (router → specialist) for a message and return what it WOULD do —
    // intent, reply, confidence, and the same send/escalate decision the orchestrator makes — WITHOUT
    // sending anything or touching the conversation. Lets the team vet the AI before enabling auto-reply.
    [HttpPost("test")]
    public async Task<IActionResult> Test([FromBody] TestPromptRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Message))
            return BadRequest(new { error = "Message is required" });

        var history = new List<Message>();
        if (request.ConversationId is int cid && cid > 0)
            history = await _messageRepo.GetRecentMessagesAsync(cid, 10);

        var result = await _aiRouter.ProcessMessageAsync(request.Message, history);

        // Mirror WhatsAppOrchestrator's decision so the preview matches real runtime behaviour.
        string decision;
        if (result.ShouldEscalate || (result.Confidence.HasValue && result.Confidence < 0.5m))
            decision = "escalate";
        else if (!string.IsNullOrWhiteSpace(result.ResponseText))
            decision = "send";
        else
            decision = "no_reply";

        return Ok(new
        {
            intent = result.Intent,
            reply = result.ResponseText,
            confidence = result.Confidence,
            shouldEscalate = result.ShouldEscalate,
            decision,
            error = result.ErrorMessage
        });
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var prompts = await _promptRepo.GetAllAsync();
        return Ok(prompts);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateAiPromptRequest request)
    {
        var prompts = await _promptRepo.GetAllAsync();
        var prompt = prompts.FirstOrDefault(p => p.Id == id);

        if (prompt == null)
            return NotFound(new { error = "Prompt not found" });

        prompt.SystemPrompt = request.SystemPrompt;
        prompt.Description = request.Description ?? prompt.Description;
        prompt.IsActive = request.IsActive ?? prompt.IsActive;

        var result = await _promptRepo.UpdateAsync(prompt);
        if (!result)
            return BadRequest(new { error = "Failed to update prompt" });

        // Invalidate the in-memory cache so new prompt takes effect immediately
        _promptLoader.InvalidateCache();

        _logger.LogInformation("✓ AI prompt updated: {PromptKey}", prompt.PromptKey);
        return Ok(new { success = true });
    }

    [HttpPost("{id}/toggle")]
    public async Task<IActionResult> Toggle(int id, [FromBody] TogglePromptRequest request)
    {
        var prompts = await _promptRepo.GetAllAsync();
        var prompt = prompts.FirstOrDefault(p => p.Id == id);

        if (prompt == null)
            return NotFound(new { error = "Prompt not found" });

        prompt.IsActive = request.IsActive;
        await _promptRepo.UpdateAsync(prompt);
        _promptLoader.InvalidateCache();

        _logger.LogInformation("✓ AI prompt {PromptKey} set active={IsActive}", prompt.PromptKey, request.IsActive);
        return Ok(new { success = true });
    }
}

public class UpdateAiPromptRequest
{
    public string SystemPrompt { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool? IsActive { get; set; }
}

public class TogglePromptRequest
{
    public bool IsActive { get; set; }
}

public class TestPromptRequest
{
    public string Message { get; set; } = string.Empty;
    public int? ConversationId { get; set; }
}
