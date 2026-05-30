using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Repositories;
using TejooWhatsApp.AI;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/[controller]")]
public class AiPromptsController : ControllerBase
{
    private readonly AiPromptRepository _promptRepo;
    private readonly PromptLoader _promptLoader;
    private readonly ILogger<AiPromptsController> _logger;

    public AiPromptsController(
        AiPromptRepository promptRepo,
        PromptLoader promptLoader,
        ILogger<AiPromptsController> logger)
    {
        _promptRepo = promptRepo;
        _promptLoader = promptLoader;
        _logger = logger;
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
