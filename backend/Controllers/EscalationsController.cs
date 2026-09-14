using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Services;
using TejooWhatsApp.Models.DTOs;
using TejooWhatsApp.Repositories;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/[controller]")]
public class EscalationsController : ControllerBase
{
    private readonly EscalationService _escalationService;
    private readonly AuditLogRepository _auditRepo;

    public EscalationsController(EscalationService escalationService, AuditLogRepository auditRepo)
    {
        _escalationService = escalationService;
        _auditRepo = auditRepo;
    }

    private (int Id, string Name) GetCaller()
    {
        var idStr = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                 ?? User.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)?.Value;
        int.TryParse(idStr, out var id);
        var name = User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value ?? "Unknown";
        return (id, name);
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? status = null, [FromQuery] int? escalatedToUserId = null)
    {
        var escalations = await _escalationService.GetAllEscalationsAsync(status, escalatedToUserId);
        return Ok(escalations);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateEscalationRequest request)
    {
        if (request.ConversationId <= 0 || request.EscalatedToUserId <= 0)
        {
            return BadRequest(new { error = "Invalid request" });
        }

        var escalation = await _escalationService.CreateEscalationAsync(
            request.ConversationId,
            request.EscalatedToUserId,
            request.EscalatedFromUserId,
            request.Reason,
            request.Priority
        );

        var (callerId, callerName) = GetCaller();
        await _auditRepo.LogAsync("escalation.create", callerId, callerName, "Escalation", escalation.Id,
            null, $"{{\"conversationId\":{request.ConversationId},\"reason\":\"{request.Reason}\",\"priority\":\"{request.Priority}\"}}",
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true, escalationId = escalation.Id });
    }

    // Escalate a conversation into a REAL escalation record — engages the CRR→Manager→HOD timeout matrix.
    // Auto-picks the next person up the chain from whoever the conversation is assigned to.
    [HttpPost("conversation/{conversationId}")]
    public async Task<IActionResult> EscalateConversation(int conversationId, [FromQuery] string? reason = null, [FromQuery] string priority = "Normal")
    {
        var (callerId, callerName) = GetCaller();
        var (escalation, targetName, error) = await _escalationService.EscalateConversationAsync(
            conversationId, callerId > 0 ? callerId : (int?)null, reason, priority);

        if (escalation == null)
            return BadRequest(new { error = error ?? "Failed to escalate" });

        await _auditRepo.LogAsync("escalation.create", callerId, callerName, "Escalation", escalation.Id,
            null, $"{{\"conversationId\":{conversationId},\"escalatedTo\":\"{targetName}\",\"level\":{escalation.EscalationLevel}}}",
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true, escalationId = escalation.Id, escalatedTo = targetName, level = escalation.EscalationLevel });
    }

    // Transition an escalation's status (e.g. Pending → InProgress) — does NOT create a new record.
    [HttpPatch("{id}/status")]
    public async Task<IActionResult> UpdateStatus(int id, [FromBody] UpdateEscalationRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Status))
            return BadRequest(new { error = "Status is required" });

        var ok = await _escalationService.UpdateStatusAsync(id, request.Status);
        if (!ok) return BadRequest(new { error = "Invalid status or escalation not found" });

        var (callerId, callerName) = GetCaller();
        await _auditRepo.LogAsync("escalation.status", callerId, callerName, "Escalation", id,
            null, $"{{\"status\":\"{request.Status}\"}}", HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true });
    }

    // Reassign an open escalation to another user.
    [HttpPatch("{id}/reassign")]
    public async Task<IActionResult> Reassign(int id, [FromBody] ReassignEscalationRequest request)
    {
        if (request.NewUserId <= 0) return BadRequest(new { error = "NewUserId is required" });

        var (ok, targetName, error) = await _escalationService.ReassignAsync(id, request.NewUserId);
        if (!ok) return BadRequest(new { error = error ?? "Failed to reassign" });

        var (callerId, callerName) = GetCaller();
        await _auditRepo.LogAsync("escalation.reassign", callerId, callerName, "Escalation", id,
            null, $"{{\"newUserId\":{request.NewUserId},\"target\":\"{targetName}\"}}",
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true, reassignedTo = targetName });
    }

    [HttpPost("{id}/resolve")]
    public async Task<IActionResult> Resolve(int id, [FromBody] UpdateEscalationRequest request)
    {
        var result = await _escalationService.ResolveEscalationAsync(id, request.ResolutionNotes);
        if (!result)
        {
            return NotFound(new { error = "Escalation not found" });
        }

        var (callerId, callerName) = GetCaller();
        await _auditRepo.LogAsync("escalation.resolve", callerId, callerName, "Escalation", id,
            null, $"{{\"notes\":\"{request.ResolutionNotes?.Replace("\"", "'")}\"}}",
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true });
    }
}
