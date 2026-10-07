using System.Collections.Concurrent;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using TejooWhatsApp.Repositories;

namespace TejooWhatsApp.Security;

/// <summary>
/// Server-side twin of the Role Management screen: a role may use a page's API when the
/// RolePermissions table grants it that page (Admin always may). Using the same table as the
/// frontend menu means hiding a page from a role also locks its API — the two can't drift apart.
/// Singleton; grants are cached briefly and flushed when Role Management saves.
/// </summary>
public class PageAccessService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ConcurrentDictionary<string, (HashSet<string> Pages, DateTime LoadedAt)> _cache = new(StringComparer.OrdinalIgnoreCase);
    private static readonly TimeSpan CacheFor = TimeSpan.FromSeconds(60);

    public PageAccessService(IServiceScopeFactory scopeFactory) => _scopeFactory = scopeFactory;

    public static string RoleOf(ClaimsPrincipal user) => user.FindFirst(ClaimTypes.Role)?.Value ?? "";

    public static bool IsAdmin(ClaimsPrincipal user) => RoleOf(user).Equals("Admin", StringComparison.OrdinalIgnoreCase);

    /// <summary>CRR/Agent — the roles limited to their own conversations and customers.</summary>
    public static bool IsAgentRole(ClaimsPrincipal user) =>
        RoleOf(user) is var r && (r.Equals("CRR", StringComparison.OrdinalIgnoreCase) || r.Equals("Agent", StringComparison.OrdinalIgnoreCase));

    /// <summary>The caller's user id from the JWT, or null for a malformed token.</summary>
    public static int? UserIdOf(ClaimsPrincipal user)
    {
        var idStr = user.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? user.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        return int.TryParse(idStr, out var id) ? id : null;
    }

    /// <summary>Admin always; otherwise the role must be granted at least one of <paramref name="pages"/>.
    /// An empty page list means Admin-only.</summary>
    public async Task<bool> CanAccessAnyAsync(ClaimsPrincipal user, IEnumerable<string> pages)
    {
        if (IsAdmin(user)) return true;
        var wanted = pages.ToList();
        if (wanted.Count == 0) return false;

        var role = RoleOf(user);
        if (string.IsNullOrEmpty(role)) return false;

        if (!_cache.TryGetValue(role, out var entry) || DateTime.UtcNow - entry.LoadedAt > CacheFor)
        {
            using var scope = _scopeFactory.CreateScope();
            var repo = scope.ServiceProvider.GetRequiredService<RolePermissionRepository>();
            entry = (new HashSet<string>(await repo.GetAccessiblePagesAsync(role), StringComparer.OrdinalIgnoreCase), DateTime.UtcNow);
            _cache[role] = entry;
        }
        return wanted.Any(entry.Pages.Contains);
    }

    public void Invalidate() => _cache.Clear();
}

/// <summary>
/// Rejects the request with 403 unless the caller's role is granted one of the listed pages in
/// Role Management (Admin always passes). <c>[RequirePage]</c> with no pages = Admin only.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class RequirePageAttribute : Attribute, IAsyncAuthorizationFilter
{
    private readonly string[] _pages;
    public RequirePageAttribute(params string[] pages) => _pages = pages;

    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var user = context.HttpContext.User;
        if (user.Identity?.IsAuthenticated != true) { context.Result = new UnauthorizedResult(); return; }

        var access = context.HttpContext.RequestServices.GetRequiredService<PageAccessService>();
        if (!await access.CanAccessAnyAsync(user, _pages))
            context.Result = new ObjectResult(new { error = "You don't have permission to do this." }) { StatusCode = StatusCodes.Status403Forbidden };
    }
}
