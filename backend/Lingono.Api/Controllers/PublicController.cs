using Lingono.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lingono.Api.Controllers;

/// <summary>Information anyone can see, even without logging in (the home page course cards).</summary>
[ApiController]
[Route("api/public")]
public class PublicController(AppDbContext db) : ControllerBase
{
    [HttpGet("courses")]
    public async Task<IActionResult> Courses() => Ok(await db.Courses
        .Where(c => c.IsVisible)
        .OrderBy(c => c.SortOrder).ThenBy(c => c.Name)
        .Select(c => new { c.Name, c.Level, c.Tag, c.Description, c.SyllabusUrl, c.IsLocked })
        .ToListAsync());
}
