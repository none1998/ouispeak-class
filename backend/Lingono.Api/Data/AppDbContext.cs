using Lingono.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Lingono.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public const string Schema = "content";

    public DbSet<Course> Courses => Set<Course>();
    public DbSet<Week> Weeks => Set<Week>();
    public DbSet<ExerciseBlock> ExerciseBlocks => Set<ExerciseBlock>();
    public DbSet<Question> Questions => Set<Question>();
    public DbSet<VocabSection> VocabSections => Set<VocabSection>();
    public DbSet<VocabWord> VocabWords => Set<VocabWord>();
    public DbSet<Recording> Recordings => Set<Recording>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        // Keeps these tables out of Supabase's public API: only this C# server can read them.
        b.HasDefaultSchema(Schema);

        b.Entity<Course>().HasIndex(c => c.Name).IsUnique();
        b.Entity<Week>().HasIndex(w => new { w.CourseId, w.Number }).IsUnique();
        b.Entity<Recording>()
            .HasIndex(r => new { r.CourseId, r.GroupNumber, r.WeekNumber, r.LessonNumber })
            .IsUnique();
    }
}
