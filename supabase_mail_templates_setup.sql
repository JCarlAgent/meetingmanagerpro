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
using (true);

-- Write access: only master admins can create/update/delete templates
drop policy if exists mail_templates_modify on public.mail_templates;
create policy mail_templates_modify on public.mail_templates
for all
to authenticated
using (public.is_master_admin())
with check (public.is_master_admin());

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
using (bucket_id = 'mail-templates' and public.is_master_admin())
with check (bucket_id = 'mail-templates' and public.is_master_admin());

commit;
