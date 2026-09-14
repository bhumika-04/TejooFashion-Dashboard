namespace TejooWhatsApp.Models.DTOs;

/// <summary>Catalog summary for the list/grid — includes item count and a cover image.</summary>
public class CatalogDTO
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Info { get; set; }
    public int ItemCount { get; set; }
    public string? CoverUrl { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>A single image within a catalog.</summary>
public class CatalogItemDTO
{
    public int Id { get; set; }
    public string MediaUrl { get; set; } = string.Empty;
    public int? SourceMessageId { get; set; }
    public int SortOrder { get; set; }
}

/// <summary>Full catalog with its images (catalog-detail view).</summary>
public class CatalogDetailDTO
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Info { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<CatalogItemDTO> Items { get; set; } = new();
}

public class CreateCatalogRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Info { get; set; }
}

public class UpdateCatalogRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Info { get; set; }
}

/// <summary>One image to add to a catalog (from the gallery or, later, an upload).</summary>
public class CatalogItemInput
{
    public string MediaUrl { get; set; } = string.Empty;
    public int? SourceMessageId { get; set; }
}

public class AddCatalogItemsRequest
{
    public List<CatalogItemInput> Items { get; set; } = new();
}

/// <summary>Send a catalog's images to a conversation. MediaUrls = the selected subset (≤30);
/// when empty, the whole catalog is sent (still capped at 30).</summary>
public class SendCatalogRequest
{
    public int ConversationId { get; set; }
    public List<string>? MediaUrls { get; set; }
}
