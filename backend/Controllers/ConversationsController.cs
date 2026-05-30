using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Services;
using TejooWhatsApp.Models.DTOs;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/[controller]")]
public class ConversationsController : ControllerBase
{
    private readonly ConversationService _conversationService;
    private readonly WhatsAppOrchestrator _orchestrator;
    private readonly ILogger<ConversationsController> _logger;
    private readonly IWebHostEnvironment _env;

    public ConversationsController(
        ConversationService conversationService,
        WhatsAppOrchestrator orchestrator,
        ILogger<ConversationsController> logger,
        IWebHostEnvironment env)
    {
        _conversationService = conversationService;
        _orchestrator = orchestrator;
        _logger = logger;
        _env = env;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? status = null,
        [FromQuery] int? assignedUserId = null,
        [FromQuery] int? sessionId = null,
        [FromQuery] int limit = 100,
        [FromQuery] int offset = 0)
    {
        var conversations = await _conversationService.GetAllConversationsAsync(status, assignedUserId, sessionId, limit, offset);
        return Ok(conversations);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id)
    {
        var conversation = await _conversationService.GetConversationDetailAsync(id);
        if (conversation == null)
        {
            return NotFound(new { error = "Conversation not found" });
        }
        return Ok(conversation);
    }

    [HttpPut("{id:int}/status")]
    public async Task<IActionResult> UpdateStatus(int id, [FromBody] UpdateConversationRequest request)
    {
        if (string.IsNullOrEmpty(request.Status))
        {
            return BadRequest(new { error = "Status is required" });
        }

        var result = await _conversationService.UpdateConversationStatusAsync(id, request.Status);
        if (!result)
        {
            return NotFound(new { error = "Conversation not found" });
        }

        _logger.LogInformation("✓ Conversation #{ConversationId} status updated to: {Status}", id, request.Status);

        return Ok(new { success = true });
    }

    [HttpPost("{id:int}/send-message")]
    public async Task<IActionResult> SendMessage(int id, [FromBody] SendMessageRequest request)
    {
        var isMedia = request.MessageType is "image" or "video" or "document" or "audio";
        if (!isMedia && string.IsNullOrEmpty(request.Content))
            return BadRequest(new { error = "Message content is required" });

        var result = await _orchestrator.SendManualMessageAsync(
            id, request.Content ?? "", request.MessageType, request.MediaUrl);
        if (!result)
            return BadRequest(new { error = "Failed to send message" });

        _logger.LogInformation("✓ Message sent: Conversation #{ConversationId}, Type: {MessageType}",
            id, request.MessageType ?? "text");

        return Ok(new { success = true });
    }

