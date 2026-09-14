using TejooWhatsApp.AI;
using TejooWhatsApp.Repositories;

namespace TejooWhatsApp.Services;

/// <summary>
/// Classifies a conversation into the admin-managed conversation-tag taxonomy using AI, and
/// reconciles the AUTO tags (leaving manual tags untouched). Skips conversations a CRR has
/// manually edited (TagsLocked). Multiple tags per conversation are allowed.
/// </summary>
public class AutoTagService
{
    private readonly TagRepository _tags;
    private readonly MessageRepository _messages;
    private readonly OpenAiClient _openAi;
    private readonly ILogger<AutoTagService> _logger;

    public AutoTagService(TagRepository tags, MessageRepository messages, OpenAiClient openAi, ILogger<AutoTagService> logger)
    {
        _tags = tags;
        _messages = messages;
        _openAi = openAi;
        _logger = logger;
    }

    public async Task ClassifyAsync(int conversationId)
    {
        // A CRR has taken control of this conversation's tags — never fight them.
        if (await _tags.IsTagsLockedAsync(conversationId)) return;

        var taxonomy = (await _tags.GetAllAsync("conversation")).ToList();
        if (taxonomy.Count == 0) return; // nothing to classify into yet

        var messages = await _messages.GetByConversationIdAsync(conversationId, 40);
        if (messages.Count == 0) return;

        var transcript = string.Join("\n", messages.Select(m =>
            $"{(m.Direction == "inbound" ? "Customer" : "Agent")}: {m.Content ?? m.Transcript}"));
        var tagList = string.Join("\n", taxonomy.Select(t => $"- {t.Name}: {t.Description ?? "(no description)"}"));

        var systemPrompt =
            "You are a support-conversation classifier for a fashion wholesale business. " +
            "From the TAG LIST below, choose ONLY the tags that clearly apply to the conversation. " +
            "Return a comma-separated list of exact tag names from the list, or the single word NONE if none apply. " +
            "Do not invent tags or add anything outside the list.\n\nTAG LIST:\n" + tagList;

        string? reply;
        try { reply = await _openAi.GetSimpleCompletionAsync(systemPrompt, transcript); }
        catch (Exception ex) { _logger.LogWarning("Auto-tag classify failed for #{Id}: {Error}", conversationId, ex.Message); return; }
        if (string.IsNullOrWhiteSpace(reply)) return;

        var chosen = reply
            .Split(new[] { ',', '\n' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(s => s.Trim().TrimStart('-').Trim())
            .Where(s => s.Length > 0 && !s.Equals("NONE", StringComparison.OrdinalIgnoreCase))
            .ToList();

        var ids = taxonomy
            .Where(t => chosen.Any(c => c.Equals(t.Name, StringComparison.OrdinalIgnoreCase)))
            .Select(t => t.Id).Distinct().ToList();

        await _tags.SyncAutoConversationTagsAsync(conversationId, ids);
    }
}
