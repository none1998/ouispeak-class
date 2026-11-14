using System.Security.Claims;
using Lingono.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lingono.Api.Controllers;

/// <summary>
/// Homework sent by email. The student page calls "sent" after the email goes out;
/// the admin page shows one tick per student and week (sending again only adds to the count).
/// The first time a week is sent, the student also gets +1 point in Scores.homework.
/// Table: content."HomeworkSubmissions" (sql/7_homework_submissions.sql).
/// </summary>
[ApiController]
public class HomeworkController(AppDbContext db) : ControllerBase
{
    public record SentDto(int Week);
    public record MarkDto(bool Done, string? Course);
    public record StudentRow(string Id, string Course);
    public record SubmissionRow(string StudentId, string Course, int Week, int Count, DateTime FirstSentAt, DateTime LastSentAt, bool Manual);

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

        await using var tx = await db.Database.BeginTransactionAsync();

        // "IsNew" is true only the first time this student sends this week
        var isNew = (await db.Database.SqlQuery<bool>($"""
            INSERT INTO content."HomeworkSubmissions" ("StudentId", "Course", "Week", "Count", "FirstSentAt", "LastSentAt", "Manual")
            VALUES ({student.Id}, {student.Course}, {dto.Week}, 1, now(), now(), false)
            ON CONFLICT ("StudentId", "Course", "Week") DO UPDATE
                SET "Count" = content."HomeworkSubmissions"."Count" + 1, "LastSentAt" = now()
            RETURNING (xmax = 0) AS "Value"
            """).ToListAsync()).FirstOrDefault();

        if (isNew)
        {
            // +1 point in the Homework score (creates the scores row if the student has none yet)
            var updated = await db.Database.ExecuteSqlAsync($"""
                UPDATE public."Scores" SET homework = COALESCE(homework, 0) + 1
                WHERE student_id::text = {student.Id}
                """);
            if (updated == 0)
                await db.Database.ExecuteSqlAsync($"""
                    INSERT INTO public."Scores" (student_id, homework, "Name")
                    SELECT s.id, 1, trim(COALESCE(s."firstName", '') || ' ' || COALESCE(s."lastName", ''))
                    FROM public."Students" s WHERE s.id::text = {student.Id}
                    """);
        }

        await tx.CommitAsync();
        return Ok(new { Saved = true, PointAdded = isNew });
    }

    // ---------- Admin: all ticks ----------
    [Authorize(Policy = "Admin")]
    [HttpGet("api/admin/homework")]
    public async Task<IActionResult> All() =>
        Ok(await db.Database.SqlQuery<SubmissionRow>($"""
            SELECT "StudentId", "Course", "Week", "Count", "FirstSentAt", "LastSentAt", "Manual"
            FROM content."HomeworkSubmissions"
            """).ToListAsync());

    // ---------- Admin: tick or untick by hand ----------
    [Authorize(Policy = "Admin")]
    [HttpPut("api/admin/homework/{studentId}/{week:int}")]
    public async Task<IActionResult> Mark(string studentId, int week, MarkDto dto)
    {
        var course = (dto.Course ?? "").Trim();
        if (dto.Done)
            await db.Database.ExecuteSqlAsync($"""
                INSERT INTO content."HomeworkSubmissions" ("StudentId", "Course", "Week", "Count", "Manual")
                VALUES ({studentId}, {course}, {week}, 0, true)
                ON CONFLICT ("StudentId", "Course", "Week") DO NOTHING
                """);
        else
            await db.Database.ExecuteSqlAsync($"""
                DELETE FROM content."HomeworkSubmissions"
                WHERE "StudentId" = {studentId} AND "Course" = {course} AND "Week" = {week}
                """);
        return Ok(new { Done = dto.Done });
    }
}