    private static readonly HashSet<string> _allowedMimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/gif", "image/webp",
        "video/mp4", "video/quicktime", "video/x-msvideo",
        "application/pdf", "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "audio/mpeg", "audio/ogg", "audio/wav",
    };

    // WhatsApp Business API per-type size limits
    private static readonly Dictionary<string, long> _mediaTypeLimits = new()
    {
        { "image",    5   * 1024 * 1024 },   //   5 MB
        { "video",    16  * 1024 * 1024 },   //  16 MB
        { "audio",    16  * 1024 * 1024 },   //  16 MB
        { "document", 100 * 1024 * 1024 },   // 100 MB
    };

    [HttpPost("{id:int}/upload-media")]
    [RequestSizeLimit(104_857_600)] // 100 MB — highest single-type ceiling (documents)
    public async Task<IActionResult> UploadMedia(int id, IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "No file provided" });

        if (!_allowedMimeTypes.Contains(file.ContentType))
            return BadRequest(new { error = "File type not supported" });

        var mediaType = file.ContentType.Split('/')[0] switch
        {
            "image" => "image",
            "video" => "video",
            "audio" => "audio",
            _       => "document"
        };

        var maxBytes = _mediaTypeLimits[mediaType];
        if (file.Length > maxBytes)
        {
            var limitMb = maxBytes / (1024 * 1024);
            return BadRequest(new { error = $"{char.ToUpper(mediaType[0])}{mediaType[1..]} files must be under {limitMb} MB (WhatsApp Business API limit)" });
        }

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var safeFileName = $"{Guid.NewGuid()}{ext}";
        var folder = Path.Combine(_env.WebRootPath, "uploads", "conversations", id.ToString());
        Directory.CreateDirectory(folder);
        var filePath = Path.Combine(folder, safeFileName);

        await using var stream = System.IO.File.Create(filePath);
        await file.CopyToAsync(stream);

        var baseUrl = $"{Request.Scheme}://{Request.Host}";
        var fileUrl = $"{baseUrl}/uploads/conversations/{id}/{safeFileName}";

        _logger.LogInformation("✓ Media uploaded for conversation #{Id}: {FileName} ({Type})",
            id, safeFileName, mediaType);

        return Ok(new { success = true, url = fileUrl, messageType = mediaType, fileName = file.FileName, fileSize = file.Length });
    }

    [HttpPost("{id:int}/close")]
    public async Task<IActionResult> CloseConversation(int id)
    {
        var result = await _conversationService.UpdateConversationStatusAsync(id, "Closed");
        if (!result)
        {
            return NotFound(new { error = "Conversation not found" });
        }

        _logger.LogInformation("✓ Conversation closed: Conversation #{ConversationId}", id);

        return Ok(new { success = true });
    }

    [HttpPut("{id:int}/assign")]
    public async Task<IActionResult> AssignConversation(int id, [FromBody] AssignConversationRequest request)
    {
        var result = await _conversationService.AssignConversationAsync(id, request.AssignedUserId);
        if (!result)
            return NotFound(new { error = "Conversation not found" });

        _logger.LogInformation("✓ Conversation #{ConversationId} assigned to user #{UserId}", id, request.AssignedUserId);
        return Ok(new { success = true });
    }

    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string q, [FromQuery] int limit = 30, [FromQuery] int? assignedUserId = null)
    {
        if (string.IsNullOrWhiteSpace(q))
            return BadRequest(new { error = "Search query is required" });

        var results = await _conversationService.SearchConversationsAsync(q, limit, assignedUserId);
        return Ok(results);
    }

    [HttpGet("{id:int}/summary")]
    public async Task<IActionResult> GetSummary(int id)
    {
        var summary = await _conversationService.GetSummaryAsync(id);
        if (summary == null)
            return NotFound(new { error = "No summary found" });
        return Ok(summary);
    }

    [HttpPost("{id:int}/summarize")]
    public async Task<IActionResult> GenerateSummary(int id)
    {
        try
        {
            var summary = await _conversationService.GenerateSummaryAsync(id);
            _logger.LogInformation("✓ Summary generated for Conversation #{ConversationId}", id);
            return Ok(summary);
        }
        catch (Exception ex)
        {
            _logger.LogError("❌ Failed to generate summary for #{ConversationId}: {Message}", id, ex.Message);
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteConversation(int id)
    {
        var result = await _conversationService.DeleteConversationAsync(id);
        if (!result)
            return NotFound(new { error = "Conversation not found" });

        // Remove associated media uploads immediately
        var folder = Path.Combine(_env.WebRootPath, "uploads", "conversations", id.ToString());
        if (Directory.Exists(folder))
        {
            Directory.Delete(folder, recursive: true);
            _logger.LogInformation("✓ Media folder deleted for conversation #{Id}", id);
        }

        _logger.LogInformation("✓ Conversation deleted: #{Id}", id);
        return Ok(new { success = true });
    }

    [HttpGet("storage-stats")]
    public IActionResult GetStorageStats()
    {
        var uploadsRoot = Path.Combine(_env.WebRootPath, "uploads", "conversations");
        if (!Directory.Exists(uploadsRoot))
            return Ok(new { totalFiles = 0, totalSizeBytes = 0, totalSizeMb = 0.0, conversationCount = 0 });

        var files = Directory.GetFiles(uploadsRoot, "*", SearchOption.AllDirectories);
        var totalBytes = files.Sum(f => new FileInfo(f).Length);
        var convCount  = Directory.GetDirectories(uploadsRoot).Length;

        return Ok(new
        {
            totalFiles       = files.Length,
            totalSizeBytes   = totalBytes,
            totalSizeMb      = Math.Round(totalBytes / (1024.0 * 1024.0), 2),
            conversationCount = convCount,
        });
    }
}

