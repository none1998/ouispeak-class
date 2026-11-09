using System.Security.Claims;
using Lingono.Api.Data;
using Lingono.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lingono.Api.Controllers;

/// <summary>For students: returns ONLY the content of the course (and group) they belong to.</summary>
[ApiController]
[Authorize]
[Route("api/content")]
public class ContentController(AppDbContext db) : ControllerBase
{
    [HttpGet("exercises")]
    public async Task<IActionResult> Exercises()
    {
        var student = await CurrentStudentAsync();
        if (student == null) return Forbid();

        var course = await db.Courses
            .Include(c => c.Weeks).ThenInclude(w => w.Blocks).ThenInclude(b => b.Questions)
            .AsSplitQuery()
            .FirstOrDefaultAsync(c => c.Name == student.Course);

        return Ok(course == null ? new Dictionary<string, object>() : ContentShape.Exercises(course));
    }

    [HttpGet("vocab")]
    public async Task<IActionResult> Vocab()
    {
        var student = await CurrentStudentAsync();
        if (student == null) return Forbid();

        var course = await db.Courses
            .Include(c => c.Weeks).ThenInclude(w => w.VocabSections).ThenInclude(s => s.Words)
            .AsSplitQuery()
            .FirstOrDefaultAsync(c => c.Name == student.Course);

        return Ok(course == null ? new Dictionary<string, object>() : ContentShape.Vocab(course));
    }

    /// <summary>
    /// Lesson recordings of the student's course AND group, in the shape recordings.js expects:
    /// { "week_1": { "lesson_1": "https://...", "lesson_2": "https://..." }, ... }
    /// </summary>
    [HttpGet("recordings")]
    public async Task<IActionResult> Recordings()
    {
        var student = await CurrentStudentAsync();
        if (student == null) return Forbid();
        var group = student.GroupNumber ?? 1;

        var rows = await db.Recordings
            .Where(r => r.Course!.Name == student.Course && r.GroupNumber == group)
            .ToListAsync();

        return Ok(rows
            .GroupBy(r => r.WeekNumber)
            .OrderBy(g => g.Key)
            .ToDictionary(
                g => $"week_{g.Key}",
                g => g.ToDictionary(r => $"lesson_{r.LessonNumber}", r => r.Url)));
    }

    private async Task<StudentLookup.StudentRow?> CurrentStudentAsync()
    {
        var authId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var student = await StudentLookup.FindByAuthIdAsync(db, authId);
        if (student == null || student.IsActive == false || string.IsNullOrWhiteSpace(student.Course)) return null;
        student.Course = student.Course.Trim();
        return student;
    }
}
