using System.Security.Claims;
using Lingono.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Lingono.Api.Services;

namespace Lingono.Api.Controllers;

/// <summary>
/// Homework sent by email.
/// - The student page calls "sent" after the email goes out: the week is saved as WAITING (no tick, no point yet).
/// - Every day at 13:05 (HomeworkDailyJob), waiting weeks become ticked and each gives +1 point in Scores.homework.
/// - A week already sent (waiting or ticked) never gives a second point.
/// Table: content."HomeworkSubmissions" (sql/7 and sql/8).
/// </summary>
[ApiController]
public class HomeworkController(AppDbContext db) : ControllerBase
{
    public record SentDto(int Week);
    public record MarkDto(bool Done, string? Course);
    public record StudentRow(string Id, string Course);
    public record SubmissionRow(string StudentId, string Course, int Week, int Count, DateTime FirstSentAt, DateTime LastSentAt, bool Manual, DateTime? ConfirmedAt);

    // ---------- Student: "I sent the homework of week N" ----------
    [Authorize]
    [HttpPost("api/homework/sent")]
    public async Task<IActionResult> Sent(SentDto dto)
    {
        if (dto.Week < 1 || dto.Week > 200) return BadRequest("Bad week.");
        var authId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(authId)) return Unauthorized();

        var student = (await db.Database.SqlQuery<StudentRow>($"""
            SELECT id::text AS "Id", COALESCE(trim(course), '') AS "Course"
            FROM public."Students" WHERE auth_id::text = {authId} LIMIT 1
            """).ToListAsync()).FirstOrDefault();
        if (student == null) return NotFound("Student not found.");

        // new week → saved as waiting (ConfirmedAt empty); already sent → only the counter goes up
        var isNew = (await db.Database.SqlQuery<bool>($"""
            INSERT INTO content."HomeworkSubmissions" ("StudentId", "Course", "Week", "Count", "FirstSentAt", "LastSentAt", "Manual", "ConfirmedAt")
            VALUES ({student.Id}, {student.Course}, {dto.Week}, 1, now(), now(), false, NULL)
            ON CONFLICT ("StudentId", "Course", "Week") DO UPDATE
                SET "Count" = content."HomeworkSubmissions"."Count" + 1, "LastSentAt" = now()
            RETURNING (xmax = 0) AS "Value"
            """).ToListAsync()).FirstOrDefault();

        return Ok(new { Saved = true, Waiting = isNew });
    }

    // ---------- Admin: all weeks (ticked and waiting) ----------
    [Authorize(Policy = "Admin")]
    [HttpGet("api/admin/homework")]
    public async Task<IActionResult> All() =>
        Ok(await db.Database.SqlQuery<SubmissionRow>($"""
            SELECT "StudentId", "Course", "Week", "Count", "FirstSentAt", "LastSentAt", "Manual", "ConfirmedAt"
            FROM content."HomeworkSubmissions"
            """).ToListAsync());

    // ---------- Admin: tick (no point) or untick by hand ----------
    [Authorize(Policy = "Admin")]
    [HttpPut("api/admin/homework/{studentId}/{week:int}")]
    public async Task<IActionResult> Mark(string studentId, int week, MarkDto dto)
    {
        var course = (dto.Course ?? "").Trim();
        if (dto.Done)
            await db.Database.ExecuteSqlAsync($"""
                INSERT INTO content."HomeworkSubmissions" ("StudentId", "Course", "Week", "Count", "Manual", "ConfirmedAt")
                VALUES ({studentId}, {course}, {week}, 0, true, now())
                ON CONFLICT ("StudentId", "Course", "Week") DO UPDATE
                    SET "ConfirmedAt" = COALESCE(content."HomeworkSubmissions"."ConfirmedAt", now()), "Manual" = true
                """);
        else
            await db.Database.ExecuteSqlAsync($"""
                DELETE FROM content."HomeworkSubmissions"
                WHERE "StudentId" = {studentId} AND "Course" = {course} AND "Week" = {week}
                """);
        return Ok(new { Done = dto.Done });
    }

    // ---------- Admin: confirm waiting homework right now (same as the 13:05 run) ----------
    [Authorize(Policy = "Admin")]
    [HttpPost("api/admin/homework/confirm-now")]
    public async Task<IActionResult> ConfirmNow() =>
        Ok(new { Confirmed = await HomeworkDailyJob.ConfirmWaiting(db, DateTime.UtcNow) });
}
