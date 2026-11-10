using Lingono.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lingono.Api.Controllers;

/// <summary>
/// Admin: moving the old files (texts/…, videos/…, audios/…, images/… inside the website folder)
/// to Supabase Storage. The admin page uploads the files; this controller finds where they are
/// used and replaces the old paths with the new addresses everywhere.
/// </summary>
[ApiController]
[Authorize(Policy = "Admin")]
[Route("api/admin/files")]
public class AdminFilesController(AppDbContext db) : ControllerBase
{
    public record Replacement(string From, string To);
    public record ReplaceDto(List<Replacement> Replacements);

    private static bool IsLocalPath(string? value) =>
        !string.IsNullOrWhiteSpace(value) &&
        !value.Trim().StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
        !value.Trim().StartsWith("https://", StringComparison.OrdinalIgnoreCase) &&
        !value.Trim().StartsWith("data:", StringComparison.OrdinalIgnoreCase);

    private static IEnumerable<string> Lines(string? value) =>
        (value ?? "").Split('\n').Select(l => l.Trim()).Where(l => l != "");

    /// <summary>Every file path of the exercises that still points to the website folder.</summary>
    [HttpGet("local")]
    public async Task<IActionResult> Local()
    {
        var found = new Dictionary<string, (string Kind, int Uses)>();
        void Add(string? path, string kind)
        {
            if (!IsLocalPath(path)) return;
            var p = path!.Trim();
            found[p] = found.TryGetValue(p, out var f) ? (f.Kind, f.Uses + 1) : (kind, 1);
        }

        var blocks = await db.ExerciseBlocks
            .Where(b => b.TextFile != null || b.Video != null || b.Audio != null)
            .Select(b => new { b.TextFile, b.Video, b.Audio })
            .ToListAsync();
        foreach (var b in blocks)
        {
            Add(b.TextFile, "text");
            Add(b.Video, "video");
            foreach (var a in Lines(b.Audio)) Add(a, "audio");
        }

        var questions = await db.Questions
            .Where(q => q.Audio != null || q.Image != null)
            .Select(q => new { q.Audio, q.Image })
            .ToListAsync();
        foreach (var q in questions)
        {
            Add(q.Audio, "audio");
            Add(q.Image, "image");
        }

        return Ok(found.OrderBy(f => f.Value.Kind).ThenBy(f => f.Key)
            .Select(f => new { Path = f.Key, f.Value.Kind, f.Value.Uses }));
    }

    /// <summary>Replaces old paths by their new addresses in all exercises (and keeps the listening counts).</summary>
    [HttpPost("replace")]
    public async Task<IActionResult> Replace(ReplaceDto dto)
    {
        var map = (dto.Replacements ?? [])
            .Where(r => IsLocalPath(r.From) && !string.IsNullOrWhiteSpace(r.To))
            .GroupBy(r => r.From.Trim())
            .ToDictionary(g => g.Key, g => g.Last().To.Trim());
        if (map.Count == 0) return BadRequest("Nothing to replace.");

        string? One(string? value) =>
            value != null && map.TryGetValue(value.Trim(), out var to) ? to : value;
        string? Many(string? value) =>
            value == null ? null : string.Join("\n", value.Split('\n').Select(l => map.TryGetValue(l.Trim(), out var to) ? to : l));

        var changed = 0;
        await using var transaction = await db.Database.BeginTransactionAsync();

        var blocks = await db.ExerciseBlocks
            .Where(b => b.TextFile != null || b.Video != null || b.Audio != null)
            .ToListAsync();
        foreach (var b in blocks)
        {
            var (t, v, a) = (One(b.TextFile), One(b.Video), Many(b.Audio));
            if (t != b.TextFile || v != b.Video || a != b.Audio) changed++;
            b.TextFile = t; b.Video = v; b.Audio = a;
        }

        var questions = await db.Questions.Where(q => q.Audio != null || q.Image != null).ToListAsync();
        foreach (var q in questions)
        {
            var (a, i) = (One(q.Audio), One(q.Image));
            if (a != q.Audio || i != q.Image) changed++;
            q.Audio = a; q.Image = i;
        }

        // Listening counts are stored per audio address: move them to the new address
        var plays = await db.AudioPlays.ToListAsync();
        foreach (var p in plays)
        {
            var cut = p.AudioKey.LastIndexOf('|');
            if (cut < 0) continue;
            var src = p.AudioKey[(cut + 1)..];
            if (map.TryGetValue(src, out var to)) p.AudioKey = p.AudioKey[..(cut + 1)] + to;
        }

        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Ok(new { Changed = changed, Files = map.Count });
    }
}
