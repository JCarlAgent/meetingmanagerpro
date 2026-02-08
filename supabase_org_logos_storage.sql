-- Org logos: creates a public Storage bucket for org logos and policies to allow org admins to upload.
-- Run in Supabase SQL editor (or as a migration) in the same project as the portal.
-- Assumes you already have public.org_members with roles including 'fmo_admin'/'org_admin', and the helper function public.is_master_admin().
-- Naming convention: uploads should be stored at path: <org_id>/<filename>

begin;

-- Create bucket (public read so the UI can use getPublicUrl)
insert into storage.buckets (id, name, public)
values ('org-logos', 'org-logos', true)
on conflict (id) do update set public = true;

-- Public read of org logos
drop policy if exists "org_logos_bucket_read" on storage.objects;
create policy "org_logos_bucket_read" on storage.objects
for select
to public
using (bucket_id = 'org-logos');

-- Helper predicate: user is an org admin for the org in the object path
-- object name is: <org_id>/<filename>
-- org_id is uuid in org_members; compare via text.

drop policy if exists "org_logos_bucket_write" on storage.objects;
create policy "org_logos_bucket_write" on storage.objects
for all
to authenticated
using (
  bucket_id = 'org-logos'
  and (
    public.is_master_admin()
    or exists (
      select 1
      from public.org_members om
      where om.user_id = auth.uid()
        and om.role in ('fmo_admin','org_admin')
        and om.org_id::text = split_part(name, '/', 1)
    )
  )
)
with check (
  bucket_id = 'org-logos'
  and (
    public.is_master_admin()
    or exists (
      select 1
      from public.org_members om
      where om.user_id = auth.uid()
        and om.role in ('fmo_admin','org_admin')
        and om.org_id::text = split_part(name, '/', 1)
    )
  )
);

commit;
