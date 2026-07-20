using TejooWhatsApp.Models.Entities;
using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Repositories;

public interface ITeamMemberRepository
{
    Task<List<TeamMember>> GetMembersByTeamAsync(int teamId);
    Task<TeamMember?> GetByIdAsync(int id);
    Task<TeamMember?> GetByTeamAndUserAsync(int teamId, int userId);
    Task<List<TeamMember>> GetMembershipsByUserAsync(int userId);
    Task<List<User>> GetAvailableUsersForTeamAsync(int teamId);
    Task<TeamMember> AddMemberAsync(int teamId, int userId, string roleInTeam, int? managerId);
    Task UpdateMemberRoleAsync(int id, string roleInTeam);
    Task UpdateManagerAsync(int id, int? managerId);
    Task RemoveMemberAsync(int teamId, int userId);
    Task<bool> IsUserInTeamAsync(int teamId, int userId);
    Task<bool> ValidateManagerInSameTeamAsync(int teamId, int managerId);
}

public class TeamMemberRepository : ITeamMemberRepository
{
    private readonly DatabaseHelper _db;

    public TeamMemberRepository(DatabaseHelper db)
    {
        _db = db;
    }

    public async Task<List<TeamMember>> GetMembersByTeamAsync(int teamId)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT
                tm.*,
                u.Id, u.FullName, u.Email, u.Phone, u.Role, u.IsActive,
                m.Id AS ManagerUserId, m.FullName AS ManagerFullName, m.Email AS ManagerEmail
            FROM TeamMembers tm
            INNER JOIN Users u ON tm.UserId = u.Id
            LEFT JOIN Users m ON tm.ManagerId = m.Id
            WHERE tm.TeamId = @TeamId
            ORDER BY
                CASE tm.RoleInTeam
                    WHEN 'Admin' THEN 1
                    WHEN 'HOD' THEN 2
                    WHEN 'Manager' THEN 3
                    WHEN 'CRR' THEN 4
                    ELSE 5
                END,
                u.FullName";

        var teamMembers = new List<TeamMember>();

        await conn.QueryAsync<TeamMember, User, User, TeamMember>(
            sql,
            (tm, user, manager) =>
            {
                tm.User = user;
                tm.Manager = manager;
                teamMembers.Add(tm);
                return tm;
            },
            new { TeamId = teamId },
            splitOn: "Id,ManagerUserId"
        );

        return teamMembers;
    }

    public async Task<TeamMember?> GetByIdAsync(int id)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT
                tm.*,
                u.Id, u.FullName, u.Email, u.Phone, u.Role, u.IsActive
            FROM TeamMembers tm
            INNER JOIN Users u ON tm.UserId = u.Id
            WHERE tm.Id = @Id";

        var result = await conn.QueryAsync<TeamMember, User, TeamMember>(
            sql,
            (tm, user) =>
            {
                tm.User = user;
                return tm;
            },
            new { Id = id },
            splitOn: "Id"
        );

        return result.FirstOrDefault();
    }

    public async Task<TeamMember?> GetByTeamAndUserAsync(int teamId, int userId)
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM TeamMembers WHERE TeamId = @TeamId AND UserId = @UserId";
        return await conn.QueryFirstOrDefaultAsync<TeamMember>(sql, new { TeamId = teamId, UserId = userId });
    }

    public async Task<List<TeamMember>> GetMembershipsByUserAsync(int userId)
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT * FROM TeamMembers WHERE UserId = @UserId AND IsActive = 1";
        var result = await conn.QueryAsync<TeamMember>(sql, new { UserId = userId });
        return result.ToList();
    }

    public async Task<List<User>> GetAvailableUsersForTeamAsync(int teamId)
    {
        using var conn = _db.CreateConnection();
        var sql = @"
            SELECT u.*
            FROM Users u
            WHERE u.IsActive = 1
            AND u.Id NOT IN (
                SELECT UserId FROM TeamMembers WHERE TeamId = @TeamId
            )
            ORDER BY u.FullName";

        var result = await conn.QueryAsync<User>(sql, new { TeamId = teamId });
        return result.ToList();
    }

    public async Task<TeamMember> AddMemberAsync(int teamId, int userId, string roleInTeam, int? managerId)
    {
        // Validate manager is in same team if provided
        if (managerId.HasValue)
        {
            var managerInTeam = await IsUserInTeamAsync(teamId, managerId.Value);
            if (!managerInTeam)
            {
                throw new InvalidOperationException("Manager must belong to the same team");
            }
        }

        using var conn = _db.CreateConnection();
        var sql = @"
            INSERT INTO TeamMembers (TeamId, UserId, ManagerId, RoleInTeam, IsActive, JoinedAt)
            OUTPUT INSERTED.*
            VALUES (@TeamId, @UserId, @ManagerId, @RoleInTeam, 1, GETUTCDATE())";

        var teamMember = await conn.QuerySingleAsync<TeamMember>(sql, new
        {
            TeamId = teamId,
            UserId = userId,
            ManagerId = managerId,
            RoleInTeam = roleInTeam
        });

        return teamMember;
    }

    public async Task UpdateMemberRoleAsync(int id, string roleInTeam)
    {
        using var conn = _db.CreateConnection();
        var sql = "UPDATE TeamMembers SET RoleInTeam = @RoleInTeam WHERE Id = @Id";
        await conn.ExecuteAsync(sql, new { Id = id, RoleInTeam = roleInTeam });
    }

    public async Task UpdateManagerAsync(int id, int? managerId)
    {
        // If managerId is provided, validate it's in same team
        if (managerId.HasValue)
        {
            var member = await GetByIdAsync(id);
            if (member == null)
            {
                throw new InvalidOperationException("Team member not found");
            }

            var managerInTeam = await IsUserInTeamAsync(member.TeamId, managerId.Value);
            if (!managerInTeam)
            {
                throw new InvalidOperationException("Manager must belong to the same team");
            }

            // Prevent circular hierarchy
            if (managerId.Value == member.UserId)
            {
                throw new InvalidOperationException("User cannot be their own manager");
            }
        }

        using var conn = _db.CreateConnection();
        var sql = "UPDATE TeamMembers SET ManagerId = @ManagerId WHERE Id = @Id";
        await conn.ExecuteAsync(sql, new { Id = id, ManagerId = managerId });
    }

    public async Task RemoveMemberAsync(int teamId, int userId)
    {
        using var conn = _db.CreateConnection();
        var sql = "DELETE FROM TeamMembers WHERE TeamId = @TeamId AND UserId = @UserId";
        await conn.ExecuteAsync(sql, new { TeamId = teamId, UserId = userId });
    }

    public async Task<bool> IsUserInTeamAsync(int teamId, int userId)
    {
        using var conn = _db.CreateConnection();
        var sql = "SELECT COUNT(1) FROM TeamMembers WHERE TeamId = @TeamId AND UserId = @UserId";
        var count = await conn.ExecuteScalarAsync<int>(sql, new { TeamId = teamId, UserId = userId });
        return count > 0;
    }

    public async Task<bool> ValidateManagerInSameTeamAsync(int teamId, int managerId)
    {
        return await IsUserInTeamAsync(teamId, managerId);
    }
}
