using System.Text.Json;
using System.Text.Json.Nodes;
using Lingono.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace Lingono.Api.Controllers;

/// <summary>
/// Admin: manage your EXISTING Supabase tables public."Students" and public."Scores".
/// These tables were created in Supabase, so instead of guessing their column types,
/// the queries let PostgreSQL convert the values itself (jsonb_populate_record).
/// </summary>
[ApiController]
[Authorize(Policy = "Admin")]
[Route("api/admin")]
public class StudentsController(AppDbContext db) : ControllerBase
{
    // Only these columns can be read/written from the admin page
    private static readonly string[] StudentColumns =
        ["id", "firstName", "lastName", "email", "birthday", "auth_id", "course", "is_active", "group_number"];
    private static readonly string[] ScoreColumns =
        ["homework", "vocab1", "vocab2", "writing", "speaking", "Name"];

    // ---------------- Students ----------------

    [HttpGet("students")]
    public async Task<IActionResult> GetStudents() => JsonText(await QueryText(
        "SELECT coalesce(json_agg(row_to_json(s) ORDER BY s.\"lastName\", s.\"firstName\"), '[]'::json)::text FROM public.\"Students\" s"));

    [HttpPost("students")]
    public async Task<IActionResult> CreateStudent(JsonElement body)
    {
        var (json, columns) = Clean(body, StudentColumns);
        if (!columns.Contains("id")) return BadRequest("Student ID is required.");
        if (!columns.Contains("email")) return BadRequest("Email is required.");

        try
        {
            var row = await QueryText(
                $"INSERT INTO public.\"Students\" AS s ({ColumnList(columns)}) " +
                $"SELECT {ColumnList(columns, "r.")} FROM jsonb_populate_record(null::public.\"Students\", @json::jsonb) r " +
                "RETURNING row_to_json(s)::text",
                ("json", json));
            return JsonText(row);
        }
        catch (Npgsql.PostgresException e) { return BadRequest(Friendly(e)); }
    }

    [HttpPut("students/{id}")]
    public async Task<IActionResult> UpdateStudent(string id, JsonElement body)
    {
        var (json, columns) = Clean(body, StudentColumns);
        if (columns.Count == 0) return BadRequest("Nothing to save.");

        try
        {
            var row = await QueryText(
                $"UPDATE public.\"Students\" s SET {AssignList(columns)} " +
                "FROM jsonb_populate_record(null::public.\"Students\", @json::jsonb) r " +
                "WHERE s.id::text = @id RETURNING row_to_json(s)::text",
                ("json", json), ("id", id));
            return row == null ? NotFound() : JsonText(row);
        }
        catch (Npgsql.PostgresException e) { return BadRequest(Friendly(e)); }
    }

    [HttpDelete("students/{id}")]
    public async Task<IActionResult> DeleteStudent(string id)
    {
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM public.\"Scores\" WHERE student_id::text = {id}");
        var deleted = await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM public.\"Students\" WHERE id::text = {id}");
        await transaction.CommitAsync();
        return deleted == 0 ? NotFound() : NoContent();
    }

    // ---------------- Scores ----------------

    [HttpGet("scores")]
    public async Task<IActionResult> GetScores() => JsonText(await QueryText(
        "SELECT coalesce(json_agg(row_to_json(s)), '[]'::json)::text FROM public.\"Scores\" s"));

    /// <summary>Saves the scores of one student (creates the row the first time).</summary>
    [HttpPut("scores/{studentId}")]
    public async Task<IActionResult> SaveScores(string studentId, JsonElement body)
    {
        var (json, columns) = Clean(body, ScoreColumns);
        if (columns.Count == 0) return BadRequest("Nothing to save.");

        try
        {
            var row = await QueryText(
                $"UPDATE public.\"Scores\" s SET {AssignList(columns)} " +
                "FROM jsonb_populate_record(null::public.\"Scores\", @json::jsonb) r " +
                "WHERE s.student_id::text = @id RETURNING row_to_json(s)::text",
                ("json", json), ("id", studentId));

            if (row == null)
            {
                // First evaluation of this student: create the row (student_id gets the same type as in Students)
                var node = JsonNode.Parse(json)!.AsObject();
                node["student_id"] = studentId;
                var insertColumns = columns.Append("student_id").ToList();
                row = await QueryText(
                    $"INSERT INTO public.\"Scores\" AS s ({ColumnList(insertColumns)}) " +
                    $"SELECT {ColumnList(insertColumns, "r.")} FROM jsonb_populate_record(null::public.\"Scores\", @json::jsonb) r " +
                    "RETURNING row_to_json(s)::text",
                    ("json", node.ToJsonString()));
            }
            return JsonText(row);
        }
        catch (Npgsql.PostgresException e) { return BadRequest(Friendly(e)); }
    }

    // ---------------- Helpers ----------------

    private ContentResult JsonText(string? json) => Content(json ?? "null", "application/json");

    /// <summary>Keeps only allowed columns; empty text becomes null (e.g. an empty birthday).</summary>
    private static (string Json, List<string> Columns) Clean(JsonElement body, string[] allowed)
    {
        var result = new JsonObject();
        var columns = new List<string>();
        if (body.ValueKind != JsonValueKind.Object) return ("{}", columns);

        foreach (var column in allowed)
        {
            if (!body.TryGetProperty(column, out var value)) continue;
            columns.Add(column);
            result[column] = value.ValueKind == JsonValueKind.String && string.IsNullOrWhiteSpace(value.GetString())
                ? null
                : JsonNode.Parse(value.GetRawText());
        }
        return (result.ToJsonString(), columns);
    }

    private static string ColumnList(IEnumerable<string> columns, string prefix = "") =>
        string.Join(", ", columns.Select(c => $"{prefix}\"{c}\""));

    private static string AssignList(IEnumerable<string> columns) =>
        string.Join(", ", columns.Select(c => $"\"{c}\" = r.\"{c}\""));

    private static string Friendly(Npgsql.PostgresException e) => e.SqlState switch
    {
        "23505" => "This ID or email already exists.",
        "22P02" or "22007" or "22008" => "A value has the wrong format (check the birthday: YYYY-MM-DD, and the numbers).",
        _ => e.MessageText
    };

    private async Task<string?> QueryText(string sql, params (string Name, object Value)[] parameters)
    {
        await db.Database.OpenConnectionAsync();
        try
        {
            await using var command = db.Database.GetDbConnection().CreateCommand();
            command.CommandText = sql;
            command.Transaction = db.Database.CurrentTransaction?.GetDbTransaction();
            foreach (var (name, value) in parameters)
            {
                var p = command.CreateParameter();
                p.ParameterName = name;
                p.Value = value;
                command.Parameters.Add(p);
            }
            var result = await command.ExecuteScalarAsync();
            return result is null or DBNull ? null : result.ToString();
        }
        finally
        {
            await db.Database.CloseConnectionAsync();
        }
    }
}
