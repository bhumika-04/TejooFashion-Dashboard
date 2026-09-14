using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using TejooWhatsApp.Models.DTOs;
using TejooWhatsApp.Repositories;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/[controller]")]
public class CatalogsController : ControllerBase
{
    private const int MaxSendPerBatch = 30;

    private readonly CatalogRepository _catalogs;
    private readonly CatalogSendQueueRepository _sendQueue;
    private readonly ConversationRepository _conversations;
    private readonly AuditLogRepository _audit;

    public CatalogsController(CatalogRepository catalogs, CatalogSendQueueRepository sendQueue,
        ConversationRepository conversations, AuditLogRepository audit)
    {
        _catalogs = catalogs;
        _sendQueue = sendQueue;
        _conversations = conversations;
        _audit = audit;
    }

    private (int Id, string Name) GetCaller()
    {
        var idStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                 ?? User.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)?.Value;
        int.TryParse(idStr, out var id);
        var name = User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown";
        return (id, name);
    }

    // Catalogs are shared, business-wide assets — every authenticated user can read them.
    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(await _catalogs.GetAllAsync());

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var catalog = await _catalogs.GetByIdAsync(id);
        return catalog == null ? NotFound(new { error = "Catalog not found" }) : Ok(catalog);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCatalogRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { error = "Name is required" });

        var (callerId, callerName) = GetCaller();
        var id = await _catalogs.CreateAsync(request.Name.Trim(), request.Info, callerId > 0 ? callerId : null);
        await _audit.LogAsync("catalog.create", callerId, callerName, "Catalog", id,
            null, $"{{\"name\":\"{request.Name.Replace("\"", "'")}\"}}",
            HttpContext.Connection.RemoteIpAddress?.ToString());
        return Ok(new { success = true, id });
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateCatalogRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { error = "Name is required" });

        var ok = await _catalogs.UpdateAsync(id, request.Name.Trim(), request.Info);
        if (!ok) return NotFound(new { error = "Catalog not found" });

        var (callerId, callerName) = GetCaller();
        await _audit.LogAsync("catalog.update", callerId, callerName, "Catalog", id,
            null, null, HttpContext.Connection.RemoteIpAddress?.ToString());
        return Ok(new { success = true });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var ok = await _catalogs.DeleteAsync(id);
        if (!ok) return NotFound(new { error = "Catalog not found" });

        var (callerId, callerName) = GetCaller();
        await _audit.LogAsync("catalog.delete", callerId, callerName, "Catalog", id,
            null, null, HttpContext.Connection.RemoteIpAddress?.ToString());
        return Ok(new { success = true });
    }

    // Add images (from the gallery) to a catalog; duplicates are skipped.
    [HttpPost("{id}/items")]
    public async Task<IActionResult> AddItems(int id, [FromBody] AddCatalogItemsRequest request)
    {
        if (!await _catalogs.ExistsAsync(id))
            return NotFound(new { error = "Catalog not found" });
        if (request.Items == null || request.Items.Count == 0)
            return BadRequest(new { error = "No items provided" });

        var added = await _catalogs.AddItemsAsync(id, request.Items);
        return Ok(new { success = true, added });
    }

    [HttpDelete("{id}/items/{itemId}")]
    public async Task<IActionResult> RemoveItem(int id, int itemId)
    {
        var ok = await _catalogs.RemoveItemAsync(id, itemId);
        return ok ? Ok(new { success = true }) : NotFound(new { error = "Item not found" });
    }

    // Queue a catalog's images to be sent to a conversation, one-by-one (drained by CatalogSendService).
    [HttpPost("{id}/send")]
    public async Task<IActionResult> Send(int id, [FromBody] SendCatalogRequest request)
    {
        if (request.ConversationId <= 0)
            return BadRequest(new { error = "conversationId is required" });
        if (await _conversations.GetByIdAsync(request.ConversationId) == null)
            return NotFound(new { error = "Conversation not found" });

        var catalogUrls = await _catalogs.GetItemUrlsAsync(id);
        if (catalogUrls.Count == 0)
            return BadRequest(new { error = "This catalog has no images" });

        // Only send images that actually belong to the catalog; empty selection = whole catalog.
        var toSend = (request.MediaUrls != null && request.MediaUrls.Count > 0)
            ? catalogUrls.Where(u => request.MediaUrls.Contains(u)).ToList()
            : catalogUrls;
        toSend = toSend.Take(MaxSendPerBatch).ToList();
        if (toSend.Count == 0)
            return BadRequest(new { error = "No matching images to send" });

        var (callerId, callerName) = GetCaller();
        var queued = await _sendQueue.EnqueueAsync(request.ConversationId, toSend, callerId > 0 ? callerId : null);

        await _audit.LogAsync("catalog.send", callerId, callerName, "Catalog", id,
            null, $"{{\"conversationId\":{request.ConversationId},\"queued\":{queued}}}",
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true, queued });
    }
}
