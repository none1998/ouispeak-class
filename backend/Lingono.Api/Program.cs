using Lingono.Api.Auth;
using Lingono.Api.Data;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient();

// Database: the same Supabase PostgreSQL you already use.
// New tables go into a separate "content" schema so they don't mix with your existing ones.
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(
        builder.Configuration.GetConnectionString("Default"),
        npgsql => npgsql.MigrationsHistoryTable("__EFMigrationsHistory", AppDbContext.Schema)));

// Login: students and admins keep logging in with Supabase. The API checks their Supabase token.
builder.Services
    .AddAuthentication(SupabaseAuthHandler.SchemeName)
    .AddScheme<AuthenticationSchemeOptions, SupabaseAuthHandler>(SupabaseAuthHandler.SchemeName, null);
builder.Services.AddAuthorization(options =>
    options.AddPolicy("Admin", policy => policy.RequireRole("Admin")));

// Which websites may call this API (your Netlify site + local testing).
var allowedOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(options => options.AddPolicy("Frontend", policy => policy
    .WithOrigins(allowedOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod()));

builder.Services.AddHostedService<Lingono.Api.Services.HomeworkDailyJob>();
var app = builder.Build();

app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/", () => "Lingono API is running");
app.MapControllers();

app.Run();
