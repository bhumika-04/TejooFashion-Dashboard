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
    public string? TagsRaw { get; set; }       // customer tags "Name|Color;;…" — populated by GetPagedAsync only
    public string? ConvTagsRaw { get; set; }   // distinct conversation tags across this customer's conversations
    public string? LastStatus { get; set; }    // status of the customer's most recent conversation
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

    public async Task<(IEnumerable<Customer> Customers, int Total)> GetPagedAsync(string? search, int page, int pageSize, int? tagId = null, int? assignedUserId = null)
    {
        using var conn = _db.CreateConnection();
        var conditions = new List<string>();
        if (!string.IsNullOrEmpty(search))
            conditions.Add("(c.Phone LIKE '%' + @Search + '%' OR c.Name LIKE '%' + @Search + '%' OR c.Email LIKE '%' + @Search + '%')");
        if (tagId.HasValue)
            conditions.Add("EXISTS (SELECT 1 FROM CustomerTags ct WHERE ct.CustomerId = c.Id AND ct.TagId = @TagId)");
        // CRR/agent scoping: only customers who have a conversation assigned to this user.
        if (assignedUserId.HasValue)
            conditions.Add("EXISTS (SELECT 1 FROM Conversations cv WHERE cv.CustomerPhone = c.Phone AND cv.AssignedUserId = @AssignedUserId)");
        var where = conditions.Count > 0 ? "WHERE " + string.Join(" AND ", conditions) : "";

        var total = await conn.ExecuteScalarAsync<int>(
            $"SELECT COUNT(*) FROM Customers c {where}", new { Search = search, TagId = tagId, AssignedUserId = assignedUserId });

        var customers = await conn.QueryAsync<Customer>($"""
            SELECT c.*,
                   (SELECT STRING_AGG(t.Name + '|' + t.Color, ';;')
                    FROM CustomerTags ct JOIN Tags t ON t.Id = ct.TagId
                    WHERE ct.CustomerId = c.Id) AS TagsRaw,
                   (SELECT STRING_AGG(x.NameColor, ';;')
                    FROM (SELECT DISTINCT t.Name + '|' + t.Color AS NameColor
                          FROM Conversations cv
                          JOIN ConversationTags cvt ON cvt.ConversationId = cv.Id
                          JOIN Tags t ON t.Id = cvt.TagId
                          WHERE cv.CustomerPhone = c.Phone) x) AS ConvTagsRaw,
                   (SELECT TOP 1 cv.Status
                    FROM Conversations cv
                    WHERE cv.CustomerPhone = c.Phone
                    ORDER BY CASE WHEN cv.LastMessageAt IS NULL THEN 1 ELSE 0 END,
                             cv.LastMessageAt DESC, cv.CreatedAt DESC) AS LastStatus
            FROM Customers c {where}
            ORDER BY c.LastSeenAt DESC
            OFFSET {(page - 1) * pageSize} ROWS FETCH NEXT {pageSize} ROWS ONLY
            """, new { Search = search, TagId = tagId, AssignedUserId = assignedUserId });

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

    public async Task<CustomerStats> GetStatsAsync(int? assignedUserId = null)
    {
        using var conn = _db.CreateConnection();
        // CRR/agent scoping: restrict the aggregate to customers with a conversation assigned to this user.
        var scope = assignedUserId.HasValue
            ? "WHERE EXISTS (SELECT 1 FROM Conversations cv WHERE cv.CustomerPhone = c.Phone AND cv.AssignedUserId = @AssignedUserId)"
            : "";
        return await conn.QueryFirstAsync<CustomerStats>($"""
            SELECT
                COUNT(*)                                                          AS Total,
                SUM(CASE WHEN LastSeenAt >= DATEADD(day,-7, GETUTCDATE()) THEN 1 ELSE 0 END) AS ActiveThisWeek,
                SUM(CASE WHEN CAST(DATEADD(MINUTE,330,LastSeenAt) AS date) = CAST(DATEADD(MINUTE,330,GETUTCDATE()) AS date) THEN 1 ELSE 0 END) AS SeenToday,
                SUM(CASE WHEN CreatedAt >= DATEADD(day,-7, GETUTCDATE()) THEN 1 ELSE 0 END) AS NewThisWeek
            FROM Customers c {scope}
            """, new { AssignedUserId = assignedUserId });
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
