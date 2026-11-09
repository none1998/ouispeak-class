# Lingono / OuiSpeak – frontend

The site works exactly as before. The only change is that CSS and JavaScript
moved out of the HTML files into their own folders.

```
frontend/
├── *.html                 pages (structure only)
├── admin.html             course editor (exercises + vocabulary)
├── css/                   one stylesheet per page (+ ouibot.css)
├── js/
│   ├── config.js          Supabase URL + key  (edit in ONE place)
│   ├── common.js          loadHeaderScore() – used by every page
│   ├── api.js             api() – calls the C# backend with the login token
│   ├── content-loader.js  loads exercises/vocab of the student's course from the API
│   ├── data/
│   │   ├── exercises-data.js   OLD content, only used once by the admin import.
│   │   └── vocab-data.js       Move this folder out of the site after importing!
│   └── pages/             the logic of each page
├── images/                ← copy your existing folder here
└── texts/                 ← copy your existing folder here
```

Script order matters: config.js → common.js → api.js → content-loader.js → page script.
Copy also contact.html, policy.html, code.html and any other files from the
old project. On Netlify, set the publish directory to `frontend`.
