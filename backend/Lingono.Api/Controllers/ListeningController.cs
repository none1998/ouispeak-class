using System.Security.Claims;
using Lingono.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lingono.Api.Controllers;

/// <summary>
/// For students: counts how many times each exercise audio was started.
/// The limit is checked here on the server, so it works on every device and browser.
/// </summary>
[ApiController]
[Authorize]
[Route("api/listening")]
public class ListeningController(AppDbContext db, IConfiguration config) : ControllerBase
{
    public const int DefaultMaxPlays = 2;
    private int MaxPlays => config.GetValue("AudioMaxPlays", DefaultMaxPlays);
    private string AuthId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    public record StartDto(string Key);

    /// <summary>All listening counts of the logged-in student.</summary>
    [HttpGet]
    public async Task<IActionResult> Get() => Ok(new
    {
        Max = MaxPlays,
        Items = await db.AudioPlays
            .Where(p => p.AuthId == AuthId)
            .Select(p => new { p.AudioKey, p.Count })
            .ToListAsync()
    });

    /// <summary>The student starts listening: counted only if the limit is not reached yet.</summary>
    [HttpPost("start")]
    public async Task<IActionResult> Start(StartDto dto)
    {
        var key = (dto.Key ?? "").Trim();
        if (key == "" || key.Length > 500) return BadRequest("Bad audio key.");

        // One atomic statement: create the counter or add 1, but never above the limit
        var counts = await db.Database.SqlQuery<int>($"""
            INSERT INTO content."AudioPlays" ("AuthId", "AudioKey", "Count", "UpdatedAt")
            VALUES ({AuthId}, {key}, 1, now())
            ON CONFLICT ("AuthId", "AudioKey") DO UPDATE
                SET "Count" = content."AudioPlays"."Count" + 1, "UpdatedAt" = now()
                WHERE content."AudioPlays"."Count" < {MaxPlays}
            RETURNING "Count" AS "Value"
            """).ToListAsync();

        if (counts.Count == 0)
            return Ok(new { Allowed = false, Count = MaxPlays, Max = MaxPlays });
        return Ok(new { Allowed = true, Count = counts[0], Max = MaxPlays });
    }
}
