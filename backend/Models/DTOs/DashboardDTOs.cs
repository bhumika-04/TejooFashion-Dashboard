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
