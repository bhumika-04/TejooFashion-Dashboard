using TejooWhatsApp.Utilities;
using TejooWhatsApp.Models.DTOs;
using TejooWhatsApp.Models.Entities;

namespace TejooWhatsApp.Repositories;

public class CatalogRepository
{
    private readonly DatabaseHelper _db;
    public CatalogRepository(DatabaseHelper db) => _db = db;

    /// <summary>All catalogs with item count + a cover image (first item), newest first.</summary>
    public async Task<List<CatalogDTO>> GetAllAsync()
    {
        using var conn = _db.CreateConnection();
        return (await conn.QueryAsync<CatalogDTO>(@"
            SELECT c.Id, c.Name, c.Info, c.CreatedAt,
                   (SELECT COUNT(*) FROM CatalogItems ci WHERE ci.CatalogId = c.Id) AS ItemCount,
                   (SELECT TOP 1 ci2.MediaUrl FROM CatalogItems ci2
                     WHERE ci2.CatalogId = c.Id ORDER BY ci2.SortOrder, ci2.Id) AS CoverUrl
            FROM Catalogs c
            ORDER BY c.CreatedAt DESC")).ToList();
    }

    public async Task<CatalogDetailDTO?> GetByIdAsync(int id)
    {
        using var conn = _db.CreateConnection();
        var catalog = await conn.QueryFirstOrDefaultAsync<Catalog>(
            "SELECT * FROM Catalogs WHERE Id = @Id", new { Id = id });
        if (catalog == null) return null;

        var items = (await conn.QueryAsync<CatalogItemDTO>(@"
            SELECT Id, MediaUrl, SourceMessageId, SortOrder
            FROM CatalogItems WHERE CatalogId = @Id
            ORDER BY SortOrder, Id", new { Id = id })).ToList();

        return new CatalogDetailDTO
        {
            Id = catalog.Id, Name = catalog.Name, Info = catalog.Info,
            CreatedAt = catalog.CreatedAt, Items = items
        };
    }

    public async Task<int> CreateAsync(string name, string? info, int? createdByUserId)
    {
        using var conn = _db.CreateConnection();
        return await conn.QuerySingleAsync<int>(@"
            INSERT INTO Catalogs (Name, Info, CreatedByUserId, CreatedAt)
            VALUES (@Name, @Info, @CreatedByUserId, SYSUTCDATETIME());
            SELECT CAST(SCOPE_IDENTITY() AS int);",
            new { Name = name, Info = info, CreatedByUserId = createdByUserId });
    }

    public async Task<bool> UpdateAsync(int id, string name, string? info)
    {
        using var conn = _db.CreateConnection();
        var rows = await conn.ExecuteAsync(
            "UPDATE Catalogs SET Name = @Name, Info = @Info, UpdatedAt = SYSUTCDATETIME() WHERE Id = @Id",
            new { Id = id, Name = name, Info = info });
        return rows > 0;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        using var conn = _db.CreateConnection();
        // CatalogItems cascade-delete via FK.
        var rows = await conn.ExecuteAsync("DELETE FROM Catalogs WHERE Id = @Id", new { Id = id });
        return rows > 0;
    }

    public async Task<bool> ExistsAsync(int id)
    {
        using var conn = _db.CreateConnection();
        return await conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM Catalogs WHERE Id = @Id", new { Id = id }) > 0;
    }

    /// <summary>Adds images to a catalog, skipping any already present (same MediaUrl). Returns how many were added.</summary>
    public async Task<int> AddItemsAsync(int catalogId, IEnumerable<CatalogItemInput> items)
    {
        using var conn = _db.CreateConnection();
        var added = 0;
        // Continue existing SortOrder sequence.
        var nextOrder = await conn.ExecuteScalarAsync<int>(
            "SELECT ISNULL(MAX(SortOrder), -1) + 1 FROM CatalogItems WHERE CatalogId = @CatalogId",
            new { CatalogId = catalogId });

        foreach (var item in items)
        {
            if (string.IsNullOrWhiteSpace(item.MediaUrl)) continue;
            var rows = await conn.ExecuteAsync(@"
                INSERT INTO CatalogItems (CatalogId, MediaUrl, SourceMessageId, SortOrder, CreatedAt)
                SELECT @CatalogId, @MediaUrl, @SourceMessageId, @SortOrder, SYSUTCDATETIME()
                WHERE NOT EXISTS (
                    SELECT 1 FROM CatalogItems
                    WHERE CatalogId = @CatalogId AND MediaUrl = @MediaUrl);",
                new { CatalogId = catalogId, item.MediaUrl, item.SourceMessageId, SortOrder = nextOrder });
            if (rows > 0) { added++; nextOrder++; }
        }
        return added;
    }

    public async Task<bool> RemoveItemAsync(int catalogId, int itemId)
    {
        using var conn = _db.CreateConnection();
        var rows = await conn.ExecuteAsync(
            "DELETE FROM CatalogItems WHERE Id = @ItemId AND CatalogId = @CatalogId",
            new { ItemId = itemId, CatalogId = catalogId });
        return rows > 0;
    }

    /// <summary>True if any catalog references a locally-stored media file under this conversation's folder —
    /// used by MediaCleanupService to avoid deleting files a catalog still points to.</summary>
    public async Task<bool> ConversationHasCatalogMediaAsync(int conversationId)
    {
        using var conn = _db.CreateConnection();
        return await conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM CatalogItems WHERE MediaUrl LIKE @Prefix",
            new { Prefix = $"/uploads/conversations/{conversationId}/%" }) > 0;
    }

    /// <summary>MediaUrls of a catalog's items in order — used when sending to a chat (Phase 2).</summary>
    public async Task<List<string>> GetItemUrlsAsync(int catalogId)
    {
        using var conn = _db.CreateConnection();
        return (await conn.QueryAsync<string>(
            "SELECT MediaUrl FROM CatalogItems WHERE CatalogId = @CatalogId ORDER BY SortOrder, Id",
            new { CatalogId = catalogId })).ToList();
    }
}
