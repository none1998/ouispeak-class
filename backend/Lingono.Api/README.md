# Lingono API (C# / ASP.NET Core)

Serves course content (exercises + vocabulary) from the database and powers the admin page.
Uses your EXISTING Supabase database and logins. New tables live in a separate `content` schema,
which Supabase does not expose to the browser, so only this server can read the answers.

## First run

1. Install the .NET 10 SDK, then the EF tool:
   `dotnet tool install --global dotnet-ef`
2. In Supabase: Dashboard → Connect → **Session pooler**. Copy the connection string
   (replace `[YOUR-PASSWORD]` with your database password), then in this folder:
   ```
   dotnet user-secrets init
   dotnet user-secrets set "ConnectionStrings:Default" "Host=...;Port=5432;Database=postgres;Username=...;Password=..."
   ```
   (User secrets stay on your computer and never go to GitHub.)
3. In `appsettings.json`, put your admin email(s) in `AdminEmails`. They must be Supabase accounts.
4. Create the tables:
   ```
   dotnet ef migrations add InitialContent
   dotnet ef database update
   ```
5. Start the API: `dotnet run` → http://localhost:5080
6. Open the frontend with VS Code Live Server, go to `admin.html`, sign in, click **Import old content**.
7. Check a few weeks in the admin page and on the student pages. Then move `frontend/js/data/`
   OUT of the website folder (keep it as a backup): otherwise anyone can still download it.

## Endpoints

| Who      | Method & path                          | What it does                               |
|----------|----------------------------------------|--------------------------------------------|
| Student  | GET  /api/content/exercises            | Exercises of the student's own course      |
| Student  | GET  /api/content/vocab                | Vocabulary of the student's own course     |
| Admin    | GET  /api/admin/courses                | Courses with their weeks                   |
| Admin    | POST /api/admin/courses                | New course `{ "name": "..." }`             |
| Admin    | DELETE /api/admin/courses/{id}         | Delete course and everything in it         |
| Admin    | POST /api/admin/courses/{id}/weeks     | New week `{ "number": 6 }`                 |
| Admin    | GET  /api/admin/weeks/{id}             | One week, ready to edit                    |
| Admin    | PUT  /api/admin/weeks/{id}/blocks      | Save all exercise blocks of the week       |
| Admin    | PUT  /api/admin/weeks/{id}/vocab       | Save all vocabulary of the week            |
| Admin    | DELETE /api/admin/weeks/{id}           | Delete week                                |
| Admin    | POST /api/admin/import                 | One-time import of the old JS data         |

## Deploy (Render, with the Dockerfile)

New Web Service → this folder → Docker. Environment variables:
- `ConnectionStrings__Default` = your Session pooler connection string
- `AllowedOrigins__0` = `https://YOUR-SITE.netlify.app`
- `AdminEmails__0` = your admin email

Then set `API_URL` in `frontend/js/config.js` to the Render address.
