using Lingono.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Lingono.Api.Services;

/// <summary>
/// Every day at 13:05 (Europe/Paris by default), homework sent before that time is confirmed:
/// the week gets its tick and the student gets +1 point in public."Scores".homework.
/// Settings (optional, in Render environment variables):
///   Homework__ConfirmTime = 13:05      Homework__TimeZone = Europe/Paris
/// Safe to run many times: each waiting week is confirmed (and gives its point) only once.
/// If the server was asleep at 13:05, it catches up as soon as it wakes.
/// </summary>
public class HomeworkDailyJob(IServiceScopeFactory scopes, IConfiguration config, ILogger<HomeworkDailyJob> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        while (!stop.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var n = await ConfirmWaiting(db, LastCutoffUtc());
                if (n > 0) log.LogInformation("Homework: {Count} week(s) confirmed, points added.", n);
            }
            catch (Exception e) { log.LogWarning(e, "Homework daily job failed, will retry."); }
            await Task.Delay(TimeSpan.FromMinutes(1), stop);
        }
    }

    // The most recent 13:05 that has already passed, in UTC
    private DateTime LastCutoffUtc()
    {
        TimeZoneInfo tz;
        try { tz = TimeZoneInfo.FindSystemTimeZoneById(config["Homework:TimeZone"] ?? "Europe/Paris"); }
        catch { tz = TimeZoneInfo.Utc; }
        var time = TimeSpan.TryParse(config["Homework:ConfirmTime"], out var t) ? t : new TimeSpan(13, 5, 0);
        var nowLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
        var cutoff = nowLocal.Date + time;
        if (nowLocal < cutoff) cutoff = cutoff.AddDays(-1);
        return TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(cutoff, DateTimeKind.Unspecified), tz);
    }

    // Confirms every waiting week sent before "cutoffUtc" and adds the points, in one statement.
    public static async Task<int> ConfirmWaiting(AppDbContext db, DateTime cutoffUtc)
    {
        cutoffUtc = DateTime.SpecifyKind(cutoffUtc, DateTimeKind.Utc);
        var rows = await db.Database.SqlQuery<int>($"""
            WITH done AS (
                UPDATE content."HomeworkSubmissions" SET "ConfirmedAt" = now()
                WHERE "ConfirmedAt" IS NULL AND "FirstSentAt" <= {cutoffUtc}
                RETURNING "StudentId"
            ),
            counts AS (SELECT "StudentId", count(*)::int AS n FROM done GROUP BY "StudentId"),
            upd AS (
                UPDATE public."Scores" sc SET homework = COALESCE(sc.homework, 0) + c.n
                FROM counts c WHERE sc.student_id::text = c."StudentId"
                RETURNING c."StudentId"
            ),
            ins AS (
                INSERT INTO public."Scores" (student_id, homework, "Name")
                SELECT s.id, c.n, trim(COALESCE(s."firstName", '') || ' ' || COALESCE(s."lastName", ''))
                FROM counts c JOIN public."Students" s ON s.id::text = c."StudentId"
                WHERE c."StudentId" NOT IN (SELECT "StudentId" FROM upd)
                RETURNING 1
            )
            SELECT COALESCE(sum(n), 0)::int AS "Value" FROM counts
            """).ToListAsync();
        return rows.FirstOrDefault();
    }
}
