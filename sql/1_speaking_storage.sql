-- Private storage for students' voice recordings (speaking exercises).
-- Each student can only upload and read files inside their own folder.
insert into storage.buckets (id, name, public, file_size_limit)
values ('speaking', 'speaking', false, 20971520)   -- 20 MB per recording
on conflict (id) do nothing;

drop policy if exists "speaking: students upload own" on storage.objects;
create policy "speaking: students upload own"
on storage.objects for insert to authenticated
with check (bucket_id = 'speaking' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "speaking: students read own" on storage.objects;
create policy "speaking: students read own"
on storage.objects for select to authenticated
using (bucket_id = 'speaking' and (storage.foldername(name))[1] = (select auth.uid())::text);
