using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Security;
using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/[controller]")]
public class SearchController : ControllerBase
{
    private readonly DatabaseHelper _db;
    private readonly VisibilityService _visibility;

    public SearchController(DatabaseHelper db, VisibilityService visibility)
    {
        _db = db;
        _visibility = visibility;
    }

    // GET /api/search?q=keyword&limit=20
    // Conversations and messages follow the same visibility rule as the Conversations page;
    // customers follow the Customers page rule (agents see only customers they've chatted with).
    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] string q, [FromQuery] int limit = 20)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
            return BadRequest(new { error = "Query must be at least 2 characters" });
        limit = Math.Clamp(limit, 1, 100);

        var visible = await _visibility.VisibleUserIdsAsync(User);
        var agentId = PageAccessService.IsAgentRole(User) ? PageAccessService.UserIdOf(User) ?? -1 : (int?)null;
        var p = new { Q = q, Limit = limit, All = visible == null ? 1 : 0, Visible = visible ?? new List<int>(), AgentId = agentId };

        using var conn = _db.CreateConnection();

        var conversations = await conn.QueryAsync<SearchResultRow>(@"
            SELECT TOP (@Limit) 'conversation' AS ResultType, c.Id,
                c.CustomerPhone AS Title,
                COALESCE(c.CustomerName, c.CustomerPhone) AS Subtitle,
                c.Status AS Meta,
                c.LastMessageAt AS [Date],
                c.Id AS ConversationId
            FROM Conversations c
            WHERE (c.CustomerPhone LIKE '%' + @Q + '%' OR c.CustomerName LIKE '%' + @Q + '%')
              AND (@All = 1 OR c.AssignedUserId IN @Visible)
            ORDER BY c.LastMessageAt DESC", p);

        var messages = await conn.QueryAsync<SearchResultRow>(@"
            SELECT TOP (@Limit) 'message' AS ResultType, m.Id,
                m.Content AS Title,
                COALESCE(c.CustomerName, c.CustomerPhone) AS Subtitle,
                m.Direction AS Meta,
                m.CreatedAt AS [Date],
                m.ConversationId
            FROM Messages m
            JOIN Conversations c ON m.ConversationId = c.Id
            WHERE m.Content LIKE '%' + @Q + '%'
              AND (@All = 1 OR c.AssignedUserId IN @Visible)
            ORDER BY m.CreatedAt DESC", p);

        var customers = await conn.QueryAsync<SearchResultRow>(@"
            SELECT TOP (@Limit) 'customer' AS ResultType, cu.Id,
                COALESCE(cu.Name, cu.Phone) AS Title,
                cu.Phone AS Subtitle,
                CAST(cu.TotalConversations AS NVARCHAR) + ' conversations' AS Meta,
                cu.LastSeenAt AS [Date]
            FROM Customers cu
            WHERE (cu.Phone LIKE '%' + @Q + '%' OR cu.Name LIKE '%' + @Q + '%' OR cu.Email LIKE '%' + @Q + '%')
              AND (@AgentId IS NULL OR EXISTS (SELECT 1 FROM Conversations cv
                                                WHERE cv.CustomerPhone = cu.Phone AND cv.AssignedUserId = @AgentId))
            ORDER BY cu.LastSeenAt DESC", p);

        var users = await conn.QueryAsync<SearchResultRow>(@"
            SELECT TOP 10 'user' AS ResultType, u.Id,
                u.FullName AS Title,
                u.Email AS Subtitle,
                u.Role AS Meta,
                u.CreatedAt AS [Date]
            FROM Users u
            WHERE u.FullName LIKE '%' + @Q + '%'
               OR u.Email    LIKE '%' + @Q + '%'", p);

        var conversationList = conversations.ToList();
        var messageList = messages.ToList();
        var customerList = customers.ToList();
        var userList = users.ToList();

        return Ok(new
        {
            query = q,
            results = new
            {
                conversations = conversationList,
                messages = messageList,
                customers = customerList,
                users = userList,
                total = conversationList.Count + messageList.Count + customerList.Count + userList.Count
            }
        });
    }
}

/// <summary>Typed (not dynamic) so the JSON keys are camelCase like every other endpoint.</summary>
public class SearchResultRow
{
    public string ResultType { get; set; } = "";
    public int Id { get; set; }
    public string? Title { get; set; }
    public string? Subtitle { get; set; }
    public string? Meta { get; set; }
    public DateTime? Date { get; set; }
    public int? ConversationId { get; set; }
}
