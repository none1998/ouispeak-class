-- Homework sent by email: one line per student + course + week (one tick, even if sent many times).
-- Run ONCE in Supabase → SQL Editor, BEFORE uploading the new files.
create table if not exists content."HomeworkSubmissions" (
    "StudentId"   text        not null,
    "Course"      text        not null,
    "Week"        integer     not null,
    "Count"       integer     not null default 1,
    "FirstSentAt" timestamptz not null default now(),
    "LastSentAt"  timestamptz not null default now(),
    "Manual"      boolean     not null default false,
    primary key ("StudentId", "Course", "Week")
);
