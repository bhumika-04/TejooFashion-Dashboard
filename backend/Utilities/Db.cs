using System.Collections.Concurrent;
using System.Data;
using System.Data.Common;
using System.Dynamic;
using System.Reflection;
using System.Runtime.CompilerServices;
using Microsoft.Data.SqlClient;

namespace TejooWhatsApp.Utilities;

/// <summary>
/// Lightweight raw-ADO.NET data-access helpers (Microsoft.Data.SqlClient).
///
/// These extension methods deliberately mirror the small slice of the Dapper API the
/// codebase used (QueryAsync / QueryFirstOrDefaultAsync / QuerySingleAsync / ExecuteAsync /
/// ExecuteScalarAsync, plus 2- and 3-type multi-map and dynamic rows) so the repositories
/// keep their existing call sites. Underneath there is no ORM — just SqlConnection,
/// SqlCommand and SqlDataReader with reflection-based column→property mapping.
///
/// Parameters are passed as an anonymous object whose property names match the @placeholders
/// in the SQL, e.g. <c>conn.QueryAsync&lt;User&gt;("... WHERE Id = @Id", new { Id = id })</c>.
/// Connections are opened lazily and left open for the caller's <c>using</c> block to dispose.
/// </summary>
public static class Db
{
    // Cache of settable properties per type, keyed by UPPER-cased name for case-insensitive lookup.
    private static readonly ConcurrentDictionary<Type, Dictionary<string, PropertyInfo>> _propCache = new();

    // ──────────────────────────────────────────────────────────── command/params

    private static async Task<SqlCommand> CreateCommandAsync(DbConnection conn, string sql, object? param)
    {
        if (conn.State != ConnectionState.Open)
            await conn.OpenAsync();

        var cmd = (SqlCommand)conn.CreateCommand();
        // AddParameters may rewrite the SQL (list parameters expand into IN (@p0,@p1,...)),
        // so set CommandText from its return value rather than the original sql.
        cmd.CommandText = AddParameters(cmd, sql, param);
        return cmd;
    }

    /// <summary>Returns the (possibly rewritten) SQL after binding parameters.</summary>
    private static string AddParameters(SqlCommand cmd, string sql, object? param)
    {
        if (param is null) return sql;

        foreach (var prop in param.GetType().GetProperties(BindingFlags.Public | BindingFlags.Instance))
        {
            // Only bind parameters actually referenced in the SQL (like Dapper). This lets callers
            // pass a full entity whose navigation/collection properties aren't SQL params without
            // SqlClient choking on "no mapping from object type List<...>".
            if (!IsParameterReferenced(sql, prop.Name)) continue;

            var value = prop.GetValue(param);

            // List/array parameters (e.g. "... IN @AssignedUserIds"): expand Dapper-style into
            // (@Name0, @Name1, ...) with one scalar SqlParameter each. SqlClient cannot bind a
            // List<int> directly, so without this a "IN @list" query throws "No mapping exists".
            if (value is System.Collections.IEnumerable en && value is not string && value is not byte[])
            {
                sql = ExpandListParameter(cmd, sql, prop.Name, en);
                continue;
            }

            // SqlClient won't accept CLR enums directly — send the underlying numeric value.
            if (value is not null)
            {
                var vt = value.GetType();
                if (vt.IsEnum)
                    value = Convert.ChangeType(value, Enum.GetUnderlyingType(vt));
            }

            var p = cmd.CreateParameter();
            p.ParameterName = "@" + prop.Name;
            p.Value = value ?? DBNull.Value;
            cmd.Parameters.Add(p);
        }

        return sql;
    }

    /// <summary>
    /// Replaces every whole-token occurrence of <c>@name</c> in the SQL with an expanded
    /// parameter list <c>(@name0, @name1, ...)</c> and adds one scalar parameter per element.
    /// An empty collection becomes <c>(SELECT NULL WHERE 1=0)</c> so that <c>IN</c> matches
    /// nothing and <c>NOT IN</c> matches everything (correct set semantics).
    /// </summary>
    private static string ExpandListParameter(SqlCommand cmd, string sql, string name, System.Collections.IEnumerable values)
    {
        var token = "@" + name;
        var replacements = new List<string>();
        var i = 0;
        foreach (var item in values)
        {
            var pName = $"{token}{i}";
            var val = item;
            if (val is not null)
            {
                var vt = val.GetType();
                if (vt.IsEnum) val = Convert.ChangeType(val, Enum.GetUnderlyingType(vt));
            }
            var p = cmd.CreateParameter();
            p.ParameterName = pName;
            p.Value = val ?? DBNull.Value;
            cmd.Parameters.Add(p);
            replacements.Add(pName);
            i++;
        }

        var expansion = replacements.Count > 0
            ? "(" + string.Join(", ", replacements) + ")"
            : "(SELECT NULL WHERE 1=0)";

        return ReplaceWholeToken(sql, token, expansion);
    }

