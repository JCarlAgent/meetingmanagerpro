-- Advisor photos: creates a public Storage bucket for advisor avatars and policies.
-- Run in Supabase SQL editor (or as a migration) in the same project as the portal.
-- Upload path convention used by the app: <user_id>/avatar.<ext>

begin;

-- Create bucket (public read so avatars can be displayed without signed URLs)
insert into storage.buckets (id, name, public)
values ('advisor-photos', 'advisor-photos', true)
on conflict (id) do update set public = true;

-- Public read of advisor photos
drop policy if exists "advisor_photos_bucket_read" on storage.objects;
create policy "advisor_photos_bucket_read" on storage.objects
for select
to public
using (bucket_id = 'advisor-photos');

-- Write: owner can upload/update/delete their own avatar objects.
-- Object name is: <user_id>/avatar.<ext> (or generally <user_id>/...)
-- Also allow master admins.
drop policy if exists "advisor_photos_bucket_write" on storage.objects;
create policy "advisor_photos_bucket_write" on storage.objects
for all
to authenticated
using (
  bucket_id = 'advisor-photos'
  and (
    public.is_master_admin()
    or split_part(name, '/', 1) = auth.uid()::text
  )
)
with check (
  bucket_id = 'advisor-photos'
  and (
    public.is_master_admin()
    or split_part(name, '/', 1) = auth.uid()::text
  )
);

commit;
