namespace TejooWhatsApp.Models.DTOs;

public class DashboardStatsDTO
{
    public int TotalConversations { get; set; }
    public int OpenConversations { get; set; }
    public int ClosedConversations { get; set; }
    public int EscalatedConversations { get; set; }

    public int TodayMessages { get; set; }
    public int TodayInbound { get; set; }
    public int TodayOutbound { get; set; }
    public int TodayAiReplies { get; set; }

    public int ActiveSessions { get; set; }
    public int TotalSessions { get; set; }

    public int PendingEscalations { get; set; }
    public int ResolvedEscalations { get; set; }

    public decimal AverageResponseTime { get; set; } // in minutes
    public decimal AiHandlingRate { get; set; } // percentage

    public List<ConversationTrendDTO> ConversationTrends { get; set; } = new();
    public List<SessionActivityDTO> SessionActivity { get; set; } = new();
}

public class ConversationTrendDTO
{
    public DateTime Date { get; set; }
    public int Total { get; set; }
    public int AiHandled { get; set; }
    public int HumanHandled { get; set; }
}

public class SessionActivityDTO
{
    public string PhoneNumber { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public int MessageCount { get; set; }
    public int ConversationCount { get; set; }
    public DateTime? LastActive { get; set; }
}

public class AgentPerformanceDTO
{
    public int UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public int ConversationsHandled { get; set; }
    public int ActiveConversations { get; set; }
    public int ClosedInPeriod { get; set; }
    public int EscalationsReceived { get; set; }
    public int EscalationsResolved { get; set; }
    public double? AvgResponseTimeMinutes { get; set; }
    public int SlaMet { get; set; }        // conversations answered within their number's SLA
    public int SlaResponded { get; set; }  // conversations that got any first response
}

public class AgentStatsDTO
{
    public int UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public int TotalConversations { get; set; }
    public int ActiveConversations { get; set; }
    public int ResolvedConversations { get; set; }
    public int EscalatedConversations { get; set; }
    public int? AvgResolutionMinutes { get; set; }
}

public class HourlyDistributionDTO
{
    public int Hour { get; set; }
    public int MessageCount { get; set; }
    public int Inbound { get; set; }
    public int Outbound { get; set; }
}

public class TopCustomerDTO
{
    public string CustomerPhone { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public int MessageCount { get; set; }
    public int ConversationCount { get; set; }
    public DateTime? LastMessageAt { get; set; }
}

// ── First-response-time SLA ──────────────────────────────────────────────
public class ResponseSlaReport
{
    public int SlaMinutes { get; set; }
    public int Days { get; set; }
    public ResponseSlaSummary Overall { get; set; } = new();
    public List<AgentSlaRow> Agents { get; set; } = new();
}

public class ResponseSlaSummary
{
    public int TotalConversations { get; set; }
    public int Responded { get; set; }
    public int Unanswered { get; set; }
    public double? AvgFirstResponseMinutes { get; set; }
    public int MetSla { get; set; }
    public int BreachedSla { get; set; }
}

public class AgentSlaRow
{
    public int UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public int TotalConversations { get; set; }
    public double? AvgFirstResponseMinutes { get; set; }
    public int MetSla { get; set; }
    public int BreachedSla { get; set; }
}

public class IntentTrendRow
{
    public string Name { get; set; } = string.Empty;
    public string? Color { get; set; }
    public int Count { get; set; }
}

// ── Resolution & escalation analytics ────────────────────────────────────
public class ResolutionReport
{
    public int Days { get; set; }
    public int TotalConversations { get; set; }     // created in period
    public int TotalClosed { get; set; }            // closed in period
    public double? AvgResolutionMinutes { get; set; }
    public int AiHandled { get; set; }              // only AI replied
    public int HumanHandled { get; set; }           // a human replied
    public int NoReply { get; set; }                // no outbound recorded (often handled on Interakt app)
    public int EscalatedConversations { get; set; } // distinct convs escalated in period
    public double EscalationRate { get; set; }      // escalated / total conversations (%)
    public int TotalEscalations { get; set; }
    public int EscalationsResolved { get; set; }
    public double? AvgEscalationResolveMinutes { get; set; }
    public List<NamedCount> ByReason { get; set; } = new();
    public List<NamedCount> ByLevel { get; set; } = new();
}

public class NamedCount
{
    public string Name { get; set; } = string.Empty;
    public int Count { get; set; }
}

// ── Period-over-period comparison (current window vs the one before it) ───
public class PeriodComparison
{
    public int Days { get; set; }
    public int ConversationsCurrent { get; set; }
    public int ConversationsPrevious { get; set; }
    public int InboundCurrent { get; set; }
    public int InboundPrevious { get; set; }
    public int AiRepliesCurrent { get; set; }
    public int AiRepliesPrevious { get; set; }
    public int NewCustomersCurrent { get; set; }
    public int NewCustomersPrevious { get; set; }
}

// Team-level performance KPIs for the current window vs the equal-length previous window,
// so the Performance page can show real trend deltas instead of hardcoded ones.
public class PerformanceComparison
{
    public int ConversationsHandledCurrent { get; set; }
    public int ConversationsHandledPrevious { get; set; }
    public double? AvgResponseMinutesCurrent { get; set; }
    public double? AvgResponseMinutesPrevious { get; set; }
    public int AgentsActiveCurrent { get; set; }
}

/// <summary>Customer sentiment analytics from conversation summaries over a period.</summary>
public class SentimentAnalyticsDTO
{
    public int Positive { get; set; }
    public int Neutral { get; set; }
    public int Negative { get; set; }
    public double AvgScore { get; set; }
    public int Total => Positive + Neutral + Negative;
    public List<SentimentTrendPoint> Trend { get; set; } = new();
}

public class SentimentTrendPoint
{
    public DateTime Date { get; set; }
    public double AvgScore { get; set; }
    public int Count { get; set; }
}

/// <summary>One day's average first-response time (minutes) — for the response-time trend line.</summary>
public class ResponseTimeTrendPoint
{
    public DateTime Date { get; set; }
    public double AvgResponseMinutes { get; set; }
    public int Count { get; set; }
}
