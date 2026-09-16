using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Repositories;
using TejooWhatsApp.Models.DTOs;
using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Services;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/[controller]")]
public class WhatsAppSessionsController : ControllerBase
{
    private readonly WhatsAppSessionRepository _sessionRepo;
    private readonly UserRepository _userRepo;
    private readonly AuditLogRepository _auditRepo;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<WhatsAppSessionsController> _logger;
    private readonly WhatsAppOrchestrator _orchestrator;
    private readonly ConversationService _conversationService;
    private readonly ITeamMemberRepository _teamMembers;
    private readonly string _interaktBaseUrl;
    private readonly string _metaGraphBaseUrl;

    public WhatsAppSessionsController(
        WhatsAppSessionRepository sessionRepo,
        UserRepository userRepo,
        AuditLogRepository auditRepo,
        IHttpClientFactory httpClientFactory,
        ILogger<WhatsAppSessionsController> logger,
        IConfiguration configuration,
        WhatsAppOrchestrator orchestrator,
        ConversationService conversationService,
        ITeamMemberRepository teamMembers)
    {
        _sessionRepo = sessionRepo;
        _userRepo = userRepo;
        _auditRepo = auditRepo;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _orchestrator = orchestrator;
        _conversationService = conversationService;
        _teamMembers = teamMembers;
        _interaktBaseUrl = configuration["ExternalApis:InteraktBaseUrl"] ?? "https://api.interakt.ai";
        _metaGraphBaseUrl = configuration["ExternalApis:MetaGraphBaseUrl"] ?? "https://graph.facebook.com";
    }

    /// <summary>Assigned-user ids the caller may see (null = all, Admin only): CRR/Agent → own,
    /// Manager/HOD → own team(s), Admin → all. Mirrors the conversation visibility rule. </summary>
    private async Task<List<int>?> ResolveVisibleAsync(int? requested)
    {
        var role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value ?? "";
        var uid = GetCaller().Id;

        List<int>? visible;
        if (role.Equals("Admin", StringComparison.OrdinalIgnoreCase))
            visible = null;
        else if (role.Equals("CRR", StringComparison.OrdinalIgnoreCase) || role.Equals("Agent", StringComparison.OrdinalIgnoreCase))
            visible = new List<int> { uid };
        else
        {
            var ids = new HashSet<int> { uid };
            foreach (var membership in await _teamMembers.GetMembershipsByUserAsync(uid))
                foreach (var member in await _teamMembers.GetMembersByTeamAsync(membership.TeamId))
                    ids.Add(member.UserId);
            visible = ids.ToList();
        }

        if (requested.HasValue)
        {
            if (visible == null) return new List<int> { requested.Value };
            return visible.Contains(requested.Value) ? new List<int> { requested.Value } : visible;
        }
        return visible;
    }

