-- 1) A picture can be attached to each question
alter table content."Questions" add column if not exists "Image" text;

-- 2) Storage for files uploaded from the admin page (videos, texts, audios, images).
--    Public for reading (students' pages show them), only the admin can upload.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)            -- 50 MB per file
on conflict (id) do nothing;

drop policy if exists "media: admin uploads" on storage.objects;
create policy "media: admin uploads"
on storage.objects for insert to authenticated
with check (bucket_id = 'media' and (auth.jwt() ->> 'email') = 'ouispeakinfo@gmail.com');
