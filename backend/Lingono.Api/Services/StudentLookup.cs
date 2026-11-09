using Lingono.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Lingono.Api.Services;

/// <summary>Reads the logged-in student from your EXISTING Supabase "Students" table.</summary>
public static class StudentLookup
{
    public class StudentRow
    {
        public string? Course { get; set; }
        public bool? IsActive { get; set; }
        public int? GroupNumber { get; set; }
    }

    public static async Task<StudentRow?> FindByAuthIdAsync(AppDbContext db, string authId) =>
        (await db.Database
            .SqlQuery<StudentRow>($"SELECT course AS \"Course\", is_active AS \"IsActive\", group_number AS \"GroupNumber\" FROM public.\"Students\" WHERE auth_id::text = {authId} LIMIT 1")
            .ToListAsync())
        .FirstOrDefault();
}
