-- Profiles + Org contact info + Meeting expenses
-- Run after the existing org/jobs schema + RBAC migrations.

begin;

-- =========================
-- Org contact fields
-- =========================
alter table public.orgs
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists contact_job_title text,
  add column if not exists logo_url text;

-- Allow org admins (FMO/org admins) to update org contact fields.
-- NOTE: The base schema only allows master admins to modify orgs; this enables the "Update info" button in the FMO Home view.
alter table public.orgs enable row level security;

drop policy if exists orgs_update_contact on public.orgs;
create policy orgs_update_contact on public.orgs
for update
to authenticated
using (
  public.is_master_admin()
  or exists (
    select 1
    from public.org_members m
    where m.org_id = orgs.id
      and m.user_id = auth.uid()
      and m.role in ('fmo_admin','org_admin')
  )
)
with check (
  public.is_master_admin()
  or exists (
    select 1
    from public.org_members m
    where m.org_id = orgs.id
      and m.user_id = auth.uid()
      and m.role in ('fmo_admin','org_admin')
  )
);

-- =========================
-- User profiles (advisor-facing fields)
-- Stores email/phone/city/name explicitly so FMOs can view permissioned fields
-- without needing access to auth.users.
-- =========================
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  city_served text,
  photo_url text,
  photo_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at trigger (reuses set_updated_at if present)
do $do$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_updated_at'
  ) then
    create or replace function public.set_updated_at()
    returns trigger
    language plpgsql
    as $set_updated_at$
    begin
      new.updated_at := now();
      return new;
    end;
    $set_updated_at$;
  end if;
end $do$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- Helper: can read another user's profile?
create or replace function public.can_read_profile(p_profile_user_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_master_admin()
    or auth.uid() = p_profile_user_id
    or exists (
      select 1
      from public.org_members me
      join public.org_members them on them.org_id = me.org_id
      where me.user_id = auth.uid()
        and me.role in ('fmo_admin','org_admin')
        and them.user_id = p_profile_user_id
    );
$$;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select
to authenticated
using (public.can_read_profile(user_id));

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
for insert
to authenticated
with check (public.is_master_admin() or auth.uid() = user_id);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
for update
to authenticated
using (public.is_master_admin() or auth.uid() = user_id)
with check (public.is_master_admin() or auth.uid() = user_id);

-- =========================
-- Meeting expenses (post-meeting tax reporting)
-- =========================
create table if not exists public.meeting_expenses (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.job_meetings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  dinner_cost numeric,
  office_expenses numeric,
  gas numeric,
  other numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meeting_id, user_id)
);

drop trigger if exists trg_meeting_expenses_updated_at on public.meeting_expenses;
create trigger trg_meeting_expenses_updated_at
before update on public.meeting_expenses
for each row execute function public.set_updated_at();

alter table public.meeting_expenses enable row level security;

-- Helper: can access meeting via job membership
create or replace function public.can_access_meeting(p_meeting_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_master_admin()
    or exists (
      select 1
      from public.job_meetings jm
      join public.jobs j on j.id = jm.job_id
      where jm.id = p_meeting_id
        and (
          public.is_org_member(j.org_id)
          or j.created_by_user_id = auth.uid()
        )
    );
$$;

drop policy if exists meeting_expenses_select on public.meeting_expenses;
create policy meeting_expenses_select on public.meeting_expenses
for select
to authenticated
using (
  public.is_master_admin()
  or user_id = auth.uid()
  or public.can_access_meeting(meeting_id)
);

drop policy if exists meeting_expenses_modify on public.meeting_expenses;
create policy meeting_expenses_modify on public.meeting_expenses
for all
to authenticated
using (
  public.is_master_admin()
  or user_id = auth.uid()
)
with check (
  public.is_master_admin()
  or (user_id = auth.uid() and public.can_access_meeting(meeting_id))
);

commit;
