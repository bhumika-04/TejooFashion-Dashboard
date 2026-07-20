using System.Reflection;
using DbUp;
using DbUp.Engine;

namespace TejooWhatsApp.Utilities;

/// <summary>
/// Runs the SQL migration scripts (embedded from <c>database/migrations</c>) using DbUp.
///
/// DbUp keeps a <c>SchemaVersions</c> journal table in the target database and only executes
/// scripts that have not been run before, in ascending file-name order (015_, 016_, ...).
/// All scripts are written to be idempotent (IF NOT EXISTS guards), so running them against an
/// existing database is safe — DbUp simply records them as applied on first run.
/// </summary>
public static class DbMigrator
{
    public static void Run(string connectionString, ILogger logger)
    {
        // Create the database if it does not yet exist (no-op when it already does).
        try
        {
            EnsureDatabase.For.SqlDatabase(connectionString);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "DbUp: could not ensure database exists (continuing — it may already exist).");
        }

        var upgrader = DeployChanges.To
            .SqlDatabase(connectionString)
            .WithScriptsEmbeddedInAssembly(
                Assembly.GetExecutingAssembly(),
                name => name.EndsWith(".sql", StringComparison.OrdinalIgnoreCase))
            .WithTransactionPerScript()
            .LogToConsole()
            .Build();

        if (!upgrader.IsUpgradeRequired())
        {
            logger.LogInformation("DbUp: database is up to date — no migrations to run.");
            return;
        }

        DatabaseUpgradeResult result = upgrader.PerformUpgrade();

        if (result.Successful)
        {
            logger.LogInformation("DbUp: migrations applied successfully ({Count} script(s)).",
                result.Scripts.Count());
        }
        else
        {
            logger.LogError(result.Error,
                "DbUp: migration failed on script '{Script}'.", result.ErrorScript?.Name);
            throw new InvalidOperationException(
                $"Database migration failed: {result.Error?.Message}", result.Error);
        }
    }
}