    /// <summary>Replaces every occurrence of <paramref name="token"/> that is a complete
    /// parameter token (not a prefix of a longer @name) with <paramref name="replacement"/>.</summary>
    private static string ReplaceWholeToken(string sql, string token, string replacement)
    {
        var sb = new System.Text.StringBuilder();
        var idx = 0;
        while (true)
        {
            var found = sql.IndexOf(token, idx, StringComparison.OrdinalIgnoreCase);
            if (found < 0)
            {
                sb.Append(sql, idx, sql.Length - idx);
                break;
            }
            var after = found + token.Length;
            var isWhole = after >= sql.Length || !(char.IsLetterOrDigit(sql[after]) || sql[after] == '_');
            sb.Append(sql, idx, found - idx);
            sb.Append(isWhole ? replacement : token);
            idx = after;
        }
        return sb.ToString();
    }

    /// <summary>
    /// True if <c>@name</c> appears in the SQL as a complete parameter token (not merely a prefix
    /// of a longer name, e.g. <c>@Id</c> must not match <c>@IdentityValue</c>).
    /// </summary>
    private static bool IsParameterReferenced(string sql, string name)
    {
        var token = "@" + name;
        var idx = 0;
        while ((idx = sql.IndexOf(token, idx, StringComparison.OrdinalIgnoreCase)) >= 0)
        {
            var after = idx + token.Length;
            if (after >= sql.Length || !(char.IsLetterOrDigit(sql[after]) || sql[after] == '_'))
                return true;
            idx = after;
        }
        return false;
    }

    // ──────────────────────────────────────────────────────────── execute

    public static async Task<int> ExecuteAsync(this DbConnection conn, string sql, object? param = null)
    {
        await using var cmd = await CreateCommandAsync(conn, sql, param);
        return await cmd.ExecuteNonQueryAsync();
    }

    public static async Task<T?> ExecuteScalarAsync<T>(this DbConnection conn, string sql, object? param = null)
    {
        await using var cmd = await CreateCommandAsync(conn, sql, param);
        var result = await cmd.ExecuteScalarAsync();
        return ConvertValue<T>(result);
    }

    // ──────────────────────────────────────────────────────────── query (single-type)

    public static async Task<IEnumerable<T>> QueryAsync<T>(this DbConnection conn, string sql, object? param = null)
    {
        await using var cmd = await CreateCommandAsync(conn, sql, param);
        await using var reader = await cmd.ExecuteReaderAsync();

        var list = new List<T>();
        while (await reader.ReadAsync())
            list.Add(ReadRow<T>(reader)!);
        return list;
    }

    /// <summary>Non-generic overload — returns one <see cref="ExpandoObject"/> per row (dynamic).</summary>
    public static async Task<IEnumerable<dynamic>> QueryAsync(this DbConnection conn, string sql, object? param = null)
    {
        await using var cmd = await CreateCommandAsync(conn, sql, param);
        await using var reader = await cmd.ExecuteReaderAsync();

        var list = new List<dynamic>();
        while (await reader.ReadAsync())
            list.Add(MapDynamic(reader));
        return list;
    }

    public static async Task<T?> QueryFirstOrDefaultAsync<T>(this DbConnection conn, string sql, object? param = null)
    {
        await using var cmd = await CreateCommandAsync(conn, sql, param);
        await using var reader = await cmd.ExecuteReaderAsync();

        if (await reader.ReadAsync())
            return ReadRow<T>(reader);
        return default;
    }

    public static async Task<T> QueryFirstAsync<T>(this DbConnection conn, string sql, object? param = null)
    {
        await using var cmd = await CreateCommandAsync(conn, sql, param);
        await using var reader = await cmd.ExecuteReaderAsync();

        if (await reader.ReadAsync())
            return ReadRow<T>(reader)!;
        throw new InvalidOperationException("Sequence contains no elements.");
    }

