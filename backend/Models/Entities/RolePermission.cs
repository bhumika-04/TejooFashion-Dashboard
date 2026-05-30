namespace TejooWhatsApp.Models.Entities;

public class RolePermission
{
    public int Id { get; set; }
    public string Role { get; set; } = string.Empty;
    public string Page { get; set; } = string.Empty;
    public bool CanAccess { get; set; } = true;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
