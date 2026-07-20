using Microsoft.Data.SqlClient;

namespace TejooWhatsApp.Utilities;

public class DatabaseHelper
{
    private readonly string _connectionString;

    public DatabaseHelper(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");
    }

    /// <summary>
    /// Creates a new (closed) SqlConnection. The Db extension helpers open it lazily.
    /// Returns the concrete type so the ADO.NET extension methods bind correctly.
    /// </summary>
    public SqlConnection CreateConnection()
    {
        return new SqlConnection(_connectionString);
    }

    public string ConnectionString => _connectionString;
}