    public static async Task<T> QuerySingleAsync<T>(this DbConnection conn, string sql, object? param = null)
    {
        await using var cmd = await CreateCommandAsync(conn, sql, param);
        await using var reader = await cmd.ExecuteReaderAsync();

        if (!await reader.ReadAsync())
            throw new InvalidOperationException("Sequence contains no elements.");
        return ReadRow<T>(reader)!;
    }

    // ──────────────────────────────────────────────────────────── query (multi-map)

    public static async Task<IEnumerable<TReturn>> QueryAsync<T1, T2, TReturn>(
        this DbConnection conn, string sql, Func<T1, T2, TReturn> map,
        object? param = null, string splitOn = "Id")
    {
        await using var cmd = await CreateCommandAsync(conn, sql, param);
        await using var reader = await cmd.ExecuteReaderAsync();

        var bounds = ComputeSegments(reader, splitOn, typeCount: 2);
        var list = new List<TReturn>();
        while (await reader.ReadAsync())
        {
            var a = (T1)MapSegment(reader, bounds[0], bounds[1], typeof(T1), nullIfAllNull: false)!;
            var b = (T2?)MapSegment(reader, bounds[1], bounds[2], typeof(T2), nullIfAllNull: true);
            list.Add(map(a, b!));
        }
        return list;
    }

    public static async Task<IEnumerable<TReturn>> QueryAsync<T1, T2, T3, TReturn>(
        this DbConnection conn, string sql, Func<T1, T2, T3, TReturn> map,
        object? param = null, string splitOn = "Id")
    {
        await using var cmd = await CreateCommandAsync(conn, sql, param);
        await using var reader = await cmd.ExecuteReaderAsync();

        var bounds = ComputeSegments(reader, splitOn, typeCount: 3);
        var list = new List<TReturn>();
        while (await reader.ReadAsync())
        {
            var a = (T1)MapSegment(reader, bounds[0], bounds[1], typeof(T1), nullIfAllNull: false)!;
            var b = (T2?)MapSegment(reader, bounds[1], bounds[2], typeof(T2), nullIfAllNull: true);
            var c = (T3?)MapSegment(reader, bounds[2], bounds[3], typeof(T3), nullIfAllNull: true);
            list.Add(map(a, b!, c!));
        }
        return list;
    }

    // ──────────────────────────────────────────────────────────── mapping internals

    /// <summary>Reads the current row into T (simple scalar, dynamic, or class).</summary>
    private static T? ReadRow<T>(DbDataReader reader)
    {
        var t = typeof(T);

        if (t == typeof(object))
            return (T)MapDynamic(reader);

        if (IsSimple(t))
        {
            var raw = reader.IsDBNull(0) ? null : reader.GetValue(0);
            return ConvertValue<T>(raw);
        }

        // ValueTuple, e.g. QueryAsync<(string Key, string Value)> — map columns positionally.
        if (typeof(ITuple).IsAssignableFrom(t))
            return (T)MapTuple(reader, t);

        // Top-level row: a row exists, so always return a (possibly default-valued) instance —
        // matches Dapper. Only split segments collapse an all-NULL group to null.
        return (T?)MapSegment(reader, 0, reader.FieldCount, t, nullIfAllNull: false);
    }

    /// <summary>
    /// Maps reader columns positionally onto a ValueTuple's Item1..ItemN fields
    /// (mirrors Dapper's tuple support). Tuple members are fields, not properties.
    /// </summary>
    private static object MapTuple(DbDataReader reader, Type type)
    {
        var instance = Activator.CreateInstance(type)!; // boxed struct
        // Order by the numeric suffix of ItemN (not lexically — otherwise Item10 sorts before Item2).
        var fields = type.GetFields(BindingFlags.Public | BindingFlags.Instance)
                         .OrderBy(f => int.TryParse(f.Name.AsSpan(4), out var n) ? n : int.MaxValue)
                         .ToArray();
        var count = Math.Min(fields.Length, reader.FieldCount);
        for (var i = 0; i < count; i++)
        {
            var raw = reader.IsDBNull(i) ? null : reader.GetValue(i);
            fields[i].SetValue(instance, ConvertTo(raw, fields[i].FieldType));
        }
        return instance;
    }

