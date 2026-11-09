using System.Text.Json;
using Lingono.Api.Data;
using Lingono.Api.Dtos;
using Lingono.Api.Models;
using Lingono.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lingono.Api.Controllers;

/// <summary>Everything the admin page needs. Only emails listed in "AdminEmails" can use it.</summary>
[ApiController]
[Authorize(Policy = "Admin")]
[Route("api/admin")]
public class AdminController(AppDbContext db) : ControllerBase
{
    // ---------------- Courses ----------------

    [HttpGet("courses")]
    public async Task<IActionResult> GetCourses() => Ok(await db.Courses
        .OrderBy(c => c.SortOrder).ThenBy(c => c.Name)
        .Select(c => new
        {
            c.Id,
            c.Name,
            c.Level,
            c.Tag,
            c.Description,
            c.SyllabusUrl,
            c.IsLocked,
            c.IsVisible,
            c.SortOrder,
            Weeks = c.Weeks.OrderBy(w => w.Number).Select(w => new
            {
                w.Id,
                w.Number,
                BlockCount = w.Blocks.Count,
                VocabSectionCount = w.VocabSections.Count
            })
        })
        .ToListAsync());

    /// <summary>Changes how a course appears on the home page (and its name everywhere).</summary>
    [HttpPut("courses/{id:int}")]
    public async Task<IActionResult> UpdateCourse(int id, CourseSettingsDto dto)
    {
        var course = await db.Courses.FindAsync(id);
        if (course == null) return NotFound();

        var name = dto.Name.Trim();
        if (name == "") return BadRequest("Course name is required.");
        if (name != course.Name && await db.Courses.AnyAsync(c => c.Name == name))
            return BadRequest("Another course already has this name.");

        await using var transaction = await db.Database.BeginTransactionAsync();

        // Renaming: students of this course follow the new name automatically
        if (name != course.Name)
        {
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE public.\"Students\" SET course = {name} WHERE trim(course) = {course.Name}");
            course.Name = name;
        }

