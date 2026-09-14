namespace TejooWhatsApp.Models.Entities;

/// <summary>A named group of product images (name + info). Global; visible to all users.</summary>
public class Catalog
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Info { get; set; }
    public int? CreatedByUserId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

/// <summary>An image inside a catalog. MediaUrl is stored directly; SourceMessageId
/// (when present) links back to the gallery message that image came from.</summary>
public class CatalogItem
{
    public int Id { get; set; }
    public int CatalogId { get; set; }
    public string MediaUrl { get; set; } = string.Empty;
    public int? SourceMessageId { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; }
}