    /// <summary>
    /// Maps reader columns in the half-open range [start, end) onto a new instance of
    /// <paramref name="type"/>. When <paramref name="nullIfAllNull"/> is true and every column
    /// in the segment is NULL, returns null — mirroring Dapper's behaviour for LEFT-JOINed
    /// split objects. Top-level rows pass false so an all-NULL aggregate row still yields an object.
    /// </summary>
    private static object? MapSegment(DbDataReader reader, int start, int end, Type type, bool nullIfAllNull)
    {
        var props = PropsFor(type);
        var instance = Activator.CreateInstance(type)!;
        var anyNonNull = false;

        for (var i = start; i < end; i++)
        {
            var isNull = reader.IsDBNull(i);
            if (!isNull) anyNonNull = true;

            if (props.TryGetValue(reader.GetName(i).ToUpperInvariant(), out var prop) && prop.CanWrite)
            {
                var raw = isNull ? null : reader.GetValue(i);
                prop.SetValue(instance, ConvertTo(raw, prop.PropertyType));
            }
        }

        return (nullIfAllNull && !anyNonNull) ? null : instance;
    }

    private static dynamic MapDynamic(DbDataReader reader)
    {
        IDictionary<string, object?> row = new ExpandoObject();
        for (var i = 0; i < reader.FieldCount; i++)
            row[reader.GetName(i)] = reader.IsDBNull(i) ? null : reader.GetValue(i);
        return row;
    }

    /// <summary>Computes start indices for each mapped type given a comma-separated splitOn list.</summary>
    private static int[] ComputeSegments(DbDataReader reader, string splitOn, int typeCount)
    {
        var splits = splitOn.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var bounds = new int[typeCount + 1];
        bounds[0] = 0;

        var prev = 0;
        for (var k = 0; k < typeCount - 1; k++)
        {
            var name = k < splits.Length ? splits[k] : splits[^1];
            var idx = -1;
            for (var i = prev + 1; i < reader.FieldCount; i++)
            {
                if (string.Equals(reader.GetName(i), name, StringComparison.OrdinalIgnoreCase))
                {
                    idx = i;
                    break;
                }
            }
            if (idx < 0) idx = reader.FieldCount;
            bounds[k + 1] = idx;
            prev = idx;
        }

        bounds[typeCount] = reader.FieldCount;
        return bounds;
    }

    private static Dictionary<string, PropertyInfo> PropsFor(Type type) =>
        _propCache.GetOrAdd(type, t =>
        {
            var dict = new Dictionary<string, PropertyInfo>();
            foreach (var p in t.GetProperties(BindingFlags.Public | BindingFlags.Instance))
                if (p.CanWrite)
                    dict[p.Name.ToUpperInvariant()] = p;
            return dict;
        });

    // ──────────────────────────────────────────────────────────── value conversion

    private static bool IsSimple(Type type)
    {
        var u = Nullable.GetUnderlyingType(type) ?? type;
        return u.IsPrimitive
            || u.IsEnum
            || u == typeof(string)
            || u == typeof(decimal)
            || u == typeof(DateTime)
            || u == typeof(DateTimeOffset)
            || u == typeof(TimeSpan)
            || u == typeof(Guid)
            || u == typeof(byte[]);
    }

    private static T? ConvertValue<T>(object? value)
    {
        var converted = ConvertTo(value, typeof(T));
        return converted is null ? default : (T)converted;
    }

    private static object? ConvertTo(object? value, Type target)
    {
        if (value is null || value is DBNull) return null;

        var underlying = Nullable.GetUnderlyingType(target) ?? target;
        var valueType = value.GetType();

        if (underlying.IsAssignableFrom(valueType)) return value;
        if (underlying.IsEnum) return Enum.ToObject(underlying, value);

        if (underlying == typeof(string)) return value.ToString();
        if (underlying == typeof(bool)) return Convert.ToBoolean(value);
        if (underlying == typeof(Guid))
            return value switch { string s => Guid.Parse(s), byte[] b => new Guid(b), _ => value };

        if (underlying == typeof(DateTime) && value is DateTimeOffset dto) return dto.DateTime;
        if (underlying == typeof(DateTimeOffset) && value is DateTime dt) return new DateTimeOffset(dt);

        try { return Convert.ChangeType(value, underlying); }
        catch { return value; }
    }
}