        course.Level = (dto.Level ?? "").Trim();
        course.Tag = (dto.Tag ?? "").Trim();
        course.Description = (dto.Description ?? "").Trim();
        course.SyllabusUrl = string.IsNullOrWhiteSpace(dto.SyllabusUrl) ? null : dto.SyllabusUrl.Trim();
        course.IsLocked = dto.IsLocked;
        course.IsVisible = dto.IsVisible;
        course.SortOrder = dto.SortOrder;

        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return NoContent();
    }

    [HttpPost("courses")]
    public async Task<IActionResult> CreateCourse(NewCourseDto dto)
    {
        var name = dto.Name.Trim();
        if (name == "") return BadRequest("Course name is required.");
        if (await db.Courses.AnyAsync(c => c.Name == name)) return BadRequest("This course already exists.");

        var level = System.Text.RegularExpressions.Regex.Match(name, @"\b(A1|A2|B1|B2|C1|C2)\b").Value;
        var course = new Course
        {
            Name = name,
            Level = level,
            Tag = name.Contains("DELF", StringComparison.OrdinalIgnoreCase) ? "DELF" : "",
            SortOrder = (await db.Courses.MaxAsync(c => (int?)c.SortOrder) ?? 0) + 1,
            IsLocked = true      // new courses start locked until you are ready
        };
        db.Courses.Add(course);
        await db.SaveChangesAsync();
        return Ok(new { course.Id, course.Name });
    }

    [HttpDelete("courses/{id:int}")]
    public async Task<IActionResult> DeleteCourse(int id)
    {
        var deleted = await db.Courses.Where(c => c.Id == id).ExecuteDeleteAsync();
        return deleted == 0 ? NotFound() : NoContent();
    }

    // ---------------- Weeks ----------------

    [HttpPost("courses/{courseId:int}/weeks")]
    public async Task<IActionResult> CreateWeek(int courseId, NewWeekDto dto)
    {
        if (dto.Number < 1) return BadRequest("Week number must be 1 or more.");
        if (!await db.Courses.AnyAsync(c => c.Id == courseId)) return NotFound();
        if (await db.Weeks.AnyAsync(w => w.CourseId == courseId && w.Number == dto.Number))
            return BadRequest($"Week {dto.Number} already exists in this course.");

        var week = new Week { CourseId = courseId, Number = dto.Number };
        db.Weeks.Add(week);
        await db.SaveChangesAsync();
        return Ok(new { week.Id, week.Number });
    }

    [HttpDelete("weeks/{id:int}")]
    public async Task<IActionResult> DeleteWeek(int id)
    {
        var deleted = await db.Weeks.Where(w => w.Id == id).ExecuteDeleteAsync();
        return deleted == 0 ? NotFound() : NoContent();
    }

    /// <summary>One week with all its exercise blocks and vocabulary, ready to edit.</summary>
    [HttpGet("weeks/{id:int}")]
    public async Task<IActionResult> GetWeek(int id)
    {
        var week = await db.Weeks
            .Include(w => w.Course)
            .Include(w => w.Blocks).ThenInclude(b => b.Questions)
            .Include(w => w.VocabSections).ThenInclude(s => s.Words)
            .AsSplitQuery()
            .FirstOrDefaultAsync(w => w.Id == id);
        if (week == null) return NotFound();

        return Ok(new
        {
            week.Id,
            week.Number,
            CourseName = week.Course!.Name,
            Blocks = week.Blocks.OrderBy(b => b.Order).Select(b => new BlockDto(
                b.Instruction, b.Type, b.TextFile, b.Video, b.Audio,
                b.Questions.OrderBy(q => q.Order).Select(q => new QuestionDto(q.Type, q.Text, q.Options, q.Answer, q.Audio)).ToList())),
            VocabSections = week.VocabSections.OrderBy(s => s.Order).Select(s => new SectionDto(
                s.Instruction,
                s.Words.OrderBy(x => x.Order).Select(x => new WordDto(x.French, x.Georgian)).ToList()))
        });
    }

    /// <summary>Saves ALL exercise blocks of a week at once (replaces the old ones).</summary>
    [HttpPut("weeks/{id:int}/blocks")]
    public async Task<IActionResult> SaveBlocks(int id, List<BlockDto> blocks)
    {
        if (!await db.Weeks.AnyAsync(w => w.Id == id)) return NotFound();

        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.ExerciseBlocks.Where(b => b.WeekId == id).ExecuteDeleteAsync();

        db.ExerciseBlocks.AddRange(blocks.Select((b, i) => new ExerciseBlock
        {
            WeekId = id,
            Order = i + 1,
            Instruction = b.Instruction.Trim(),
            Type = Clean(b.Type),
            TextFile = Clean(b.TextFile),
            Video = Clean(b.Video),
            Audio = Clean(b.Audio),
            Questions = (b.Questions ?? []).Select((q, j) => new Question
            {
                Order = j + 1,
                Type = Clean(q.Type),
                Text = q.Text.Trim(),
                Answer = q.Answer?.Trim() ?? "",
                Audio = Clean(q.Audio),
                Options = q.Type == "mc"
                    ? (q.Options ?? []).Select(o => o.Trim()).Where(o => o != "").ToList()
                    : null
            }).ToList()
        }));

        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return NoContent();
    }

    /// <summary>Saves ALL vocabulary sections of a week at once (replaces the old ones).</summary>
    [HttpPut("weeks/{id:int}/vocab")]
    public async Task<IActionResult> SaveVocab(int id, List<SectionDto> sections)
    {
        if (!await db.Weeks.AnyAsync(w => w.Id == id)) return NotFound();

        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.VocabSections.Where(s => s.WeekId == id).ExecuteDeleteAsync();

        db.VocabSections.AddRange(sections.Select((s, i) => new VocabSection
        {
            WeekId = id,
            Order = i + 1,
            Instruction = s.Instruction.Trim(),
            Words = s.Words
                .Where(x => x.French.Trim() != "" || x.Georgian.Trim() != "")
                .Select((x, j) => new VocabWord { Order = j + 1, French = x.French.Trim(), Georgian = x.Georgian.Trim() })
                .ToList()
        }));

        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return NoContent();
    }

    // ---------------- Lesson recordings (per course AND group) ----------------

    /// <summary>All recording links of a course, for every group.</summary>
    [HttpGet("courses/{courseId:int}/recordings")]
    public async Task<IActionResult> GetRecordings(int courseId) => Ok(await db.Recordings
        .Where(r => r.CourseId == courseId)
        .OrderBy(r => r.GroupNumber).ThenBy(r => r.WeekNumber).ThenBy(r => r.LessonNumber)
        .Select(r => new RecordingDto(r.GroupNumber, r.WeekNumber, r.LessonNumber, r.Url))
        .ToListAsync());

    /// <summary>Saves ALL links of one group of a course at once (replaces the old ones).</summary>
    [HttpPut("courses/{courseId:int}/recordings/{group:int}")]
    public async Task<IActionResult> SaveRecordings(int courseId, int group, List<RecordingLinkDto> links)
    {
        if (group < 1) return BadRequest("Group number must be 1 or more.");
        if (!await db.Courses.AnyAsync(c => c.Id == courseId)) return NotFound();

        var clean = links
            .Where(l => l.Week >= 1 && (l.Lesson == 1 || l.Lesson == 2) && !string.IsNullOrWhiteSpace(l.Url))
            .GroupBy(l => new { l.Week, l.Lesson })          // ignore accidental duplicates
            .Select(g => g.Last())
            .ToList();

        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.Recordings.Where(r => r.CourseId == courseId && r.GroupNumber == group).ExecuteDeleteAsync();

        db.Recordings.AddRange(clean.Select(l => new Recording
        {
            CourseId = courseId,
            GroupNumber = group,
            WeekNumber = l.Week,
            LessonNumber = l.Lesson,
            Url = l.Url.Trim()
        }));

        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return NoContent();
    }

    /// <summary>One-time import of the old links from recordings.js. They all become group 1.</summary>
    [HttpPost("recordings/import")]
    public async Task<IActionResult> ImportRecordings([FromBody] JsonElement data)
    {
        if (await db.Recordings.AnyAsync())
            return BadRequest("Recordings already exist. Import only works when there are none.");
        if (data.ValueKind != JsonValueKind.Object) return BadRequest("Nothing to import.");

        var courses = await db.Courses.ToListAsync();
        var count = 0;

        foreach (var c in data.EnumerateObject())
        {
            var course = courses.FirstOrDefault(x => x.Name == c.Name.Trim());
            if (course == null)
            {
                course = new Course { Name = c.Name.Trim() };
                db.Courses.Add(course);
                courses.Add(course);
            }

            foreach (var w in c.Value.EnumerateObject())
            foreach (var l in w.Value.EnumerateObject())
            {
                var url = l.Value.ValueKind == JsonValueKind.String ? l.Value.GetString()?.Trim() : null;
                if (string.IsNullOrEmpty(url)) continue;

                course.Recordings.Add(new Recording
                {
                    GroupNumber = 1,
                    WeekNumber = int.Parse(new string(w.Name.Where(char.IsDigit).ToArray())),
                    LessonNumber = int.Parse(new string(l.Name.Where(char.IsDigit).ToArray())),
                    Url = url
                });
                count++;
            }
        }

        await db.SaveChangesAsync();
        return Ok(new { Links = count });
    }

    // ---------------- One-time import of the old hardcoded data ----------------

    public record ImportDto(JsonElement Exercises, JsonElement Vocab);

    [HttpPost("import")]
    [RequestSizeLimit(50_000_000)]
    public async Task<IActionResult> Import(ImportDto dto)
    {
        if (await db.Courses.AnyAsync())
            return BadRequest("The database already has courses. Import only works on an empty database.");

        var courses = ContentShape.Import(dto.Exercises, dto.Vocab);
        db.Courses.AddRange(courses);
        await db.SaveChangesAsync();

        return Ok(new
        {
            Courses = courses.Count,
            Weeks = courses.Sum(c => c.Weeks.Count),
            Questions = courses.Sum(c => c.Weeks.Sum(w => w.Blocks.Sum(b => b.Questions.Count))),
            Words = courses.Sum(c => c.Weeks.Sum(w => w.VocabSections.Sum(s => s.Words.Count)))
        });
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
