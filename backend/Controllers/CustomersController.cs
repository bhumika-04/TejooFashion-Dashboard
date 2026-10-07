using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;
using TejooWhatsApp.Repositories;

namespace TejooWhatsApp.Controllers;

[Microsoft.AspNetCore.Authorization.Authorize]
[ApiController]
[Route("api/[controller]")]
public class CustomersController : ControllerBase
{
    private readonly CustomerRepository _customers;
    private readonly ConversationRepository _conversations;
    private readonly TagRepository _tags;
    private readonly TejooWhatsApp.Security.VisibilityService _visibility;

    public CustomersController(CustomerRepository customers, ConversationRepository conversations, TagRepository tags,
        TejooWhatsApp.Security.VisibilityService visibility)
    {
        _customers = customers;
        _conversations = conversations;
        _tags = tags;
        _visibility = visibility;
    }

    /// <summary>
    /// Same rule as the customer list: CRR/agents may only open customers they have a conversation
    /// with; other roles see every customer. Returns the customer, or null when hidden/missing.
    /// </summary>
    private async Task<Customer?> VisibleCustomerAsync(Customer? customer)
    {
        if (customer == null) return null;
        var scope = ScopeUserId();
        if (scope == null) return customer;
        var convs = await _conversations.GetByCustomerPhoneAsync(customer.Phone);
        return convs.Any(c => c.AssignedUserId == scope) ? customer : null;
    }

    // CRR/agents may only see customers tied to conversations assigned to them. Enforced from the
    // JWT (not a client-supplied param) so it can't be bypassed by calling the API directly.
    // Returns null for privileged roles (no scoping = see all).
    private int? ScopeUserId() =>
        TejooWhatsApp.Security.PageAccessService.IsAgentRole(User)
            ? TejooWhatsApp.Security.PageAccessService.UserIdOf(User) ?? -1   // -1 = matches nothing, fail closed
            : null;

    // GET /api/customers/stats
    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        var stats = await _customers.GetStatsAsync(ScopeUserId());
        return Ok(stats);
    }

    // GET /api/customers?search=&page=1&pageSize=20&tagIds=1&tagIds=2&convTagIds=3&assignedUserId=
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] int[]? tagIds = null,
        [FromQuery] int[]? convTagIds = null,
        [FromQuery] int? assignedUserId = null)
    {
        // Scoped roles (CRR/AGENT) are always locked to their own customers; privileged roles
        // may optionally narrow to one CRR via ?assignedUserId to review that agent's tagging.
        var scope = ScopeUserId();
        var effectiveUser = scope ?? assignedUserId;
        var (customers, total) = await _customers.GetPagedAsync(search, page, pageSize, tagIds, convTagIds, effectiveUser);
        return Ok(new { customers, total, page, pageSize });
    }

    // GET /api/customers/{id}
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var customer = await VisibleCustomerAsync(await _customers.GetByIdAsync(id));
        if (customer == null) return NotFound();
        return Ok(customer);
    }

    // GET /api/customers/phone/{phone}
    [HttpGet("phone/{phone}")]
    public async Task<IActionResult> GetByPhone(string phone)
    {
        var customer = await VisibleCustomerAsync(await _customers.GetByPhoneAsync(phone));
        if (customer == null) return NotFound();
        return Ok(customer);
    }

    // GET /api/customers/{id}/conversations
    [HttpGet("{id}/conversations")]
    public async Task<IActionResult> GetConversations(int id)
    {
        var customer = await VisibleCustomerAsync(await _customers.GetByIdAsync(id));
        if (customer == null) return NotFound();

        // Only the conversations the caller may open (same rule as the Conversations page).
        var visible = await _visibility.VisibleUserIdsAsync(User);
        var conversations = (await _conversations.GetByCustomerPhoneAsync(customer.Phone))
            .Where(c => visible == null || visible.Contains(c.AssignedUserId));
        return Ok(conversations);
    }

    // PUT /api/customers/{id}
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateCustomerRequest req)
    {
        var customer = await VisibleCustomerAsync(await _customers.GetByIdAsync(id));
        if (customer == null) return NotFound();

        await _customers.UpdateAsync(id, req.Name, req.Email, req.Notes);
        return Ok(new { success = true });
    }

    // GET /api/customers/{id}/tags
    [HttpGet("{id}/tags")]
    public async Task<IActionResult> GetTags(int id)
    {
        if (await VisibleCustomerAsync(await _customers.GetByIdAsync(id)) == null) return NotFound();
        var tags = await _tags.GetByCustomerAsync(id);
        return Ok(tags);
    }

    // POST /api/customers/{id}/tags/{tagId}
    [HttpPost("{id}/tags/{tagId}")]
    public async Task<IActionResult> AddTag(int id, int tagId)
    {
        if (await VisibleCustomerAsync(await _customers.GetByIdAsync(id)) == null) return NotFound();
        await _tags.AddToCustomerAsync(id, tagId);
        return Ok(new { success = true });
    }

    // DELETE /api/customers/{id}/tags/{tagId}
    [HttpDelete("{id}/tags/{tagId}")]
    public async Task<IActionResult> RemoveTag(int id, int tagId)
    {
        if (await VisibleCustomerAsync(await _customers.GetByIdAsync(id)) == null) return NotFound();
        await _tags.RemoveFromCustomerAsync(id, tagId);
        return Ok(new { success = true });
    }

    // POST /api/customers/bulk-tag — add or remove one tag across many customers at once
    [HttpPost("bulk-tag")]
    public async Task<IActionResult> BulkTag([FromBody] BulkCustomerTagRequest req)
    {
        if (req.CustomerIds is null || req.CustomerIds.Length == 0)
            return BadRequest(new { error = "No customers selected" });
        if (req.TagId <= 0)
            return BadRequest(new { error = "A tag is required" });

        var affected = 0;
        foreach (var id in req.CustomerIds.Distinct())
        {
            if (await VisibleCustomerAsync(await _customers.GetByIdAsync(id)) == null) continue;
            try
            {
                if (string.Equals(req.Action, "remove", StringComparison.OrdinalIgnoreCase))
                    await _tags.RemoveFromCustomerAsync(id, req.TagId);
                else
                    await _tags.AddToCustomerAsync(id, req.TagId);
                affected++;
            }
            catch { /* skip this one, keep going */ }
        }
        return Ok(new { success = true, affected });
    }
}

public record UpdateCustomerRequest(string? Name, string? Email, string? Notes);
public record BulkCustomerTagRequest(int[] CustomerIds, int TagId, string Action);
