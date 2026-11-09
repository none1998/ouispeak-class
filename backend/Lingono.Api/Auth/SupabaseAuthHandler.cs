using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

namespace Lingono.Api.Auth;

/// <summary>
/// Reads "Authorization: Bearer &lt;token&gt;" (the token your frontend gets from Supabase login),
/// asks Supabase who that token belongs to, and turns the answer into a logged-in User.
/// Results are cached for 5 minutes so Supabase isn't called on every request.
/// </summary>
public class SupabaseAuthHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IHttpClientFactory httpClientFactory,
    IMemoryCache cache,
    IConfiguration config)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "Supabase";

    public record SupabaseUser(string Id, string? Email);

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var header = Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            return AuthenticateResult.NoResult();

        var token = header["Bearer ".Length..].Trim();

        if (!cache.TryGetValue(token, out SupabaseUser? user))
        {
            var request = new HttpRequestMessage(HttpMethod.Get, $"{config["Supabase:Url"]}/auth/v1/user");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            request.Headers.Add("apikey", config["Supabase:AnonKey"]);

            var response = await httpClientFactory.CreateClient().SendAsync(request);
            if (!response.IsSuccessStatusCode)
                return AuthenticateResult.Fail("Invalid or expired login.");

            user = await response.Content.ReadFromJsonAsync<SupabaseUser>();
            if (user is null)
                return AuthenticateResult.Fail("Invalid login.");

            cache.Set(token, user, TimeSpan.FromMinutes(5));
        }

        var adminEmails = config.GetSection("AdminEmails").Get<string[]>() ?? [];
        var isAdmin = user!.Email is not null &&
                      adminEmails.Contains(user.Email, StringComparer.OrdinalIgnoreCase);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id),
            new(ClaimTypes.Email, user.Email ?? ""),
        };
        if (isAdmin) claims.Add(new Claim(ClaimTypes.Role, "Admin"));

        var identity = new ClaimsIdentity(claims, SchemeName);
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName));
    }
}
