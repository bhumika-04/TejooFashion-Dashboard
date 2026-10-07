using System.Globalization;
using System.Text.RegularExpressions;
using TejooWhatsApp.AI;
using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Repositories;

namespace TejooWhatsApp.Services;

/// <summary>
/// Applies the admin-managed Escalation Rules (Escalations page → Rules) to incoming customer messages.
///
/// How a rule matches:
///   • Custom / PaymentIntent / NegativeSentiment with keywords → the message contains one of the
///     comma-separated keywords as a whole word or phrase (case-insensitive; "return" doesn't match "returned").
///   • NegativeSentiment without keywords → the built-in negative-words list (AiHeuristics.LooksNegative).
///   • PaymentIntent without keywords     → the AI classified the message as a payment / credit query.
///   • LowConfidence                       → the AI's confidence is below the threshold (percent).
///
/// When a rule matches, the chat is escalated (same as the Escalate button): to the rule's specific
/// person if set, else the manager of the rule's team, else the chat owner's own manager. Rules are
/// tried High → Normal → Low priority; the first match wins. A chat with an open escalation is left
/// alone, and the same rule won't fire again on the same chat within 24 hours.
/// </summary>
public class EscalationRuleEngine
{
    public const string ReasonPrefix = "Rule: ";
    private static readonly TimeSpan RefireCooldown = TimeSpan.FromHours(24);

    private readonly EscalationRuleRepository _ruleRepo;
    private readonly EscalationRepository _escalationRepo;
    private readonly EscalationService _escalationService;
    private readonly ConversationRepository _conversationRepo;
    private readonly TeamRepository _teamRepo;
    private readonly ITeamMemberRepository _teamMemberRepo;
    private readonly UserRepository _userRepo;
    private readonly ILogger<EscalationRuleEngine> _logger;

    public EscalationRuleEngine(
        EscalationRuleRepository ruleRepo,
        EscalationRepository escalationRepo,
        EscalationService escalationService,
        ConversationRepository conversationRepo,
        TeamRepository teamRepo,
        ITeamMemberRepository teamMemberRepo,
        UserRepository userRepo,
        ILogger<EscalationRuleEngine> logger)
    {
        _ruleRepo = ruleRepo;
        _escalationRepo = escalationRepo;
        _escalationService = escalationService;
        _conversationRepo = conversationRepo;
        _teamRepo = teamRepo;
        _teamMemberRepo = teamMemberRepo;
        _userRepo = userRepo;
        _logger = logger;
    }

    /// <summary>Message-text rules (keywords / negative wording). Returns true if the chat was escalated.</summary>
    public Task<bool> EvaluateMessageAsync(Conversation conversation, string? text) =>
        string.IsNullOrWhiteSpace(text)
            ? Task.FromResult(false)
            : EvaluateAsync(conversation, rule => MatchText(rule, text));

    /// <summary>Rules that need the AI's verdict (low confidence, payment intent). Returns true if escalated.</summary>
    public Task<bool> EvaluateAiResultAsync(Conversation conversation, string? intent, decimal? confidence) =>
        EvaluateAsync(conversation, rule => MatchAi(rule, intent, confidence));

    private async Task<bool> EvaluateAsync(Conversation conversation, Func<EscalationRule, string?> match)
    {
        if (string.Equals(conversation.Status, "Closed", StringComparison.OrdinalIgnoreCase)) return false;

        var matches = (await _ruleRepo.GetActiveRulesAsync())
            .OrderBy(r => PriorityRank(r.Priority)).ThenBy(r => r.Id)
            .Select(r => (Rule: r, Why: match(r)))
            .Where(x => x.Why != null)
            .ToList();
        if (matches.Count == 0) return false;

        // One escalation at a time per chat (same as the Escalate button).
        if (await _escalationRepo.GetActiveEscalationAsync(conversation.Id) != null) return false;

        foreach (var (rule, why) in matches)
        {
            var reasonPrefix = $"{ReasonPrefix}{rule.Name} — ";
            if (await _escalationRepo.HasRecentWithReasonPrefixAsync(conversation.Id, reasonPrefix, DateTime.UtcNow - RefireCooldown))
                continue;

            var target = await ResolveTargetAsync(rule, conversation);
            if (target == null)
            {
                _logger.LogWarning("Escalation rule '{Rule}' matched conversation #{Id} but no active person to escalate to.", rule.Name, conversation.Id);
                continue;
            }
            if (target.Id == conversation.AssignedUserId) continue;   // already with the person it would go to

            var reason = reasonPrefix + why;
            if (reason.Length > 500) reason = reason[..500];
            var priority = NormalizePriority(rule.Priority);
            var fromUserId = conversation.AssignedUserId > 0 ? conversation.AssignedUserId : (int?)null;

            await _escalationService.CreateEscalationAsync(
                conversation.Id, target.Id, fromUserId, reason, priority,
                escalationLevel: EscalationService.LevelForRole(target.Role),
                notify: rule.NotifyDashboard);
            if (priority == "High")
                await _conversationRepo.UpdatePriorityAsync(conversation.Id, "High");

            conversation.Status = "Escalated";
            conversation.AssignedUserId = target.Id;
            _logger.LogInformation("Escalation rule '{Rule}' escalated conversation #{Id} to {User} ({Why}).",
                rule.Name, conversation.Id, target.FullName, why);
            return true;
        }
        return false;
    }

