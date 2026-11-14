-- Homework is now confirmed once a day (13:05): ticks and points appear then.
-- Run ONCE in Supabase → SQL Editor, BEFORE uploading the new files.
alter table content."HomeworkSubmissions" add column if not exists "ConfirmedAt" timestamptz;

-- what is already ticked today stays ticked (its points were already given)
update content."HomeworkSubmissions" set "ConfirmedAt" = "FirstSentAt" where "ConfirmedAt" is null;
