using System.Security.Claims;
using Lingono.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lingono.Api.Controllers;

/// <summary>
/// Vocabulary game "Bataille de Territoire" (vocab.html).
/// Winning on EXPERT level gives +0.5 point in public."Scores".vocab2 — only ONCE per week.
/// Winning the same week again only counts the win (no new point).
/// Table: content."VocabGameWins" (sql/9_vocab_game_expert.sql).
/// </summary>
[ApiController]
[Authorize]
public class VocabGameController(AppDbContext db) : ControllerBase
{
    private const decimal PointsPerWeek = 0.5m;
    private const decimal Vocab2Max = 13m;

    public record WinDto(int Week);
    public record StudentRow(string Id, string Course);

    private async Task<StudentRow?> CurrentStudent()
    {
        var authId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(authId)) return null;
        return (await db.Database.SqlQuery<StudentRow>($"""
            SELECT id::text AS "Id", COALESCE(trim(course), '') AS "Course"
            FROM public."Students" WHERE auth_id::text = {authId} LIMIT 1
            """).ToListAsync()).FirstOrDefault();
    }

    // Weeks for which the student already got the expert point (current course)
    [HttpGet("api/vocab-game/expert-wins")]
    public async Task<IActionResult> Wins()
    {
        var student = await CurrentStudent();
        if (student == null) return Ok(new { Weeks = Array.Empty<int>() });
        var weeks = await db.Database.SqlQuery<int>($"""
            SELECT "Week" AS "Value" FROM content."VocabGameWins"
            WHERE "StudentId" = {student.Id} AND "Course" = {student.Course}
            """).ToListAsync();
        return Ok(new { Weeks = weeks });
    }

    // Called by the game when the student wins on expert level
    [HttpPost("api/vocab-game/expert-win")]
    public async Task<IActionResult> ExpertWin(WinDto dto)
    {
        if (dto.Week < 1 || dto.Week > 200) return BadRequest("Bad week.");
        var student = await CurrentStudent();
        if (student == null) return NotFound("Student not found.");

        // one statement: save the win; only a NEW week adds 0.5 to Scores.vocab2 (creates the Scores row if missing)
        var added = (await db.Database.SqlQuery<bool>($"""
            WITH win AS (
                INSERT INTO content."VocabGameWins" ("StudentId", "Course", "Week", "Wins", "FirstWonAt", "LastWonAt")
                VALUES ({student.Id}, {student.Course}, {dto.Week}, 1, now(), now())
                ON CONFLICT ("StudentId", "Course", "Week") DO UPDATE
                    SET "Wins" = content."VocabGameWins"."Wins" + 1, "LastWonAt" = now()
                RETURNING (xmax = 0) AS is_new
            ),
            upd AS (
                UPDATE public."Scores" sc
                SET vocab2 = LEAST(COALESCE(sc.vocab2, 0) + {PointsPerWeek}, {Vocab2Max})
                WHERE sc.student_id::text = {student.Id} AND (SELECT is_new FROM win)
                RETURNING 1
            ),
            ins AS (
                INSERT INTO public."Scores" (student_id, vocab2, "Name")
                SELECT s.id, {PointsPerWeek}, trim(COALESCE(s."firstName", '') || ' ' || COALESCE(s."lastName", ''))
                FROM public."Students" s
                WHERE s.id::text = {student.Id} AND (SELECT is_new FROM win)
                  AND NOT EXISTS (SELECT 1 FROM upd)
                  AND NOT EXISTS (SELECT 1 FROM public."Scores" x WHERE x.student_id::text = {student.Id})
                RETURNING 1
            )
            SELECT (SELECT is_new FROM win) AS "Value"
            """).ToListAsync()).FirstOrDefault();

        return Ok(new { Added = added, Points = added ? PointsPerWeek : 0m });
    }
}