    // ── matching ─────────────────────────────────────────────────────────────

    private static string? MatchText(EscalationRule rule, string text)
    {
        var type = NormalizeType(rule.RuleType);
        if (type == "LowConfidence") return null;

        var keywords = Keywords(rule);
        if (keywords.Count > 0)
        {
            var hit = keywords.FirstOrDefault(k => ContainsPhrase(text, k));
            return hit == null ? null : $"customer wrote \"{hit}\"";
        }
        if (type == "NegativeSentiment" && AiHeuristics.LooksNegative(text))
            return "negative wording";
        return null;
    }

    private static string? MatchAi(EscalationRule rule, string? intent, decimal? confidence)
    {
        switch (NormalizeType(rule.RuleType))
        {
            case "LowConfidence":
                if (confidence is not { } c || ThresholdPercent(rule) is not { } t) return null;
                var pct = c * 100m;
                return pct < t ? $"AI confidence {pct:0}% (below {t:0.##}%)" : null;
            case "PaymentIntent":
                // With keywords the rule is keyword-driven (checked on the message text instead).
                if (Keywords(rule).Count > 0) return null;
                return intent is "payment_outstanding" or "credit_limit" ? $"AI detected a {intent.Replace('_', ' ')} query" : null;
            default:
                return null;
        }
    }

    /// <summary>Whole word/phrase, case-insensitive — "return" doesn't fire on "returned", "agent" not on "agents".</summary>
    private static bool ContainsPhrase(string text, string phrase) =>
        Regex.IsMatch(text, @"(?<![\p{L}\p{N}])" + Regex.Escape(phrase).Replace(@"\ ", @"\s+") + @"(?![\p{L}\p{N}])",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(200));

    public static List<string> Keywords(EscalationRule rule) =>
        (rule.ConditionKeywords ?? "")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(k => k.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

    /// <summary>Threshold as a percentage; "0.5" is read as 50%.</summary>
    public static decimal? ThresholdPercent(EscalationRule rule)
    {
        if (!decimal.TryParse(rule.ConditionThreshold?.Trim().TrimEnd('%'), NumberStyles.Number, CultureInfo.InvariantCulture, out var t) || t <= 0)
            return null;
        return t <= 1 ? t * 100 : t;
    }

    public static string NormalizeType(string? type) =>
        type?.Trim() switch
        {
            var t when string.Equals(t, "LowConfidence", StringComparison.OrdinalIgnoreCase)     => "LowConfidence",
            var t when string.Equals(t, "NegativeSentiment", StringComparison.OrdinalIgnoreCase) => "NegativeSentiment",
            var t when string.Equals(t, "PaymentIntent", StringComparison.OrdinalIgnoreCase)     => "PaymentIntent",
            _ => "Custom",
        };

    public static string NormalizePriority(string? priority) =>
        priority?.Trim().ToLowerInvariant() switch { "high" => "High", "low" => "Low", _ => "Normal" };

    private static int PriorityRank(string? priority) =>
        NormalizePriority(priority) switch { "High" => 0, "Normal" => 1, _ => 2 };

    // ── routing ──────────────────────────────────────────────────────────────

    private async Task<User?> ResolveTargetAsync(EscalationRule rule, Conversation conversation)
    {
        // 1. A specific person named on the rule.
        if (rule.AssigneeUserId is > 0)
        {
            var user = await _userRepo.GetByIdAsync(rule.AssigneeUserId.Value);
            if (user is { IsActive: true }) return user;
        }

        // 2. The rule's team: its manager, else its HOD.
        if (!string.IsNullOrWhiteSpace(rule.AssigneeTeam))
        {
            var team = (await _teamRepo.GetAllAsync(isActive: true))
                .FirstOrDefault(t => string.Equals(t.Name.Trim(), rule.AssigneeTeam.Trim(), StringComparison.OrdinalIgnoreCase));
            if (team != null)
            {
                if (team.ManagerId is > 0)
                {
                    var manager = await _userRepo.GetByIdAsync(team.ManagerId.Value);
                    if (manager is { IsActive: true }) return manager;
                }
                var members = await _teamMemberRepo.GetMembersByTeamAsync(team.Id);
                bool Usable(TeamMember tm) => tm.IsActive && tm.User is { IsActive: true };
                var lead = members.FirstOrDefault(tm => tm.RoleInTeam == "Manager" && Usable(tm))
                        ?? members.FirstOrDefault(tm => tm.RoleInTeam == "HOD" && Usable(tm));
                if (lead?.User != null) return lead.User;
            }
            else
            {
                _logger.LogWarning("Escalation rule '{Rule}': team '{Team}' not found or inactive — using the chat owner's manager.", rule.Name, rule.AssigneeTeam);
            }
        }

        // 3. The chat owner's own escalation chain (same as the Escalate button).
        return await _escalationService.GetNextEscalationUserAsync(conversation.AssignedUserId);
    }
}
