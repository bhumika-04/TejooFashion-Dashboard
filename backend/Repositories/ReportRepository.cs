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

    public async Task<DashboardStatsDTO> GetDashboardStatsAsync(string? fromDate = null, string? toDate = null)
    {
        using var conn = _db.CreateConnection();

        var stats = new DashboardStatsDTO();

        // Date window (IST calendar dates, yyyy-MM-dd). Defaults to today (IST) so the
        // no-argument call keeps the original "today" behaviour. Historical metrics
        // (conversations, messages, AI rate) are scoped to [@From, @To]; live-state metrics
        // (active sessions/users, pending escalations) are always current, never windowed.
        var istToday = DateTime.UtcNow.AddMinutes(330).ToString("yyyy-MM-dd");
        var from = string.IsNullOrWhiteSpace(fromDate) ? istToday : fromDate;
        var to   = string.IsNullOrWhiteSpace(toDate)   ? istToday : toDate;
        var range = new { From = from, To = to };

        // Conversation stats — scoped to conversations CREATED within the selected window (IST).
        var convStats = await conn.QueryFirstOrDefaultAsync<dynamic>(@"
            SELECT
                COUNT(*) as TotalConversations,
                COUNT(DISTINCT CustomerPhone) as TotalCustomers,
                SUM(CASE WHEN Status = 'Open' THEN 1 ELSE 0 END) as OpenConversations,
                SUM(CASE WHEN Status = 'Closed' THEN 1 ELSE 0 END) as ClosedConversations,
                SUM(CASE WHEN Status = 'Escalated' THEN 1 ELSE 0 END) as EscalatedConversations
            FROM Conversations
            WHERE CAST(DATEADD(MINUTE, 330, CreatedAt) AS DATE) BETWEEN @From AND @To", range);

        stats.TotalConversations = convStats?.TotalConversations ?? 0;
        stats.TotalCustomers = convStats?.TotalCustomers ?? 0;
        stats.OpenConversations = convStats?.OpenConversations ?? 0;
        stats.ClosedConversations = convStats?.ClosedConversations ?? 0;
        stats.EscalatedConversations = convStats?.EscalatedConversations ?? 0;

        // Message stats — scoped to the selected window (IST). Field names keep the "Today"
        // prefix for API compatibility; they now reflect whatever range is selected.
        var msgStats = await conn.QueryFirstOrDefaultAsync<dynamic>(@"
            SELECT
                COUNT(*) as TodayMessages,
                SUM(CASE WHEN Direction = 'inbound' THEN 1 ELSE 0 END) as TodayInbound,
                SUM(CASE WHEN Direction = 'outbound' THEN 1 ELSE 0 END) as TodayOutbound,
                SUM(CASE WHEN IsAiGenerated = 1 THEN 1 ELSE 0 END) as TodayAiReplies
            FROM Messages
            WHERE CAST(DATEADD(MINUTE, 330, CreatedAt) AS DATE) BETWEEN @From AND @To", range);

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
        // Zero-fill the full date range so "Last N Days" always shows N continuous bars,
        // not just the days that happen to have conversations.
        // CreatedAt/GETUTCDATE() are UTC; shift by +5:30 (IST, no DST) so day boundaries match
        // the local calendar — otherwise late-night IST activity lands on the previous day.
        var sql = @"
            WITH DateSeries AS (
                SELECT CAST(DATEADD(day, -(@Days - 1), DATEADD(MINUTE, 330, GETUTCDATE())) AS DATE) AS [Date]
                UNION ALL
                SELECT DATEADD(day, 1, [Date]) FROM DateSeries
                WHERE [Date] < CAST(DATEADD(MINUTE, 330, GETUTCDATE()) AS DATE)
            ),
            Agg AS (
                SELECT
                    CAST(DATEADD(MINUTE, 330, c.CreatedAt) AS DATE) AS [Date],
                    COUNT(*) AS Total,
                    COUNT(DISTINCT CASE WHEN m.IsAiGenerated = 1 THEN c.Id END) AS AiHandled,
                    COUNT(DISTINCT CASE WHEN m.IsAiGenerated = 0 AND m.Direction = 'outbound' THEN c.Id END) AS HumanHandled
                FROM Conversations c
                LEFT JOIN Messages m ON c.Id = m.ConversationId
                WHERE DATEADD(MINUTE, 330, c.CreatedAt) >= DATEADD(day, -(@Days - 1), CAST(DATEADD(MINUTE, 330, GETUTCDATE()) AS DATE))
                GROUP BY CAST(DATEADD(MINUTE, 330, c.CreatedAt) AS DATE)
            )
            SELECT ds.[Date] AS [Date],
                   ISNULL(a.Total, 0)        AS Total,
                   ISNULL(a.AiHandled, 0)    AS AiHandled,
                   ISNULL(a.HumanHandled, 0) AS HumanHandled
            FROM DateSeries ds
            LEFT JOIN Agg a ON a.[Date] = ds.[Date]
            ORDER BY ds.[Date] DESC
            OPTION (MAXRECURSION 366)";

        var result = await conn.QueryAsync<ConversationTrendDTO>(sql, new { Days = days });
        return result.ToList();
    }

    public async Task<List<AgentStatsDTO>> GetAgentStatsAsync(int days = 36500)
    {
        using var conn = _db.CreateConnection();
        // Conversations are scoped to the last @Days (IST) via the JOIN condition, so agents with no
        // activity in the window still appear (with zero counts). Default is effectively all-time.
        var sql = @"
            SELECT
                u.Id                                                        AS UserId,
                u.FullName                                                  AS UserName,
                u.Role,
                COUNT(DISTINCT c.CustomerPhone)                            AS UniqueCustomers,
                ISNULL(MAX(msg.MessagesSent), 0)                           AS MessagesSent,
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
                AND CAST(DATEADD(MINUTE,330,c.CreatedAt) AS DATE) >= DATEADD(day, -(@Days - 1), CAST(DATEADD(MINUTE,330,GETUTCDATE()) AS DATE))
            LEFT JOIN (
                -- Outbound messages each agent sent within the same IST day window (one row per user).
                SELECT c2.AssignedUserId, COUNT(*) AS MessagesSent
                FROM Messages m2
                JOIN Conversations c2 ON c2.Id = m2.ConversationId
                WHERE m2.Direction = 'outbound'
                  AND c2.AssignedUserId > 0
                  AND CAST(DATEADD(MINUTE,330,m2.CreatedAt) AS DATE) >= DATEADD(day, -(@Days - 1), CAST(DATEADD(MINUTE,330,GETUTCDATE()) AS DATE))
                GROUP BY c2.AssignedUserId
            ) msg ON msg.AssignedUserId = u.Id
            WHERE u.IsActive = 1
            GROUP BY u.Id, u.FullName, u.Role
            ORDER BY UniqueCustomers DESC";

        var result = await conn.QueryAsync<AgentStatsDTO>(sql, new { Days = days });
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
                COUNT(DISTINCT c.CustomerPhone)                                  AS UniqueCustomers,
                ISNULL(MAX(msg.MessagesSent), 0)                                 AS MessagesSent,
                COUNT(DISTINCT c.Id)                                              AS ConversationsHandled,
                -- COUNT(DISTINCT ...) so the Escalations/response-time joins below can't inflate these.
                COUNT(DISTINCT CASE WHEN c.Status IN ('Open','Escalated')
                                    THEN c.Id END)                               AS ActiveConversations,
                COUNT(DISTINCT CASE WHEN c.Status = 'Closed'
                                     AND c.ClosedAt >= @From AND c.ClosedAt <= @To
                                    THEN c.Id END)                               AS ClosedInPeriod,
                COUNT(DISTINCT esc.Id)                                            AS EscalationsReceived,
                COUNT(DISTINCT CASE WHEN esc.Status = 'Resolved' THEN esc.Id END) AS EscalationsResolved,
                -- resp/sla are one row per user (constant), so MAX just reads that value.
                MAX(resp.AvgResponseSeconds) / 60.0                              AS AvgResponseTimeMinutes,
                MAX(sla.SlaMet)                                                  AS SlaMet,
                MAX(sla.SlaResponded)                                            AS SlaResponded
            FROM Users u
            LEFT JOIN Conversations c
                ON c.AssignedUserId = u.Id
               AND c.CreatedAt BETWEEN @From AND @To
            LEFT JOIN Escalations esc
                ON esc.EscalatedToUserId = u.Id
               AND esc.EscalatedAt BETWEEN @From AND @To
            LEFT JOIN (
                -- Avg response time per user, collapsed to ONE row per user so the joins above
                -- don't multiply the conversation counts (this fan-out was inflating 'Active').
                SELECT perMsg.AssignedUserId,
                       AVG(perMsg.ResponseSeconds) AS AvgResponseSeconds
                FROM (
                    -- For every inbound message in the period, seconds until the next outbound.
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
                ) perMsg
                GROUP BY perMsg.AssignedUserId
            ) resp ON resp.AssignedUserId = u.Id
            LEFT JOIN (
                -- Per-agent first-response SLA: how many of their conversations were answered within
                -- the CONVERSATION'S number SLA (WhatsAppSessions.SlaMinutes). One row per user.
                SELECT c3.AssignedUserId,
                       SUM(CASE WHEN frt.FrtSeconds IS NOT NULL
                                 AND frt.FrtSeconds <= COALESCE(ws.SlaMinutes, 30) * 60 THEN 1 ELSE 0 END) AS SlaMet,
                       SUM(CASE WHEN frt.FrtSeconds IS NOT NULL THEN 1 ELSE 0 END)                         AS SlaResponded
                FROM (SELECT ConversationId, MIN(CreatedAt) AS FirstInboundAt
                      FROM Messages WHERE Direction = 'inbound' GROUP BY ConversationId) fi2
                JOIN Conversations c3 ON c3.Id = fi2.ConversationId
                LEFT JOIN WhatsAppSessions ws ON ws.Id = c3.SessionId
                CROSS APPLY (SELECT DATEDIFF(SECOND, fi2.FirstInboundAt,
                        (SELECT MIN(m.CreatedAt) FROM Messages m
                         WHERE m.ConversationId = fi2.ConversationId AND m.Direction = 'outbound'
                           AND m.CreatedAt >= fi2.FirstInboundAt)) AS FrtSeconds) frt
                WHERE fi2.FirstInboundAt BETWEEN @From AND @To AND c3.AssignedUserId > 0
                GROUP BY c3.AssignedUserId
            ) sla ON sla.AssignedUserId = u.Id
            LEFT JOIN (
                -- Outbound messages the agent's side sent in the period. One row per user so it
                -- doesn't fan out the conversation/escalation counts.
                SELECT c5.AssignedUserId, COUNT(*) AS MessagesSent
                FROM Messages m5
                JOIN Conversations c5 ON c5.Id = m5.ConversationId
                WHERE m5.Direction = 'outbound'
                  AND m5.CreatedAt BETWEEN @From AND @To
                  AND c5.AssignedUserId > 0
                GROUP BY c5.AssignedUserId
            ) msg ON msg.AssignedUserId = u.Id
            WHERE u.IsActive = 1
              AND u.Role IN ('CRR', 'Manager', 'HOD')
            GROUP BY u.Id, u.FullName, u.Role
            ORDER BY UniqueCustomers DESC";

        var result = await conn.QueryAsync<AgentPerformanceDTO>(sql, new { From = from, To = to });
        return result.ToList();
    }

    public async Task<List<HourlyDistributionDTO>> GetHourlyDistributionAsync(int days = 7)
    {
        using var conn = _db.CreateConnection();
        // CreatedAt is stored in UTC; shift to IST (+5:30, no DST) before bucketing so the
        // heatmap hours and the derived "Peak Hour" reflect local clock time, not UTC.
        var sql = @"
            SELECT
                DATEPART(HOUR, DATEADD(MINUTE, 330, CreatedAt)) AS Hour,
                COUNT(*) AS MessageCount,
                SUM(CASE WHEN Direction = 'inbound'  THEN 1 ELSE 0 END) AS Inbound,
                SUM(CASE WHEN Direction = 'outbound' THEN 1 ELSE 0 END) AS Outbound
            FROM Messages
            WHERE CreatedAt >= DATEADD(day, -@Days, GETUTCDATE())
            GROUP BY DATEPART(HOUR, DATEADD(MINUTE, 330, CreatedAt))
            ORDER BY Hour";
        var result = await conn.QueryAsync<HourlyDistributionDTO>(sql, new { Days = days });
        // Fill in zero-count hours so the client always gets 24 rows
        var byHour = result.ToDictionary(r => r.Hour);
        return Enumerable.Range(0, 24)
            .Select(h => byHour.TryGetValue(h, out var row) ? row : new HourlyDistributionDTO { Hour = h })
            .ToList();
    }

    /// <summary>Daily average first-response time (minutes) over the period — for the response-time trend.</summary>
    public async Task<List<ResponseTimeTrendPoint>> GetResponseTimeTrendAsync(int days = 7)
    {
        using var conn = _db.CreateConnection();
        var from = DateTime.UtcNow.AddDays(-days);
        return (await conn.QueryAsync<ResponseTimeTrendPoint>(@"
            WITH FirstReply AS (
                SELECT CAST(DATEADD(MINUTE, 330, c.CreatedAt) AS DATE)                    AS D,
                       DATEDIFF(SECOND, fi.FirstInboundAt, fo.FirstOutboundAt) / 60.0     AS Mins
                FROM Conversations c
                JOIN (SELECT ConversationId, MIN(CreatedAt) AS FirstInboundAt  FROM Messages WHERE Direction='inbound'  GROUP BY ConversationId) fi ON fi.ConversationId = c.Id
                JOIN (SELECT ConversationId, MIN(CreatedAt) AS FirstOutboundAt FROM Messages WHERE Direction='outbound' GROUP BY ConversationId) fo ON fo.ConversationId = c.Id
                WHERE c.CreatedAt >= @From AND fo.FirstOutboundAt > fi.FirstInboundAt
            )
            SELECT D AS [Date], AVG(Mins) AS AvgResponseMinutes, COUNT(*) AS [Count]
            FROM FirstReply
            GROUP BY D
            ORDER BY D", new { From = from })).ToList();
    }

    /// <summary>Customer sentiment distribution + daily trend from conversation summaries (IST day buckets).</summary>
    public async Task<SentimentAnalyticsDTO> GetSentimentAnalyticsAsync(int days = 7)
    {
        using var conn = _db.CreateConnection();
        var from = DateTime.UtcNow.AddDays(-days);

        var result = await conn.QueryFirstOrDefaultAsync<SentimentAnalyticsDTO>(@"
            SELECT
                SUM(CASE WHEN SentimentScore >= 0.3  THEN 1 ELSE 0 END)                          AS Positive,
                SUM(CASE WHEN SentimentScore <= -0.3 THEN 1 ELSE 0 END)                          AS Negative,
                SUM(CASE WHEN SentimentScore > -0.3 AND SentimentScore < 0.3 THEN 1 ELSE 0 END)  AS Neutral,
                ISNULL(AVG(CAST(SentimentScore AS FLOAT)), 0)                                    AS AvgScore
            FROM ConversationSummaries
            WHERE SentimentScore IS NOT NULL AND LastUpdatedAt >= @From", new { From = from }) ?? new SentimentAnalyticsDTO();

        result.Trend = (await conn.QueryAsync<SentimentTrendPoint>(@"
            SELECT CAST(DATEADD(MINUTE, 330, LastUpdatedAt) AS DATE) AS [Date],
                   AVG(CAST(SentimentScore AS FLOAT))               AS AvgScore,
                   COUNT(*)                                          AS [Count]
            FROM ConversationSummaries
            WHERE SentimentScore IS NOT NULL AND LastUpdatedAt >= @From
            GROUP BY CAST(DATEADD(MINUTE, 330, LastUpdatedAt) AS DATE)
            ORDER BY [Date]", new { From = from })).ToList();

        return result;
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

    /// <summary>
    /// First-response-time SLA over the last N days. First response = first outbound message
    /// after a conversation's first inbound. Returns an overall summary plus a per-agent breakdown.
    /// </summary>
    public async Task<ResponseSlaReport> GetResponseSlaAsync(int days = 7, int slaMinutes = 30)
    {
        using var conn = _db.CreateConnection();

        // CTE: first-response seconds per conversation (only convs whose first inbound is in-range).
        const string frtCte = @"
            WITH FirstInbound AS (
                SELECT ConversationId, MIN(CreatedAt) AS FirstInboundAt
                FROM Messages WHERE Direction = 'inbound'
                GROUP BY ConversationId
            ),
            Frt AS (
                SELECT fi.ConversationId,
                       c.AssignedUserId,
                       COALESCE(ws.SlaMinutes, @DefaultSla) * 60 AS SlaSeconds,   -- per-number SLA target
                       DATEDIFF(SECOND, fi.FirstInboundAt,
                           (SELECT MIN(m.CreatedAt) FROM Messages m
                            WHERE m.ConversationId = fi.ConversationId
                              AND m.Direction = 'outbound'
                              AND m.CreatedAt >= fi.FirstInboundAt)) AS FrtSeconds
                FROM FirstInbound fi
                JOIN Conversations c ON c.Id = fi.ConversationId
                LEFT JOIN WhatsAppSessions ws ON ws.Id = c.SessionId
                WHERE fi.FirstInboundAt >= DATEADD(day, -@Days, GETUTCDATE())
            )";

        // Note: "Unanswered" = no outbound message recorded. Many of these are replies sent from
        // the Interakt mobile app (not captured by the dashboard), so they are reported SEPARATELY
        // and NOT counted as SLA breaches — only a recorded-but-late first response is a breach.
        var overall = await conn.QueryFirstOrDefaultAsync<ResponseSlaSummary>(frtCte + @"
            SELECT
                COUNT(*)                                                          AS TotalConversations,
                SUM(CASE WHEN FrtSeconds IS NOT NULL THEN 1 ELSE 0 END)           AS Responded,
                SUM(CASE WHEN FrtSeconds IS NULL THEN 1 ELSE 0 END)               AS Unanswered,
                AVG(CASE WHEN FrtSeconds IS NOT NULL THEN CAST(FrtSeconds AS FLOAT) END) / 60.0 AS AvgFirstResponseMinutes,
                SUM(CASE WHEN FrtSeconds IS NOT NULL AND FrtSeconds <= SlaSeconds THEN 1 ELSE 0 END) AS MetSla,
                SUM(CASE WHEN FrtSeconds IS NOT NULL AND FrtSeconds > SlaSeconds THEN 1 ELSE 0 END)  AS BreachedSla
            FROM Frt",
            new { Days = days, DefaultSla = slaMinutes }) ?? new ResponseSlaSummary();

        var perAgent = await conn.QueryAsync<AgentSlaRow>(frtCte + @"
            SELECT
                u.Id                                                              AS UserId,
                u.FullName                                                        AS UserName,
                u.Role,
                COUNT(f.ConversationId)                                           AS TotalConversations,
                AVG(CASE WHEN f.FrtSeconds IS NOT NULL THEN CAST(f.FrtSeconds AS FLOAT) END) / 60.0 AS AvgFirstResponseMinutes,
                SUM(CASE WHEN f.FrtSeconds IS NOT NULL AND f.FrtSeconds <= f.SlaSeconds THEN 1 ELSE 0 END) AS MetSla,
                SUM(CASE WHEN f.FrtSeconds IS NOT NULL AND f.FrtSeconds > f.SlaSeconds THEN 1 ELSE 0 END)  AS BreachedSla
            FROM Frt f
            JOIN Users u ON u.Id = f.AssignedUserId
            WHERE u.IsActive = 1 AND f.AssignedUserId > 0
            GROUP BY u.Id, u.FullName, u.Role
            HAVING COUNT(f.ConversationId) > 0
            ORDER BY BreachedSla DESC, TotalConversations DESC",
            new { Days = days, DefaultSla = slaMinutes });

        return new ResponseSlaReport
        {
            SlaMinutes = slaMinutes,
            Days = days,
            Overall = overall,
            Agents = perAgent.ToList(),
        };
    }

    /// <summary>
    /// Tag distribution over the last N days, most common first.
    /// type="conversation" → distinct conversations per conversation-tag (by conversation CreatedAt).
    /// type="customer"     → distinct customers per customer-tag (by customer LastSeenAt).
    /// </summary>
    public async Task<List<IntentTrendRow>> GetTagDistributionAsync(string type = "conversation", int days = 7)
    {
        using var conn = _db.CreateConnection();
        var sql = type == "customer"
            ? @"SELECT t.Name, t.Color, COUNT(DISTINCT ct.CustomerId) AS [Count]
                FROM CustomerTags ct
                JOIN Tags t ON t.Id = ct.TagId
                JOIN Customers cu ON cu.Id = ct.CustomerId
                WHERE t.[Type] = 'customer'
                  AND cu.LastSeenAt >= DATEADD(day, -@Days, GETUTCDATE())
                GROUP BY t.Name, t.Color
                ORDER BY [Count] DESC"
            : @"SELECT t.Name, t.Color, COUNT(DISTINCT ct.ConversationId) AS [Count]
                FROM ConversationTags ct
                JOIN Tags t ON t.Id = ct.TagId
                JOIN Conversations c ON c.Id = ct.ConversationId
                WHERE t.[Type] = 'conversation'
                  AND c.CreatedAt >= DATEADD(day, -@Days, GETUTCDATE())
                GROUP BY t.Name, t.Color
                ORDER BY [Count] DESC";
        var result = await conn.QueryAsync<IntentTrendRow>(sql, new { Days = days });
        return result.ToList();
    }

    /// <summary>
    /// Current window (last N days) vs the immediately preceding N-day window, for headline KPIs.
    /// Lets the UI show ▲/▼ % change. Date boundaries use IST (+5:30).
    /// </summary>
    public async Task<PeriodComparison> GetPeriodComparisonAsync(int days = 7)
    {
        using var conn = _db.CreateConnection();
        // curStart = now-Days, prevStart = now-2*Days. "shift" converts a UTC column to IST for date math.
        var result = await conn.QueryFirstOrDefaultAsync<PeriodComparison>(@"
            DECLARE @now DATETIME = DATEADD(MINUTE, 330, GETUTCDATE());
            DECLARE @curStart  DATETIME = DATEADD(day, -@Days, @now);
            DECLARE @prevStart DATETIME = DATEADD(day, -2 * @Days, @now);
            SELECT
                (SELECT COUNT(*) FROM Conversations
                   WHERE DATEADD(MINUTE,330,CreatedAt) >= @curStart) AS ConversationsCurrent,
                (SELECT COUNT(*) FROM Conversations
                   WHERE DATEADD(MINUTE,330,CreatedAt) >= @prevStart AND DATEADD(MINUTE,330,CreatedAt) < @curStart) AS ConversationsPrevious,
                (SELECT COUNT(*) FROM Messages
                   WHERE Direction='inbound' AND DATEADD(MINUTE,330,CreatedAt) >= @curStart) AS InboundCurrent,
                (SELECT COUNT(*) FROM Messages
                   WHERE Direction='inbound' AND DATEADD(MINUTE,330,CreatedAt) >= @prevStart AND DATEADD(MINUTE,330,CreatedAt) < @curStart) AS InboundPrevious,
                (SELECT COUNT(*) FROM Messages
                   WHERE IsAiGenerated=1 AND DATEADD(MINUTE,330,CreatedAt) >= @curStart) AS AiRepliesCurrent,
                (SELECT COUNT(*) FROM Messages
                   WHERE IsAiGenerated=1 AND DATEADD(MINUTE,330,CreatedAt) >= @prevStart AND DATEADD(MINUTE,330,CreatedAt) < @curStart) AS AiRepliesPrevious,
                (SELECT COUNT(*) FROM Customers
                   WHERE DATEADD(MINUTE,330,CreatedAt) >= @curStart) AS NewCustomersCurrent,
                (SELECT COUNT(*) FROM Customers
                   WHERE DATEADD(MINUTE,330,CreatedAt) >= @prevStart AND DATEADD(MINUTE,330,CreatedAt) < @curStart) AS NewCustomersPrevious",
            new { Days = days }) ?? new PeriodComparison();
        result.Days = days;
        return result;
    }

    /// <summary>
    /// Team-level performance KPIs for the current window vs the equal-length previous window.
    /// Powers the real trend badges on the Performance page (conversations handled, avg response).
    /// </summary>
    public async Task<PerformanceComparison> GetPerformanceComparisonAsync(int days = 1)
    {
        using var conn = _db.CreateConnection();
        var result = await conn.QueryFirstOrDefaultAsync<PerformanceComparison>(@"
            DECLARE @now DATETIME = DATEADD(MINUTE, 330, GETUTCDATE());
            DECLARE @curStart  DATETIME = DATEADD(day, -@Days, @now);
            DECLARE @prevStart DATETIME = DATEADD(day, -2 * @Days, @now);
            SELECT
                (SELECT COUNT(DISTINCT c.Id) FROM Conversations c
                   WHERE c.AssignedUserId > 0
                     AND DATEADD(MINUTE,330,c.CreatedAt) >= @curStart) AS ConversationsHandledCurrent,
                (SELECT COUNT(DISTINCT c.Id) FROM Conversations c
                   WHERE c.AssignedUserId > 0
                     AND DATEADD(MINUTE,330,c.CreatedAt) >= @prevStart
                     AND DATEADD(MINUTE,330,c.CreatedAt) <  @curStart) AS ConversationsHandledPrevious,
                (SELECT COUNT(DISTINCT c.AssignedUserId) FROM Conversations c
                   WHERE c.AssignedUserId > 0
                     AND DATEADD(MINUTE,330,c.CreatedAt) >= @curStart) AS AgentsActiveCurrent,
                (SELECT AVG(rs.ResponseSeconds) / 60.0 FROM (
                    SELECT CAST(DATEDIFF(SECOND, m_in.CreatedAt, MIN(m_out.CreatedAt)) AS FLOAT) AS ResponseSeconds
                    FROM Messages m_in
                    JOIN Conversations c2 ON m_in.ConversationId = c2.Id
                    JOIN Messages m_out ON m_out.ConversationId = m_in.ConversationId
                         AND m_out.Direction = 'outbound' AND m_out.CreatedAt > m_in.CreatedAt
                    WHERE m_in.Direction = 'inbound' AND c2.AssignedUserId > 0
                      AND DATEADD(MINUTE,330,m_in.CreatedAt) >= @curStart
                    GROUP BY m_in.Id, m_in.CreatedAt) rs) AS AvgResponseMinutesCurrent,
                (SELECT AVG(rs.ResponseSeconds) / 60.0 FROM (
                    SELECT CAST(DATEDIFF(SECOND, m_in.CreatedAt, MIN(m_out.CreatedAt)) AS FLOAT) AS ResponseSeconds
                    FROM Messages m_in
                    JOIN Conversations c2 ON m_in.ConversationId = c2.Id
                    JOIN Messages m_out ON m_out.ConversationId = m_in.ConversationId
                         AND m_out.Direction = 'outbound' AND m_out.CreatedAt > m_in.CreatedAt
                    WHERE m_in.Direction = 'inbound' AND c2.AssignedUserId > 0
                      AND DATEADD(MINUTE,330,m_in.CreatedAt) >= @prevStart
                      AND DATEADD(MINUTE,330,m_in.CreatedAt) <  @curStart
                    GROUP BY m_in.Id, m_in.CreatedAt) rs) AS AvgResponseMinutesPrevious",
            new { Days = days }) ?? new PerformanceComparison();
        return result;
    }

    /// <summary>Resolution + escalation analytics over the last N days.</summary>
    public async Task<ResolutionReport> GetResolutionStatsAsync(int days = 7)
    {
        using var conn = _db.CreateConnection();
        var p = new { Days = days };

        // Handling split across ALL conversations created in the period (where the data actually is),
        // plus closed-conversation stats (count + avg resolution time) for when the close workflow is used.
        var res = await conn.QueryFirstOrDefaultAsync<ResolutionReport>(@"
            WITH ConvAgg AS (
                SELECT c.Id, c.Status, c.CreatedAt, c.ClosedAt, c.CustomerPhone,
                    MAX(CASE WHEN m.IsAiGenerated = 0 AND m.Direction = 'outbound' THEN 1 ELSE 0 END) AS HasHuman,
                    MAX(CASE WHEN m.IsAiGenerated = 1 THEN 1 ELSE 0 END) AS HasAi
                FROM Conversations c
                LEFT JOIN Messages m ON m.ConversationId = c.Id
                WHERE c.CreatedAt >= DATEADD(day, -@Days, GETUTCDATE())
                GROUP BY c.Id, c.Status, c.CreatedAt, c.ClosedAt, c.CustomerPhone
            )
            SELECT
                COUNT(*)                                                             AS TotalConversations,
                COUNT(DISTINCT CustomerPhone)                                        AS ActiveCustomers,
                SUM(CASE WHEN HasHuman = 1 THEN 1 ELSE 0 END)                        AS HumanHandled,
                SUM(CASE WHEN HasHuman = 0 AND HasAi = 1 THEN 1 ELSE 0 END)          AS AiHandled,
                SUM(CASE WHEN HasHuman = 0 AND HasAi = 0 THEN 1 ELSE 0 END)          AS NoReply,
                SUM(CASE WHEN Status = 'Closed' THEN 1 ELSE 0 END)                   AS TotalClosed,
                AVG(CASE WHEN Status = 'Closed' AND ClosedAt IS NOT NULL
                          THEN CAST(DATEDIFF(MINUTE, CreatedAt, ClosedAt) AS FLOAT) END) AS AvgResolutionMinutes
            FROM ConvAgg", p) ?? new ResolutionReport();

        // Escalation totals over the period.
        var esc = await conn.QueryFirstOrDefaultAsync<ResolutionReport>(@"
            SELECT
                COUNT(DISTINCT ConversationId)                                       AS EscalatedConversations,
                COUNT(*)                                                             AS TotalEscalations,
                SUM(CASE WHEN Status = 'Resolved' THEN 1 ELSE 0 END)                 AS EscalationsResolved,
                AVG(CASE WHEN Status = 'Resolved' AND ResolvedAt IS NOT NULL
                          THEN CAST(DATEDIFF(MINUTE, EscalatedAt, ResolvedAt) AS FLOAT) END) AS AvgEscalationResolveMinutes
            FROM Escalations
            WHERE EscalatedAt >= DATEADD(day, -@Days, GETUTCDATE())", p) ?? new ResolutionReport();

        res.Days = days;
        res.EscalatedConversations = esc.EscalatedConversations;
        res.TotalEscalations = esc.TotalEscalations;
        res.EscalationsResolved = esc.EscalationsResolved;
        res.AvgEscalationResolveMinutes = esc.AvgEscalationResolveMinutes;
        res.EscalationRate = res.TotalConversations > 0
            ? Math.Round(100.0 * res.EscalatedConversations / res.TotalConversations, 1) : 0;

        res.ByReason = (await conn.QueryAsync<NamedCount>(@"
            SELECT ISNULL(NULLIF(LTRIM(RTRIM(Reason)), ''), 'Unspecified') AS Name, COUNT(*) AS [Count]
            FROM Escalations
            WHERE EscalatedAt >= DATEADD(day, -@Days, GETUTCDATE())
            GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(Reason)), ''), 'Unspecified')
            ORDER BY [Count] DESC", p)).ToList();

        res.ByLevel = (await conn.QueryAsync<NamedCount>(@"
            SELECT CASE EscalationLevel WHEN 1 THEN 'CRR' WHEN 2 THEN 'Manager' WHEN 3 THEN 'HOD'
                        ELSE 'Level ' + CAST(EscalationLevel AS VARCHAR(10)) END AS Name,
                   COUNT(*) AS [Count]
            FROM Escalations
            WHERE EscalatedAt >= DATEADD(day, -@Days, GETUTCDATE())
            GROUP BY EscalationLevel
            ORDER BY EscalationLevel", p)).ToList();

        return res;
    }

    public async Task<List<SessionActivityDTO>> GetSessionActivityAsync()
    {
        using var conn = _db.CreateConnection();
        // MessageCount = real messages TODAY (IST) for this session, computed live — not the
        // cumulative-never-resets WhatsAppSessions.MessagesToday counter.
        var sql = @"
            SELECT
                ws.PhoneNumber,
                ws.DisplayName,
                (SELECT COUNT(*) FROM Messages m
                   INNER JOIN Conversations c2 ON c2.Id = m.ConversationId
                   WHERE c2.SessionId = ws.Id
                     AND CAST(DATEADD(MINUTE,330,m.CreatedAt) AS DATE)
                       = CAST(DATEADD(MINUTE,330,GETUTCDATE()) AS DATE)) as MessageCount,
                COUNT(DISTINCT c.Id) as ConversationCount,
                ws.LastActiveAt as LastActive
            FROM WhatsAppSessions ws
            LEFT JOIN Conversations c ON ws.Id = c.SessionId
            WHERE ws.IsActive = 1
            GROUP BY ws.Id, ws.PhoneNumber, ws.DisplayName, ws.LastActiveAt
            ORDER BY ws.LastActiveAt DESC";

        var result = await conn.QueryAsync<SessionActivityDTO>(sql);
        return result.ToList();
    }
}
