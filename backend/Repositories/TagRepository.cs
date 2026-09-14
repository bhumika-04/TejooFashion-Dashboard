using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Repositories;

public class Tag
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Color { get; set; } = "#6366f1";
    public string Type { get; set; } = "conversation"; // conversation | customer
    public string? Description { get; set; }             // guides the AI auto-tagger
    public DateTime CreatedAt { get; set; }
    public bool IsAuto { get; set; }                     // set only by GetByConversationAsync (AddedByUserId IS NULL)
}

public class TagRepository
{
    private readonly DatabaseHelper _db;
    public TagRepository(DatabaseHelper db) => _db = db;

    public async Task<IEnumerable<Tag>> GetAllAsync(string? type = null)
    {
        using var conn = _db.CreateConnection();
        var sql = type != null
            ? "SELECT * FROM Tags WHERE [Type] = @Type ORDER BY Name"
            : "SELECT * FROM Tags ORDER BY [Type], Name";
        return await conn.QueryAsync<Tag>(sql, new { Type = type });
    }

    public async Task<IEnumerable<Tag>> GetByConversationAsync(int conversationId)
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<Tag>(@"
            SELECT t.*, CAST(CASE WHEN ct.AddedByUserId IS NULL THEN 1 ELSE 0 END AS BIT) AS IsAuto
            FROM Tags t
            JOIN ConversationTags ct ON t.Id = ct.TagId
            WHERE ct.ConversationId = @ConversationId
            ORDER BY t.Name", new { ConversationId = conversationId });
    }

    public async Task<int> CreateAsync(string name, string color, string type = "conversation", string? description = null)
    {
        using var conn = _db.CreateConnection();
        return await conn.ExecuteScalarAsync<int>(
            "INSERT INTO Tags (Name, Color, [Type], Description) OUTPUT inserted.Id VALUES (@Name, @Color, @Type, @Description)",
            new { Name = name, Color = color, Type = type, Description = description });
    }

    public async Task<bool> UpdateAsync(int id, string name, string color, string? description)
    {
        using var conn = _db.CreateConnection();
        var rows = await conn.ExecuteAsync(
            "UPDATE Tags SET Name = @Name, Color = @Color, Description = @Description WHERE Id = @Id",
            new { Id = id, Name = name, Color = color, Description = description });
        return rows > 0;
    }

    /// <summary>Reconcile the AUTO tags (AddedByUserId IS NULL) on a conversation to exactly the desired set,
    /// leaving any manually-added tags untouched.</summary>
    public async Task SyncAutoConversationTagsAsync(int conversationId, IReadOnlyList<int> desiredTagIds)
    {
        using var conn = _db.CreateConnection();
        // Remove auto tags no longer desired (when desired is empty, @None=1 removes all auto tags).
        await conn.ExecuteAsync(@"
            DELETE FROM ConversationTags
            WHERE ConversationId = @ConversationId AND AddedByUserId IS NULL
              AND (@None = 1 OR TagId NOT IN @Desired)",
            new { ConversationId = conversationId, Desired = desiredTagIds, None = desiredTagIds.Count == 0 ? 1 : 0 });

        foreach (var tagId in desiredTagIds)
            await conn.ExecuteAsync(@"
                IF NOT EXISTS (SELECT 1 FROM ConversationTags WHERE ConversationId=@ConversationId AND TagId=@TagId)
                    INSERT INTO ConversationTags (ConversationId, TagId, AddedByUserId) VALUES (@ConversationId, @TagId, NULL)",
                new { ConversationId = conversationId, TagId = tagId });
    }

    public async Task<bool> IsTagsLockedAsync(int conversationId)
    {
        using var conn = _db.CreateConnection();
        return await conn.ExecuteScalarAsync<bool>(
            "SELECT ISNULL(TagsLocked, 0) FROM Conversations WHERE Id = @Id", new { Id = conversationId });
    }

    /// <summary>Freeze the auto-tagger for this conversation — called when a CRR manually edits its tags.</summary>
    public async Task LockTagsAsync(int conversationId)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync("UPDATE Conversations SET TagsLocked = 1 WHERE Id = @Id", new { Id = conversationId });
    }

    /// <summary>Returns the id of the tag with this name+type, creating it if it doesn't exist.</summary>
    public async Task<int> GetOrCreateByNameAsync(string name, string type = "conversation", string color = "#6366F1")
    {
        using var conn = _db.CreateConnection();
        var existing = await conn.ExecuteScalarAsync<int?>(
            "SELECT Id FROM Tags WHERE Name = @Name AND [Type] = @Type",
            new { Name = name, Type = type });
        if (existing is > 0) return existing.Value;

        return await conn.ExecuteScalarAsync<int>(
            "INSERT INTO Tags (Name, Color, [Type]) OUTPUT inserted.Id VALUES (@Name, @Color, @Type)",
            new { Name = name, Color = color, Type = type });
    }

    public async Task AddToConversationAsync(int conversationId, int tagId, int? userId)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync(@"
            IF NOT EXISTS (SELECT 1 FROM ConversationTags WHERE ConversationId = @ConversationId AND TagId = @TagId)
                INSERT INTO ConversationTags (ConversationId, TagId, AddedByUserId)
                VALUES (@ConversationId, @TagId, @UserId)",
            new { ConversationId = conversationId, TagId = tagId, UserId = userId });
    }

    public async Task RemoveFromConversationAsync(int conversationId, int tagId)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync(
            "DELETE FROM ConversationTags WHERE ConversationId = @ConversationId AND TagId = @TagId",
            new { ConversationId = conversationId, TagId = tagId });
    }

    public async Task DeleteAsync(int id)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync("DELETE FROM Tags WHERE Id = @Id", new { Id = id });
    }

    // Customer-level tags
    public async Task<IEnumerable<Tag>> GetByCustomerAsync(int customerId)
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<Tag>(@"
            SELECT t.* FROM Tags t
            JOIN CustomerTags ct ON t.Id = ct.TagId
            WHERE ct.CustomerId = @CustomerId
            ORDER BY t.Name", new { CustomerId = customerId });
    }

    public async Task AddToCustomerAsync(int customerId, int tagId)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync(@"
            IF NOT EXISTS (SELECT 1 FROM CustomerTags WHERE CustomerId = @CustomerId AND TagId = @TagId)
                INSERT INTO CustomerTags (CustomerId, TagId) VALUES (@CustomerId, @TagId)",
            new { CustomerId = customerId, TagId = tagId });
    }

    public async Task RemoveFromCustomerAsync(int customerId, int tagId)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync(
            "DELETE FROM CustomerTags WHERE CustomerId = @CustomerId AND TagId = @TagId",
            new { CustomerId = customerId, TagId = tagId });
    }
}
