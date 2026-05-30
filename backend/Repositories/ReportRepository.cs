using Dapper;
using TejooWhatsApp.Models.DTOs;
using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Repositories;

public class ReportRepository
{
    private readonly DatabaseHelper _db;

    public ReportRepository(DatabaseHelper db)
    {
        _db = db;
    }

    public async Task<DashboardStatsDTO> GetDashboardStatsAsync()
    {
        using var conn = _db.CreateConnection();

        var stats = new DashboardStatsDTO();

        // Conversation stats
        var convStats = await conn.QueryFirstOrDefaultAsync<dynamic>(@"
            SELECT
                COUNT(*) as TotalConversations,
                SUM(CASE WHEN Status = 'Open' THEN 1 ELSE 0 END) as OpenConversations,
                SUM(CASE WHEN Status = 'Closed' THEN 1 ELSE 0 END) as ClosedConversations,
                SUM(CASE WHEN Status = 'Escalated' THEN 1 ELSE 0 END) as EscalatedConversations
            FROM Conversations");

        stats.TotalConversations = convStats?.TotalConversations ?? 0;
        stats.OpenConversations = convStats?.OpenConversations ?? 0;
        stats.ClosedConversations = convStats?.ClosedConversations ?? 0;
        stats.EscalatedConversations = convStats?.EscalatedConversations ?? 0;

        // Today's message stats
        var msgStats = await conn.QueryFirstOrDefaultAsync<dynamic>(@"
            SELECT
                COUNT(*) as TodayMessages,
                SUM(CASE WHEN Direction = 'inbound' THEN 1 ELSE 0 END) as TodayInbound,
                SUM(CASE WHEN Direction = 'outbound' THEN 1 ELSE 0 END) as TodayOutbound,
                SUM(CASE WHEN IsAiGenerated = 1 THEN 1 ELSE 0 END) as TodayAiReplies
            FROM Messages
            WHERE CAST(CreatedAt AS DATE) = CAST(GETUTCDATE() AS DATE)");

        stats.TodayMessages = msgStats?.TodayMessages ?? 0;
        stats.TodayInbound = msgStats?.TodayInbound ?? 0;
        stats.TodayOutbound = msgStats?.TodayOutbound ?? 0;
        stats.TodayAiReplies = msgStats?.TodayAiReplies ?? 0;

        // Session stats
        var sessionStats = await conn.QueryFirstOrDefaultAsync<dynamic>(@"
            SELECT
                COUNT(*) as TotalSessions,
                SUM(CASE WHEN IsActive = 1 AND IsConnected = 1 THEN 1 ELSE 0 END) as ActiveSessions
            FROM WhatsAppSessions");

        stats.TotalSessions = sessionStats?.TotalSessions ?? 0;
        stats.ActiveSessions = sessionStats?.ActiveSessions ?? 0;

        // Escalation stats
        var escalStats = await conn.QueryFirstOrDefaultAsync<dynamic>(@"
            SELECT
                SUM(CASE WHEN Status = 'Pending' THEN 1 ELSE 0 END) as PendingEscalations,
                SUM(CASE WHEN Status = 'Resolved' THEN 1 ELSE 0 END) as ResolvedEscalations
            FROM Escalations");

        stats.PendingEscalations = escalStats?.PendingEscalations ?? 0;
        stats.ResolvedEscalations = escalStats?.ResolvedEscalations ?? 0;

        // AI Handling Rate
        if (stats.TodayOutbound > 0)
        {
            stats.AiHandlingRate = ((decimal)stats.TodayAiReplies / stats.TodayOutbound) * 100;
        }

        return stats;
    }

    public async Task<List<ConversationTrendDTO>> GetConversationTrendsAsync(int days = 7)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT
                CAST(c.CreatedAt AS DATE) as Date,
                COUNT(*) as Total,
                COUNT(DISTINCT CASE WHEN m.IsAiGenerated = 1 THEN c.Id END) as AiHandled,
                COUNT(DISTINCT CASE WHEN m.IsAiGenerated = 0 AND m.Direction = 'outbound' THEN c.Id END) as HumanHandled
            FROM Conversations c
            LEFT JOIN Messages m ON c.Id = m.ConversationId
            WHERE c.CreatedAt >= DATEADD(day, -@Days, GETUTCDATE())
            GROUP BY CAST(c.CreatedAt AS DATE)
            ORDER BY Date DESC";

        var result = await conn.QueryAsync<ConversationTrendDTO>(sql, new { Days = days });
        return result.ToList();
    }

    public async Task<List<AgentStatsDTO>> GetAgentStatsAsync()
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT
                u.Id                                                        AS UserId,
                u.FullName                                                  AS UserName,
                u.Role,
                COUNT(DISTINCT c.Id)                                        AS TotalConversations,
                SUM(CASE WHEN c.Status = 'Open' THEN 1 ELSE 0 END)         AS ActiveConversations,
                SUM(CASE WHEN c.Status = 'Closed' THEN 1 ELSE 0 END)       AS ResolvedConversations,
                SUM(CASE WHEN c.Status = 'Escalated' THEN 1 ELSE 0 END)    AS EscalatedConversations,
                AVG(CASE
                    WHEN c.Status = 'Closed' AND c.ClosedAt IS NOT NULL
                    THEN DATEDIFF(MINUTE, c.CreatedAt, c.ClosedAt)
                    END)                                                    AS AvgResolutionMinutes
            FROM Users u
            LEFT JOIN Conversations c ON c.AssignedUserId = u.Id
            WHERE u.IsActive = 1
            GROUP BY u.Id, u.FullName, u.Role
            ORDER BY ResolvedConversations DESC";

        var result = await conn.QueryAsync<AgentStatsDTO>(sql);
        return result.ToList();
    }

    /// <summary>
    /// Per-agent performance stats for a date window.
    /// avgResponseTimeMinutes = avg(first outbound after each inbound, per conversation).
    /// </summary>
    public async Task<List<AgentPerformanceDTO>> GetPerformanceStatsAsync(DateTime from, DateTime to)
    {
        using var conn = _db.CreateConnection();

        var sql = @"
            SELECT
                u.Id                                                             AS UserId,
                u.FullName                                                        AS UserName,
                u.Role,
                COUNT(DISTINCT c.Id)                                              AS ConversationsHandled,
                SUM(CASE WHEN c.Status = 'Open' OR c.Status = 'Escalated'
                         THEN 1 ELSE 0 END)                                      AS ActiveConversations,
                SUM(CASE WHEN c.Status = 'Closed'
                         AND c.ClosedAt >= @From AND c.ClosedAt <= @To
                         THEN 1 ELSE 0 END)                                      AS ClosedInPeriod,
                COUNT(DISTINCT esc.Id)                                            AS EscalationsReceived,
                COUNT(DISTINCT CASE WHEN esc.Status = 'Resolved' THEN esc.Id END) AS EscalationsResolved,
                -- Real avg response time: ms from each inbound to next outbound
                AVG(resp.ResponseSeconds) / 60.0                                  AS AvgResponseTimeMinutes
            FROM Users u
            LEFT JOIN Conversations c
                ON c.AssignedUserId = u.Id
               AND c.CreatedAt BETWEEN @From AND @To
            LEFT JOIN Escalations esc
                ON esc.EscalatedToUserId = u.Id
               AND esc.EscalatedAt BETWEEN @From AND @To
            LEFT JOIN (
                -- For every inbound message in the period, find seconds until next outbound
                SELECT
                    c2.AssignedUserId,
                    CAST(DATEDIFF(SECOND, m_in.CreatedAt, MIN(m_out.CreatedAt)) AS FLOAT) AS ResponseSeconds
                FROM Messages m_in
                JOIN Conversations c2 ON m_in.ConversationId = c2.Id
                JOIN Messages m_out
                    ON m_out.ConversationId = m_in.ConversationId
                   AND m_out.Direction = 'outbound'
                   AND m_out.CreatedAt > m_in.CreatedAt
                WHERE m_in.Direction = 'inbound'
                  AND m_in.CreatedAt BETWEEN @From AND @To
                  AND c2.AssignedUserId > 0
                GROUP BY c2.AssignedUserId, m_in.Id, m_in.CreatedAt
            ) resp ON resp.AssignedUserId = u.Id
            WHERE u.IsActive = 1
              AND u.Role IN ('CRR', 'Manager', 'HOD')
            GROUP BY u.Id, u.FullName, u.Role
            ORDER BY ConversationsHandled DESC";

        var result = await conn.QueryAsync<AgentPerformanceDTO>(sql, new { From = from, To = to });
        return result.ToList();
    }

    public async Task<List<HourlyDistributionDTO>> GetHourlyDistributionAsync(int days = 7)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT
                DATEPART(HOUR, CreatedAt) AS Hour,
                COUNT(*) AS MessageCount,
                SUM(CASE WHEN Direction = 'inbound'  THEN 1 ELSE 0 END) AS Inbound,
                SUM(CASE WHEN Direction = 'outbound' THEN 1 ELSE 0 END) AS Outbound
            FROM Messages
            WHERE CreatedAt >= DATEADD(day, -@Days, GETUTCDATE())
            GROUP BY DATEPART(HOUR, CreatedAt)
            ORDER BY Hour";
        var result = await conn.QueryAsync<HourlyDistributionDTO>(sql, new { Days = days });
        // Fill in zero-count hours so the client always gets 24 rows
        var byHour = result.ToDictionary(r => r.Hour);
        return Enumerable.Range(0, 24)
            .Select(h => byHour.TryGetValue(h, out var row) ? row : new HourlyDistributionDTO { Hour = h })
            .ToList();
    }

    public async Task<List<TopCustomerDTO>> GetTopCustomersAsync(int days = 7, int top = 10)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT TOP (@Top)
                c.CustomerPhone,
                MAX(c.CustomerName) AS CustomerName,
                COUNT(m.Id)         AS MessageCount,
                COUNT(DISTINCT c.Id)AS ConversationCount,
                MAX(m.CreatedAt)    AS LastMessageAt
            FROM Messages m
            JOIN Conversations c ON m.ConversationId = c.Id
            WHERE m.Direction = 'inbound'
              AND m.CreatedAt >= DATEADD(day, -@Days, GETUTCDATE())
            GROUP BY c.CustomerPhone
            ORDER BY MessageCount DESC";
        var result = await conn.QueryAsync<TopCustomerDTO>(sql, new { Days = days, Top = top });
        return result.ToList();
    }

    public async Task<List<SessionActivityDTO>> GetSessionActivityAsync()
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT
                ws.PhoneNumber,
                ws.DisplayName,
                ws.MessagesToday as MessageCount,
                COUNT(DISTINCT c.Id) as ConversationCount,
                ws.LastActiveAt as LastActive
            FROM WhatsAppSessions ws
            LEFT JOIN Conversations c ON ws.Id = c.SessionId
            WHERE ws.IsActive = 1
            GROUP BY ws.Id, ws.PhoneNumber, ws.DisplayName, ws.MessagesToday, ws.LastActiveAt
            ORDER BY ws.LastActiveAt DESC";

        var result = await conn.QueryAsync<SessionActivityDTO>(sql);
        return result.ToList();
    }
}
