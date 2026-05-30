using Dapper;
using Microsoft.AspNetCore.Mvc;
using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/[controller]")]
public class SearchController : ControllerBase
{
    private readonly DatabaseHelper _db;
    public SearchController(DatabaseHelper db) => _db = db;

    // GET /api/search?q=keyword&limit=20
    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] string q, [FromQuery] int limit = 20)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
            return BadRequest(new { error = "Query must be at least 2 characters" });

        using var conn = _db.CreateConnection();

        var conversations = await conn.QueryAsync(@"
            SELECT TOP (@Limit) 'conversation' AS ResultType, c.Id,
                c.CustomerPhone AS Title,
                COALESCE(c.CustomerName, c.CustomerPhone) AS Subtitle,
                c.Status AS Meta,
                c.LastMessageAt AS Date
            FROM Conversations c
            WHERE c.CustomerPhone LIKE '%' + @Q + '%'
               OR c.CustomerName  LIKE '%' + @Q + '%'
            ORDER BY c.LastMessageAt DESC",
            new { Q = q, Limit = limit });

        var messages = await conn.QueryAsync(@"
            SELECT TOP (@Limit) 'message' AS ResultType, m.Id,
                m.Content AS Title,
                COALESCE(c.CustomerName, c.CustomerPhone) AS Subtitle,
                m.Direction AS Meta,
                m.CreatedAt AS Date,
                m.ConversationId
            FROM Messages m
            JOIN Conversations c ON m.ConversationId = c.Id
            WHERE m.Content LIKE '%' + @Q + '%'
            ORDER BY m.CreatedAt DESC",
            new { Q = q, Limit = limit });

        var customers = await conn.QueryAsync(@"
            SELECT TOP (@Limit) 'customer' AS ResultType, cu.Id,
                COALESCE(cu.Name, cu.Phone) AS Title,
                cu.Phone AS Subtitle,
                CAST(cu.TotalConversations AS NVARCHAR) + ' conversations' AS Meta,
                cu.LastSeenAt AS Date
            FROM Customers cu
            WHERE cu.Phone LIKE '%' + @Q + '%'
               OR cu.Name  LIKE '%' + @Q + '%'
               OR cu.Email LIKE '%' + @Q + '%'
            ORDER BY cu.LastSeenAt DESC",
            new { Q = q, Limit = limit });

        var users = await conn.QueryAsync(@"
            SELECT TOP 10 'user' AS ResultType, u.Id,
                u.FullName AS Title,
                u.Email AS Subtitle,
                u.Role AS Meta,
                u.CreatedAt AS Date
            FROM Users u
            WHERE u.FullName LIKE '%' + @Q + '%'
               OR u.Email    LIKE '%' + @Q + '%'",
            new { Q = q });

        return Ok(new
        {
            query = q,
            results = new
            {
                conversations,
                messages,
                customers,
                users,
                total = conversations.Count() + messages.Count() + customers.Count() + users.Count()
            }
        });
    }
}
