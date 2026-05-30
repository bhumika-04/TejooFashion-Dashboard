using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Repositories;
using Microsoft.Extensions.DependencyInjection;
using System.Collections.Concurrent;

namespace TejooWhatsApp.AI;

// Registered as Singleton — uses IServiceScopeFactory to safely resolve scoped AiPromptRepository
public class PromptLoader
{
    private readonly IServiceScopeFactory _scopeFactory;
    // ConcurrentDictionary — safe for concurrent reads while RefreshCacheAsync rebuilds under _refreshLock
    private volatile ConcurrentDictionary<string, AiPrompt> _promptCache = new();
    private DateTime _lastCacheUpdate = DateTime.MinValue;
    private readonly TimeSpan _cacheExpiry = TimeSpan.FromMinutes(10);
    private readonly SemaphoreSlim _refreshLock = new(1, 1);

    public PromptLoader(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    public async Task<AiPrompt?> GetPromptAsync(string promptKey)
    {
        if (DateTime.UtcNow - _lastCacheUpdate > _cacheExpiry)
        {
            await RefreshCacheAsync();
        }

        _promptCache.TryGetValue(promptKey, out var prompt);
        return prompt;
    }

    public async Task<AiPrompt?> GetRouterPromptAsync()
    {
        return await GetPromptAsync("router");
    }

    public async Task<AiPrompt?> GetSpecialistPromptAsync(string intent)
    {
        // Map router intent to DB promptKey
        var promptKey = intent switch
        {
            "general_query"        => "general_query",
            "follow_up"            => "follow_up",
            "order_status"         => "order_status",
            "payment_outstanding"  => "payment_outstanding",
            "dispatch_info"        => "dispatch_info",
            "credit_limit"         => "credit_limit",
            // legacy / fallback mappings
            "general"              => "general_query",
            "followup"             => "follow_up",
            "payment_query"        => "payment_outstanding",
            "product_inquiry"      => "general_query",
            _                      => "general_query"
        };

        return await GetPromptAsync(promptKey);
    }

    // Force-expire the cache — call after any prompt update so new values take effect immediately
    public void InvalidateCache()
    {
        _lastCacheUpdate = DateTime.MinValue;
    }

    private async Task RefreshCacheAsync()
    {
        // Prevent concurrent refreshes
        await _refreshLock.WaitAsync();
        try
        {
            // Re-check after acquiring lock (another thread may have refreshed)
            if (DateTime.UtcNow - _lastCacheUpdate <= _cacheExpiry) return;

            using var scope = _scopeFactory.CreateScope();
            var promptRepo = scope.ServiceProvider.GetRequiredService<AiPromptRepository>();
            var prompts = await promptRepo.GetAllActiveAsync();

            // Build a new dictionary and swap atomically so concurrent readers
            // always see a complete snapshot — never a partially-cleared state.
            var fresh = new ConcurrentDictionary<string, AiPrompt>(
                prompts.Select(p => new KeyValuePair<string, AiPrompt>(p.PromptKey, p)));
            _promptCache = fresh;

            _lastCacheUpdate = DateTime.UtcNow;
        }
        finally
        {
            _refreshLock.Release();
        }
    }
}