    private (int Id, string Name) GetCaller()
    {
        var idStr = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                 ?? User.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)?.Value;
        int.TryParse(idStr, out var id);
        var name = User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value ?? "Unknown";
        return (id, name);
    }

    [HttpPost("test-connection")]
    public async Task<IActionResult> TestConnection([FromBody] TestConnectionRequest request)
    {
        _logger.LogInformation("Testing WhatsApp connection - Provider: {Provider}", request.Provider);

        try
        {
            var httpClient = _httpClientFactory.CreateClient();
            httpClient.Timeout = TimeSpan.FromSeconds(10);

            if (request.Provider == "Interakt")
            {
                // Validate Interakt: API Key only
                if (string.IsNullOrEmpty(request.ApiKey))
                {
                    _logger.LogWarning("Interakt test failed: API Key is missing");
                    return Ok(new { success = false, message = "API Key is required for Interakt provider" });
                }

                _logger.LogInformation("Testing Interakt API connection with API Key");
                httpClient.DefaultRequestHeaders.Add("Authorization", $"Basic {request.ApiKey}");

                // Test connection by sending a minimal track event (POST endpoint)
                var testPayload = new
                {
                    userId = "test_connection_check",
                    @event = "connection_test",
                    traits = new { test = true }
                };

                var jsonContent = new StringContent(
                    System.Text.Json.JsonSerializer.Serialize(testPayload),
                    System.Text.Encoding.UTF8,
                    "application/json"
                );

                var response = await httpClient.PostAsync($"{_interaktBaseUrl}/v1/public/track/events/", jsonContent);

                _logger.LogInformation("Interakt API response status: {StatusCode}", response.StatusCode);

                // Accept both 200 (success) and 400 (bad request but auth worked) as valid auth
                if (response.IsSuccessStatusCode || response.StatusCode == System.Net.HttpStatusCode.BadRequest)
                {
                    _logger.LogInformation("Interakt connection successful - API key is valid");
                    return Ok(new { success = true, message = "Connection successful! Interakt API credentials are valid." });
                }
                else if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized || response.StatusCode == System.Net.HttpStatusCode.Forbidden)
                {
                    var responseBody = await response.Content.ReadAsStringAsync();
                    _logger.LogWarning("Interakt connection failed - Invalid API key - Status: {StatusCode}, Response: {Response}",
                        response.StatusCode, responseBody);
                    return Ok(new { success = false, message = "Connection failed: Invalid API key or unauthorized access." });
                }
                else
                {
                    var responseBody = await response.Content.ReadAsStringAsync();
                    _logger.LogWarning("Interakt connection test returned unexpected status - Status: {StatusCode}, Response: {Response}",
                        response.StatusCode, responseBody);
                    return Ok(new { success = false, message = $"Connection test failed with status: {response.StatusCode}" });
                }
            }
            else if (request.Provider == "Meta")
            {
                // Validate Meta: Phone Number ID, Business Account ID, Access Token
                if (string.IsNullOrEmpty(request.MetaPhoneNumberId))
                {
                    _logger.LogWarning("Meta test failed: Phone Number ID is missing");
                    return Ok(new { success = false, message = "Phone Number ID is required for Meta provider" });
                }
                if (string.IsNullOrEmpty(request.MetaBusinessAccountId))
                {
                    _logger.LogWarning("Meta test failed: Business Account ID is missing");
                    return Ok(new { success = false, message = "Business Account ID is required for Meta provider" });
                }
                if (string.IsNullOrEmpty(request.MetaAccessToken))
                {
                    _logger.LogWarning("Meta test failed: Access Token is missing");
                    return Ok(new { success = false, message = "Access Token is required for Meta provider" });
                }

                _logger.LogInformation("Testing Meta WhatsApp API connection - Phone Number ID: {PhoneNumberId}, Business Account ID: {BusinessAccountId}",
                    request.MetaPhoneNumberId, request.MetaBusinessAccountId);

                // Test Meta API by verifying the phone number ID
                var testUrl = $"{_metaGraphBaseUrl}/v18.0/{request.MetaPhoneNumberId}";
                httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {request.MetaAccessToken}");
                var response = await httpClient.GetAsync(testUrl);

                _logger.LogInformation("Meta API response status: {StatusCode}", response.StatusCode);

                if (response.IsSuccessStatusCode)
                {
                    var responseBody = await response.Content.ReadAsStringAsync();
                    _logger.LogInformation("Meta connection successful - Response: {Response}", responseBody);
                    return Ok(new { success = true, message = "Connection successful! Meta WhatsApp API credentials are valid." });
                }
                else
                {
                    var responseBody = await response.Content.ReadAsStringAsync();
                    _logger.LogWarning("Meta connection failed - Status: {StatusCode}, Response: {Response}",
                        response.StatusCode, responseBody);
                    return Ok(new { success = false, message = $"Connection failed: Invalid credentials or Phone Number ID. Status: {response.StatusCode}" });
                }
            }
            else
            {
                _logger.LogWarning("Invalid provider specified: {Provider}", request.Provider);
                return BadRequest(new { success = false, message = "Invalid provider. Supported providers: Interakt, Meta" });
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "HTTP request exception during connection test");
            return Ok(new { success = false, message = $"Connection error: {ex.Message}" });
        }
        catch (TaskCanceledException)
        {
            _logger.LogError("Connection test timeout");
            return Ok(new { success = false, message = "Connection timeout: Unable to reach the API server" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error during connection test");
            return Ok(new { success = false, message = $"Error testing connection: {ex.Message}" });
        }
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] bool? isActive = null, [FromQuery] int? assignedUserId = null)
    {
        var sessions = await _sessionRepo.GetAllWithUserAsync(isActive, await ResolveVisibleAsync(assignedUserId));
        var dtos = sessions.Select(session => new WhatsAppSessionDTO
        {
            Id = session.Id,
            Provider = session.Provider,
            PhoneNumber = session.PhoneNumber,
            DisplayName = session.DisplayName,
            AssignedUserId = session.AssignedUserId,
            AssignedUserName = session.AssignedUserName,
            IsConnected = session.IsConnected,
            IsActive = session.IsActive,
            AutoReplyEnabled = session.AutoReplyEnabled,
            AiMode = session.AiMode,
            SlaMinutes = session.SlaMinutes,
            MessagesToday = session.MessagesToday,
            OutboundToday = session.OutboundToday,
            InboundCustomersToday = session.InboundCustomersToday,
            OutboundCustomersToday = session.OutboundCustomersToday,
            LastActiveAt = session.LastActiveAt,
            LastInboundAt = session.LastInboundAt,
            CreatedAt = session.CreatedAt,
            ApiKey = session.Provider == "Interakt" ? session.InteraktApiKey : session.MetaAccessToken,
        }).ToList();

        return Ok(dtos);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var session = await _sessionRepo.GetByIdAsync(id);
        if (session == null)
        {
            return NotFound(new { error = "Session not found" });
        }

        var user = await _userRepo.GetByIdAsync(session.AssignedUserId);

        return Ok(new WhatsAppSessionDTO
        {
            Id = session.Id,
            Provider = session.Provider,
            PhoneNumber = session.PhoneNumber,
            DisplayName = session.DisplayName,
            AssignedUserId = session.AssignedUserId,
            AssignedUserName = user?.FullName ?? "",
            IsConnected = session.IsConnected,
            IsActive = session.IsActive,
            AutoReplyEnabled = session.AutoReplyEnabled,
            AiMode = session.AiMode,
            SlaMinutes = session.SlaMinutes,
            MessagesToday = session.MessagesToday,
            LastActiveAt = session.LastActiveAt,
            CreatedAt = session.CreatedAt,
            ApiKey = session.Provider == "Interakt" ? session.InteraktApiKey : session.MetaAccessToken,
        });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateSessionRequest request)
    {
        if (string.IsNullOrEmpty(request.PhoneNumber) || request.AssignedUserId <= 0)
        {
            return BadRequest(new { error = "Phone number and assigned user are required" });
        }

        var session = new WhatsAppSession
        {
            Provider = request.Provider,
            PhoneNumber = request.PhoneNumber,
            AssignedUserId = request.AssignedUserId,
            InteraktApiKey = request.InteraktApiKey,
            MetaPhoneNumberId = request.MetaPhoneNumberId,
            MetaAccessToken = request.MetaAccessToken,
            IsConnected = false,
            IsActive = true,
            AutoReplyEnabled = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        try
        {
            session.Id = await _sessionRepo.CreateAsync(session);

            // Auto-test connection and update status
            var testRequest = new TestConnectionRequest
            {
                Provider = request.Provider,
                ApiKey = request.InteraktApiKey,
                MetaPhoneNumberId = request.MetaPhoneNumberId,
                MetaBusinessAccountId = "", // Not captured during session creation
                MetaAccessToken = request.MetaAccessToken
            };

            var testResult = await TestConnection(testRequest);
            var testData = (testResult as OkObjectResult)?.Value as dynamic;

            if (testData?.success == true)
            {
                session.IsConnected = true;
                session.LastConnectedAt = DateTime.UtcNow;
                await _sessionRepo.UpdateAsync(session);
                _logger.LogInformation("✓ WhatsApp session created and connected: {PhoneNumber} ({Provider})",
                    session.PhoneNumber, session.Provider);
            }
            else
            {
                _logger.LogInformation("✓ WhatsApp session created but not connected: {PhoneNumber} ({Provider})",
                    session.PhoneNumber, session.Provider);
            }

            var (callerId, callerName) = GetCaller();
            await _auditRepo.LogAsync("session.create", callerId, callerName, "WhatsAppSession", session.Id,
                null, $"{{\"phone\":\"{session.PhoneNumber}\",\"provider\":\"{session.Provider}\"}}",
                HttpContext.Connection.RemoteIpAddress?.ToString());

            return Ok(new { success = true, sessionId = session.Id });
        }
        catch (Microsoft.Data.SqlClient.SqlException ex) when (ex.Number == 2627)
        {
            // Unique constraint violation - duplicate phone number or API key
            _logger.LogWarning("Failed to create session: Duplicate entry - {Message}", ex.Message);

            if (ex.Message.Contains("PhoneNumber") || ex.Message.Contains(request.PhoneNumber))
            {
                return BadRequest(new { error = $"Phone number {request.PhoneNumber} already exists. Please use a different number or edit the existing session." });
            }
            else if (ex.Message.Contains("InteraktApiKey") || ex.Message.Contains("MetaPhoneNumberId"))
            {
                return BadRequest(new { error = "This API key is already in use. Please use a different API key or edit the existing session." });
            }
            else
            {
                return BadRequest(new { error = "This session already exists. Please check your phone number and API key." });
            }
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateSessionRequest request)
    {
        var session = await _sessionRepo.GetByIdAsync(id);
        if (session == null)
        {
            return NotFound(new { error = "Session not found" });
        }

        if (request.AssignedUserId.HasValue) session.AssignedUserId = request.AssignedUserId.Value;
        if (request.IsActive.HasValue) session.IsActive = request.IsActive.Value;
        if (request.IsConnected.HasValue) session.IsConnected = request.IsConnected.Value;
        if (request.AutoReplyEnabled.HasValue) session.AutoReplyEnabled = request.AutoReplyEnabled.Value;
        if (!string.IsNullOrWhiteSpace(request.AiMode))
        {
            var m = request.AiMode.Trim().ToLowerInvariant();
            if (m is "off" or "suggest" or "auto") session.AiMode = m;
        }
        if (request.SlaMinutes.HasValue) session.SlaMinutes = Math.Clamp(request.SlaMinutes.Value, 1, 1440);
        if (request.InteraktApiKey != null) session.InteraktApiKey = request.InteraktApiKey;
        if (request.MetaPhoneNumberId != null) session.MetaPhoneNumberId = request.MetaPhoneNumberId;
        if (request.MetaAccessToken != null) session.MetaAccessToken = request.MetaAccessToken;

        session.UpdatedAt = DateTime.UtcNow;

        var result = await _sessionRepo.UpdateAsync(session);
        if (!result)
        {
            return BadRequest(new { error = "Failed to update session" });
        }

        _logger.LogInformation("✓ WhatsApp session updated: {PhoneNumber}", session.PhoneNumber);

        var (callerId, callerName) = GetCaller();
        await _auditRepo.LogAsync("session.update", callerId, callerName, "WhatsAppSession", id,
            null, $"{{\"phone\":\"{session.PhoneNumber}\",\"isActive\":{session.IsActive.ToString().ToLower()}}}",
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var session = await _sessionRepo.GetByIdAsync(id);
        var result = await _sessionRepo.DeleteAsync(id);
        if (!result)
        {
            return NotFound(new { error = "Session not found" });
        }

        _logger.LogInformation("✓ WhatsApp session deleted: {PhoneNumber}",
            session?.PhoneNumber ?? "Unknown");

        var (callerId, callerName) = GetCaller();
        await _auditRepo.LogAsync("session.delete", callerId, callerName, "WhatsAppSession", id,
            $"{{\"phone\":\"{session?.PhoneNumber}\"}}",
            null, HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true });
    }

    [HttpPost("{id}/send-test")]
    public async Task<IActionResult> SendTestMessage(int id, [FromBody] SendTestRequest request)
    {
        var session = await _sessionRepo.GetByIdAsync(id);
        if (session == null) return NotFound(new { error = "Session not found" });
        if (!session.IsActive) return BadRequest(new { error = "Session is inactive" });

        var phone = NormalizePhone(request.Phone);
        if (string.IsNullOrEmpty(phone))
            return BadRequest(new { error = "Invalid phone number" });

        try
        {
            var conversation = await _conversationService.GetOrCreateConversationAsync(
                session.Id, phone, null);

            if (conversation == null)
                return BadRequest(new { error = "Failed to create conversation for this number" });

            var (success, sendError) = await _orchestrator.SendManualMessageAsync(
                conversation.Id, request.Message ?? "Hello! This is a test message from Tejoo Fashion.");

            if (!success)
                return BadRequest(new { error = sendError ?? "Message could not be sent — check provider credentials" });

            _logger.LogInformation("✓ Test message sent to {Phone} via session {SessionId}", phone, id);
            return Ok(new { success = true, message = $"Message sent to {phone}" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send test message to {Phone}", phone);

            var msg = ex.Message.Contains("24 hours")
                ? "Cannot send — this customer hasn't messaged you in the last 24 hours. WhatsApp only allows outbound messages within a 24-hour window after the customer writes first. Ask the customer to send any message first, then try again."
                : $"Send failed: {ex.Message}";

            return Ok(new { success = false, message = msg });
        }
    }

    private static string NormalizePhone(string raw)
    {
        var phone = raw?.Trim().Replace(" ", "").Replace("-", "") ?? "";
        if (phone.StartsWith("+")) return phone;
        if (phone.Length == 12 && phone.StartsWith("91")) return "+" + phone;
        if (phone.Length == 10) return "+91" + phone;
        return phone.Length > 0 ? "+" + phone : "";
    }
}

public class SendTestRequest
{
    public string Phone { get; set; } = string.Empty;
    public string? Message { get; set; }
}
