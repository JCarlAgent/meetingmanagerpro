-- Templates setup: creates public.mail_templates and (optionally) the mail-templates storage bucket.
-- Run in Supabase SQL editor (or as a migration) in the same project as the portal.

begin;

-- Updated-at helper (self-contained)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.mail_templates (
  id uuid primary key default gen_random_uuid(),
  -- Optional org scope: NULL = global template; otherwise scoped to a specific org/FMO
  org_id uuid references public.orgs(id) on delete cascade,
  name text not null,
  description text not null default '',
  industry text not null,
  template_number integer not null,
  thumbnail_url text,
  preview_url text,
  mail_piece_size text not null default '6x11',
  mail_piece_type text not null default 'postcard',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mail_templates_industry_check check (industry in ('financial','medicare','stem_cell','reverse_mortgage')),
  constraint mail_templates_template_number_check check (template_number > 0)
);

-- If the table already exists, safely add the org scope column.
alter table public.mail_templates
  add column if not exists org_id uuid references public.orgs(id) on delete cascade;

-- Templates are org-specific (no global templates). Make org_id required.
-- If you have existing rows with org_id null, backfill them before enforcing NOT NULL.
alter table public.mail_templates
  alter column org_id set not null;

create index if not exists mail_templates_org_id_idx on public.mail_templates(org_id);

create index if not exists mail_templates_active_idx on public.mail_templates(is_active);
create index if not exists mail_templates_industry_num_idx on public.mail_templates(industry, template_number);

drop trigger if exists set_mail_templates_updated_at on public.mail_templates;
create trigger set_mail_templates_updated_at
before update on public.mail_templates
for each row
execute function public.set_updated_at();

alter table public.mail_templates enable row level security;

-- Read access: any authenticated user can browse templates
drop policy if exists mail_templates_select on public.mail_templates;
create policy mail_templates_select on public.mail_templates
for select
to authenticated
using (
  public.is_master_admin()
  or exists (
    select 1
    from public.org_members om
    where om.org_id = mail_templates.org_id
      and om.user_id = auth.uid()
  )
);

-- Write access:
-- - Master admins can create/update/delete any template (global or org-scoped)
-- - FMO/org admins can create/update/delete templates scoped to their org_id

drop policy if exists mail_templates_insert on public.mail_templates;
create policy mail_templates_insert on public.mail_templates
for insert
to authenticated
with check (
  public.is_master_admin()
  or (
    org_id is not null
    and exists (
      select 1
      from public.org_members om
      where om.org_id = mail_templates.org_id
        and om.user_id = auth.uid()
        and om.role in ('fmo_admin','org_admin')
    )
  )
);

drop policy if exists mail_templates_update on public.mail_templates;
create policy mail_templates_update on public.mail_templates
for update
to authenticated
using (
  public.is_master_admin()
  or (
    org_id is not null
    and exists (
      select 1
      from public.org_members om
      where om.org_id = mail_templates.org_id
        and om.user_id = auth.uid()
        and om.role in ('fmo_admin','org_admin')
    )
  )
)
with check (
  public.is_master_admin()
  or (
    org_id is not null
    and exists (
      select 1
      from public.org_members om
      where om.org_id = mail_templates.org_id
        and om.user_id = auth.uid()
        and om.role in ('fmo_admin','org_admin')
    )
  )
);

drop policy if exists mail_templates_delete on public.mail_templates;
create policy mail_templates_delete on public.mail_templates
for delete
to authenticated
using (
  public.is_master_admin()
  or (
    org_id is not null
    and exists (
      select 1
      from public.org_members om
      where om.org_id = mail_templates.org_id
        and om.user_id = auth.uid()
        and om.role in ('fmo_admin','org_admin')
    )
  )
);

-- Optional: create the Storage bucket used by Template Manager uploads.
-- If you prefer to manage buckets in the Supabase UI, you can delete this section.
insert into storage.buckets (id, name, public)
values ('mail-templates', 'mail-templates', true)
on conflict (id) do update set public = true;

-- Public read of objects in the bucket
drop policy if exists "mail_templates_bucket_read" on storage.objects;
create policy "mail_templates_bucket_read" on storage.objects
for select
to public
using (bucket_id = 'mail-templates');

-- Only master admins can upload/update/delete objects in the bucket
drop policy if exists "mail_templates_bucket_write" on storage.objects;
create policy "mail_templates_bucket_write" on storage.objects
for all
to authenticated
using (
  bucket_id = 'mail-templates'
  and (
    public.is_master_admin()
    or exists (
      select 1
      from public.org_members om
      where om.user_id = auth.uid()
        and om.role in ('fmo_admin','org_admin')
        and split_part(storage.objects.name, '/', 1) = 'templates'
        and om.org_id::text = split_part(storage.objects.name, '/', 2)
    )
  )
)
with check (
  bucket_id = 'mail-templates'
  and (
    public.is_master_admin()
    or exists (
      select 1
      from public.org_members om
      where om.user_id = auth.uid()
        and om.role in ('fmo_admin','org_admin')
        and split_part(storage.objects.name, '/', 1) = 'templates'
        and om.org_id::text = split_part(storage.objects.name, '/', 2)
    )
  )
);

commit;
