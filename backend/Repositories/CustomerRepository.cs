using Dapper;
using TejooWhatsApp.Utilities;

namespace TejooWhatsApp.Repositories;

public class Customer
{
    public int Id { get; set; }
    public string Phone { get; set; } = string.Empty;
    public string? Name { get; set; }
    public string? Email { get; set; }
    public string? Notes { get; set; }
    public int TotalConversations { get; set; }
    public DateTime? LastSeenAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class CustomerStats
{
    public int Total { get; set; }
    public int ActiveThisWeek { get; set; }
    public int SeenToday { get; set; }
    public int NewThisWeek { get; set; }
}

public class CustomerRepository
{
    private readonly DatabaseHelper _db;
    public CustomerRepository(DatabaseHelper db) => _db = db;

    public async Task<IEnumerable<Customer>> GetAllAsync(string? search = null)
    {
        using var conn = _db.CreateConnection();
        var sql = """
            SELECT * FROM Customers
            WHERE (@Search IS NULL OR Phone LIKE '%' + @Search + '%'
                   OR Name LIKE '%' + @Search + '%'
                   OR Email LIKE '%' + @Search + '%')
            ORDER BY LastSeenAt DESC
            """;
        return await conn.QueryAsync<Customer>(sql, new { Search = search });
    }

    public async Task<(IEnumerable<Customer> Customers, int Total)> GetPagedAsync(string? search, int page, int pageSize)
    {
        using var conn = _db.CreateConnection();
        var where = string.IsNullOrEmpty(search)
            ? ""
            : "WHERE Phone LIKE '%' + @Search + '%' OR Name LIKE '%' + @Search + '%' OR Email LIKE '%' + @Search + '%'";

        var total = await conn.ExecuteScalarAsync<int>(
            $"SELECT COUNT(*) FROM Customers {where}", new { Search = search });

        var customers = await conn.QueryAsync<Customer>($"""
            SELECT * FROM Customers {where}
            ORDER BY LastSeenAt DESC
            OFFSET {(page - 1) * pageSize} ROWS FETCH NEXT {pageSize} ROWS ONLY
            """, new { Search = search });

        return (customers, total);
    }

    public async Task<Customer?> GetByIdAsync(int id)
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryFirstOrDefaultAsync<Customer>(
            "SELECT * FROM Customers WHERE Id = @Id", new { Id = id });
    }

    public async Task<Customer?> GetByPhoneAsync(string phone)
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryFirstOrDefaultAsync<Customer>(
            "SELECT * FROM Customers WHERE Phone = @Phone", new { Phone = phone });
    }

    public async Task<int> UpsertAsync(string phone, string? name = null, string? email = null)
    {
        using var conn = _db.CreateConnection();
        var sql = """
            MERGE Customers AS target
            USING (SELECT @Phone AS Phone) AS source ON target.Phone = source.Phone
            WHEN MATCHED THEN
                UPDATE SET
                    Name  = COALESCE(@Name, target.Name),
                    Email = COALESCE(@Email, target.Email),
                    TotalConversations = (SELECT COUNT(*) FROM Conversations WHERE CustomerPhone = @Phone),
                    LastSeenAt = GETUTCDATE(),
                    UpdatedAt  = GETUTCDATE()
            WHEN NOT MATCHED THEN
                INSERT (Phone, Name, Email, TotalConversations, LastSeenAt, CreatedAt, UpdatedAt)
                VALUES (@Phone, @Name, @Email,
                        (SELECT COUNT(*) FROM Conversations WHERE CustomerPhone = @Phone),
                        GETUTCDATE(), GETUTCDATE(), GETUTCDATE())
            OUTPUT inserted.Id;
            """;
        return await conn.ExecuteScalarAsync<int>(sql, new { Phone = phone, Name = name, Email = email });
    }

    public async Task UpdateAsync(int id, string? name, string? email, string? notes)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync("""
            UPDATE Customers SET
                Name      = COALESCE(@Name, Name),
                Email     = COALESCE(@Email, Email),
                Notes     = @Notes,
                UpdatedAt = GETUTCDATE()
            WHERE Id = @Id
            """, new { Id = id, Name = name, Email = email, Notes = notes });

        // Sync name to Conversations table so chat header reflects the update
        if (!string.IsNullOrEmpty(name))
        {
            var phone = await conn.ExecuteScalarAsync<string>(
                "SELECT Phone FROM Customers WHERE Id = @Id", new { Id = id });
            if (phone != null)
                await conn.ExecuteAsync(
                    "UPDATE Conversations SET CustomerName = @Name WHERE CustomerPhone = @Phone",
                    new { Name = name, Phone = phone });
        }
    }

    public async Task<CustomerStats> GetStatsAsync()
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryFirstAsync<CustomerStats>("""
            SELECT
                COUNT(*)                                                          AS Total,
                SUM(CASE WHEN LastSeenAt >= DATEADD(day,-7, GETUTCDATE()) THEN 1 ELSE 0 END) AS ActiveThisWeek,
                SUM(CASE WHEN CAST(LastSeenAt AS date) = CAST(GETUTCDATE() AS date) THEN 1 ELSE 0 END) AS SeenToday,
                SUM(CASE WHEN CreatedAt >= DATEADD(day,-7, GETUTCDATE()) THEN 1 ELSE 0 END) AS NewThisWeek
            FROM Customers
            """);
    }

    public async Task RefreshStatsAsync(string phone)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync("""
            UPDATE Customers SET
                TotalConversations = (SELECT COUNT(*) FROM Conversations WHERE CustomerPhone = @Phone),
                LastSeenAt = GETUTCDATE(),
                UpdatedAt  = GETUTCDATE()
            WHERE Phone = @Phone
            """, new { Phone = phone });
    }
}
