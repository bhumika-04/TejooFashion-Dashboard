using Dapper;
using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Repositories;

public class EscalationRuleRepository
{
    private readonly DatabaseHelper _db;

    public EscalationRuleRepository(DatabaseHelper db)
    {
        _db = db;
    }

    public async Task<EscalationRule?> GetByIdAsync(int id)
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM EscalationRules WHERE Id = @Id";
        return await conn.QueryFirstOrDefaultAsync<EscalationRule>(sql, new { Id = id });
    }

    public async Task<List<EscalationRule>> GetAllAsync()
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM EscalationRules ORDER BY Priority DESC, CreatedAt DESC";
        var result = await conn.QueryAsync<EscalationRule>(sql);
        return result.ToList();
    }

    // Returns rules with assignee user name in a single query — avoids N+1
    public async Task<List<EscalationRuleWithUser>> GetAllWithUserAsync()
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT er.*, u.FullName AS AssigneeUserName
            FROM EscalationRules er
            LEFT JOIN Users u ON er.AssigneeUserId = u.Id
            ORDER BY er.Priority DESC, er.CreatedAt DESC";
        var result = await conn.QueryAsync<EscalationRuleWithUser>(sql);
        return result.ToList();
    }

    public async Task<List<EscalationRule>> GetActiveRulesAsync()
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM EscalationRules WHERE IsActive = 1 ORDER BY Priority DESC";
        var result = await conn.QueryAsync<EscalationRule>(sql);
        return result.ToList();
    }

    public async Task<EscalationRule> CreateAsync(EscalationRule rule)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            INSERT INTO EscalationRules (Name, Description, RuleType, Priority, IsActive,
                ConditionThreshold, ConditionKeywords, AssigneeTeam, AssigneeUserId,
                NotifyDashboard, NotifyEmail, NotifySMS, CreatedAt, UpdatedAt)
            VALUES (@Name, @Description, @RuleType, @Priority, @IsActive,
                @ConditionThreshold, @ConditionKeywords, @AssigneeTeam, @AssigneeUserId,
                @NotifyDashboard, @NotifyEmail, @NotifySMS, @CreatedAt, @UpdatedAt);
            SELECT CAST(SCOPE_IDENTITY() as int);";

        rule.CreatedAt = DateTime.UtcNow;
        rule.UpdatedAt = DateTime.UtcNow;

        rule.Id = await conn.ExecuteScalarAsync<int>(sql, rule);
        return rule;
    }

    public async Task<bool> UpdateAsync(EscalationRule rule)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            UPDATE EscalationRules SET
                Name = @Name,
                Description = @Description,
                RuleType = @RuleType,
                Priority = @Priority,
                IsActive = @IsActive,
                ConditionThreshold = @ConditionThreshold,
                ConditionKeywords = @ConditionKeywords,
                AssigneeTeam = @AssigneeTeam,
                AssigneeUserId = @AssigneeUserId,
                NotifyDashboard = @NotifyDashboard,
                NotifyEmail = @NotifyEmail,
                NotifySMS = @NotifySMS,
                UpdatedAt = @UpdatedAt
            WHERE Id = @Id";

        rule.UpdatedAt = DateTime.UtcNow;
        var rowsAffected = await conn.ExecuteAsync(sql, rule);
        return rowsAffected > 0;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        using var conn = _db.CreateConnection();
        var sql = "DELETE FROM EscalationRules WHERE Id = @Id";
        var rowsAffected = await conn.ExecuteAsync(sql, new { Id = id });
        return rowsAffected > 0;
    }

    public async Task<bool> ToggleActiveAsync(int id, bool isActive)
    {
        using var conn = _db.CreateConnection();
        var sql = "UPDATE EscalationRules SET IsActive = @IsActive, UpdatedAt = @UpdatedAt WHERE Id = @Id";
        var rowsAffected = await conn.ExecuteAsync(sql, new { Id = id, IsActive = isActive, UpdatedAt = DateTime.UtcNow });
        return rowsAffected > 0;
    }
}

// Flat projection for list view — includes assignee name without N+1
public class EscalationRuleWithUser : TejooWhatsApp.Models.Entities.EscalationRule
{
    public string? AssigneeUserName { get; set; }
}
