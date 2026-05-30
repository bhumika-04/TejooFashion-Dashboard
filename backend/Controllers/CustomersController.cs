using Microsoft.AspNetCore.Mvc;
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

    public CustomersController(CustomerRepository customers, ConversationRepository conversations, TagRepository tags)
    {
        _customers = customers;
        _conversations = conversations;
        _tags = tags;
    }

    // GET /api/customers/stats
    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        var stats = await _customers.GetStatsAsync();
        return Ok(stats);
    }

    // GET /api/customers?search=&page=1&pageSize=20
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var (customers, total) = await _customers.GetPagedAsync(search, page, pageSize);
        return Ok(new { customers, total, page, pageSize });
    }

    // GET /api/customers/{id}
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var customer = await _customers.GetByIdAsync(id);
        if (customer == null) return NotFound();
        return Ok(customer);
    }

    // GET /api/customers/phone/{phone}
    [HttpGet("phone/{phone}")]
    public async Task<IActionResult> GetByPhone(string phone)
    {
        var customer = await _customers.GetByPhoneAsync(phone);
        if (customer == null) return NotFound();
        return Ok(customer);
    }

    // GET /api/customers/{id}/conversations
    [HttpGet("{id}/conversations")]
    public async Task<IActionResult> GetConversations(int id)
    {
        var customer = await _customers.GetByIdAsync(id);
        if (customer == null) return NotFound();

        var conversations = await _conversations.GetByCustomerPhoneAsync(customer.Phone);
        return Ok(conversations);
    }

    // PUT /api/customers/{id}
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateCustomerRequest req)
    {
        var customer = await _customers.GetByIdAsync(id);
        if (customer == null) return NotFound();

        await _customers.UpdateAsync(id, req.Name, req.Email, req.Notes);
        return Ok(new { success = true });
    }

    // GET /api/customers/{id}/tags
    [HttpGet("{id}/tags")]
    public async Task<IActionResult> GetTags(int id)
    {
        var tags = await _tags.GetByCustomerAsync(id);
        return Ok(tags);
    }

    // POST /api/customers/{id}/tags/{tagId}
    [HttpPost("{id}/tags/{tagId}")]
    public async Task<IActionResult> AddTag(int id, int tagId)
    {
        await _tags.AddToCustomerAsync(id, tagId);
        return Ok(new { success = true });
    }

    // DELETE /api/customers/{id}/tags/{tagId}
    [HttpDelete("{id}/tags/{tagId}")]
    public async Task<IActionResult> RemoveTag(int id, int tagId)
    {
        await _tags.RemoveFromCustomerAsync(id, tagId);
        return Ok(new { success = true });
    }
}

public record UpdateCustomerRequest(string? Name, string? Email, string? Notes);
