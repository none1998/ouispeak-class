-- Audio for a group of questions (placed before a question, used until the next audio).
-- Run ONCE in Supabase → SQL Editor, BEFORE uploading the new files.
alter table content."Questions" add column if not exists "Audio" text;
