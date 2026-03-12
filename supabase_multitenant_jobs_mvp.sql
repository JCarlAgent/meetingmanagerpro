-- Multi-tenant Jobs + Responses MVP for MeetingManagerPro
-- Retention-first design: keep detailed lead/attendee data for 30 days, retain only aggregate stats long-term.
--
-- Before running:
-- 1) Ensure you have the existing `admins` table used by the marketing site's admin area.
-- 2) Decide how portal users become members of an org (manuals:
-- - This file creates new t
-- - RLS policies are included.
-- - A job_number generator is included (per-org counter, concurrent-safe).

begin;

-- Enable uuid generation (Supabase usually has this already)
create extension if not exists "pgcrypto";

-- =========================
--  Organizations (FMOs/IMOs)
-- =========================
create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  brand jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.org_domains (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  host text not null unique,
  created_at timestamptz not null default now()
);

-- Org membership (portal users)
create table if not exists public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member','org_admin')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

-- Master admins: reuse existing `public.admins(email)` list from the marketing site.
-- We'll also use it for master reporting access here.

-- =========================
-- Job numbering (per org)
-- =========================
create table if not exists public.org_job_counters (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  next_number bigint not null default 1,
  updated_at timestamptz not null default now()
);

create or replace function public.allocate_job_number(p_org_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_slug text;
  v_next bigint;
  v_job_number text;
begin
  select slug into v_slug from public.orgs where id = p_org_id;
  if v_slug is null then
    raise exception 'org not found';
  end if;

  insert into public.org_job_counters(org_id, next_number)
  values (p_org_id, 1)
  on conflict (org_id) do nothing;

  update public.org_job_counters
     set next_number = next_number + 1,
         updated_at = now()
   where org_id = p_org_id
  returning next_number - 1 into v_next;

  -- IMPACT-000123 style (use upper slug)
  v_job_number := upper(v_slug) || '-' || lpad(v_next::text, 6, '0');
  return v_job_number;
end;
$$;

-- =========================
-- Jobs / Meetings
-- =========================
create type public.job_status as enum ('pending','active','closed');

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  created_by_user_id uuid references auth.users(id) on delete set null,
  job_number text not null unique,
  status public.job_status not null default 'pending',
  title text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_jobs_org_id on public.jobs(org_id);
create index if not exists idx_jobs_status on public.jobs(status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_jobs_updated_at on public.jobs;
create trigger trg_jobs_updated_at
before update on public.jobs
for each row execute function public.set_updated_at();

create table if not exists public.job_meetings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  starts_at timestamptz,
  location_name text,
  address1 text,
  address2 text,
  city text,
  state text,
  postal_code text,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_meetings_job_id on public.job_meetings(job_id);

-- =========================
-- Mailing list uploads (optional)
-- We store file metadata and can store the file in Supabase Storage.
-- The goal is to avoid importing every row.
-- =========================
create table if not exists public.job_mailing_lists (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  storage_path text,
  original_filename text,
  row_count int,
  uploaded_at timestamptz not null default now()
);

create index if not exists idx_job_mailing_lists_job_id on public.job_mailing_lists(job_id);

-- =========================
-- Print order + tracking (order-level to start)
-- =========================
create table if not exists public.print_orders (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  format text,
  template_key text,
  printer_vendor text,
  vendor_order_id text,
  mailed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_print_orders_job_id on public.print_orders(job_id);

create table if not exists public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  print_order_id uuid not null references public.print_orders(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists idx_delivery_events_print_order_id on public.delivery_events(print_order_id);

-- =========================
-- Responses / Attendees (retained for 30 days)
-- =========================
create type public.response_source as enum ('qr','call_center','manual');
create type public.response_status as enum ('new','confirmed','declined','no_show');

create table if not exists public.responses (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  source public.response_source not null default 'qr',
  status public.response_status not null default 'new',

  -- Personal data: retained short-term
  full_name text,
  phone text,
  email text,
  address1 text,
  city text,
  state text,
  postal_code text,

  -- Sales-helper flags
  scheduled_appointment boolean not null default false,
  scheduled_at timestamptz,

  -- Retention control
  expires_at timestamptz not null default (now() + interval '30 days'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_responses_job_id on public.responses(job_id);
create index if not exists idx_responses_expires_at on public.responses(expires_at);

drop trigger if exists trg_responses_updated_at on public.responses;
create trigger trg_responses_updated_at
before update on public.responses
for each row execute function public.set_updated_at();

create table if not exists public.response_notes (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.responses(id) on delete cascade,
  created_by_user_id uuid references auth.users(id) on delete set null,
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_response_notes_response_id on public.response_notes(response_id);

-- =========================
-- Exports (weekly/monthly/on-demand)
-- Store exported files + metadata; after export, detailed data may still expire naturally.
-- =========================
create type public.export_frequency as enum ('on_demand','weekly','monthly');

create table if not exists public.export_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  frequency public.export_frequency not null default 'monthly',
  include_confirmed_only boolean not null default false,
  include_scheduled_only boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_export_rules_updated_at on public.export_rules;
create trigger trg_export_rules_updated_at
before update on public.export_rules
for each row execute function public.set_updated_at();

create table if not exists public.exports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  storage_path text,
  row_count int,
  generated_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_exports_org_id on public.exports(org_id);

-- =========================
-- Long-term aggregate stats (no personal data)
-- =========================
create table if not exists public.job_stats (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,

  -- Mailing stats (order level)
  mailed_count int,
  delivered_count int,
  first_delivery_at timestamptz,
  last_delivery_at timestamptz,

  -- Response stats
  responses_total int not null default 0,
  responses_confirmed int not null default 0,
  responses_scheduled int not null default 0,

  updated_at timestamptz not null default now()
);

-- Helper function to recompute job_stats from responses + delivery_events
-- (MVP: can be called manually or from edge functions)
create or replace function public.refresh_job_stats(p_job_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_total int;
  v_confirmed int;
  v_scheduled int;
  v_first_delivery timestamptz;
  v_last_delivery timestamptz;
begin
  select
    count(*)::int,
    count(*) filter (where status = 'confirmed')::int,
    count(*) filter (where scheduled_appointment is true)::int
  into v_total, v_confirmed, v_scheduled
  from public.responses
  where job_id = p_job_id;

  select
    min(de.occurred_at),
    max(de.occurred_at)
  into v_first_delivery, v_last_delivery
  from public.delivery_events de
  join public.print_orders po on po.id = de.print_order_id
  where po.job_id = p_job_id
    and de.event_type ilike '%deliver%';

  insert into public.job_stats(
    job_id,
    responses_total,
    responses_confirmed,
    responses_scheduled,
    first_delivery_at,
    last_delivery_at,
    updated_at
  ) values (
    p_job_id,
    coalesce(v_total,0),
    coalesce(v_confirmed,0),
    coalesce(v_scheduled,0),
    v_first_delivery,
    v_last_delivery,
    now()
  )
  on conflict (job_id) do update
    set responses_total = excluded.responses_total,
        responses_confirmed = excluded.responses_confirmed,
        responses_scheduled = excluded.responses_scheduled,
        first_delivery_at = excluded.first_delivery_at,
        last_delivery_at = excluded.last_delivery_at,
        updated_at = now();
end;
$$;

-- =========================
-- Retention: purge expired responses (run via cron / edge function)
-- =========================
create or replace function public.purge_expired_responses()
returns bigint
language plpgsql
security definer
as $$
declare
  v_deleted bigint;
begin
  delete from public.responses
  where expires_at < now()
  returning 1 into v_deleted;

  -- NOTE: response_notes cascade via FK.

  return coalesce(v_deleted, 0);
end;
$$;

-- =========================
-- RLS
-- =========================
alter table public.orgs enable row level security;
alter table public.org_domains enable row level security;
alter table public.org_members enable row level security;
alter table public.jobs enable row level security;
alter table public.job_meetings enable row level security;
alter table public.job_mailing_lists enable row level security;
alter table public.print_orders enable row level security;
alter table public.delivery_events enable row level security;
alter table public.responses enable row level security;
alter table public.response_notes enable row level security;
alter table public.export_rules enable row level security;
alter table public.exports enable row level security;
alter table public.job_stats enable row level security;

-- Helper: is master admin? (by email in public.admins)
create or replace function public.is_master_admin()
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.admins a
    where a.email ilike (auth.jwt() ->> 'email')
  );
$$;

-- Helper: user org membership
create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.org_members m
    where m.org_id = p_org_id
      and m.user_id = auth.uid()
  );
$$;

-- ORGS
drop policy if exists orgs_select on public.orgs;
create policy orgs_select on public.orgs
for select
using (public.is_master_admin() or public.is_org_member(id));

drop policy if exists orgs_modify_master on public.orgs;
create policy orgs_modify_master on public.orgs
for all
using (public.is_master_admin())
with check (public.is_master_admin());

-- ORG MEMBERS
drop policy if exists org_members_select on public.org_members;
create policy org_members_select on public.org_members
for select
using (public.is_master_admin() or user_id = auth.uid() or public.is_org_member(org_id));

drop policy if exists org_members_modify_master on public.org_members;
create policy org_members_modify_master on public.org_members
for all
using (public.is_master_admin())
with check (public.is_master_admin());

-- JOBS
drop policy if exists jobs_select on public.jobs;
create policy jobs_select on public.jobs
for select
using (public.is_master_admin() or public.is_org_member(org_id));

drop policy if exists jobs_insert on public.jobs;
create policy jobs_insert on public.jobs
for insert
with check (public.is_org_member(org_id));

drop policy if exists jobs_update on public.jobs;
create policy jobs_update on public.jobs
for update
using (public.is_master_admin() or public.is_org_member(org_id))
with check (public.is_master_admin() or public.is_org_member(org_id));

-- Meetings and related tables inherit from job_id -> org_id via joins at app level,
-- so we enforce by checking membership against the job's org.

-- JOB_MEETINGS
drop policy if exists job_meetings_all on public.job_meetings;
create policy job_meetings_all on public.job_meetings
for all
using (
  public.is_master_admin()
  or exists (
    select 1
    from public.jobs j
    where j.id = job_meetings.job_id
      and public.is_org_member(j.org_id)
  )
)
with check (
  public.is_master_admin()
  or exists (
    select 1
    from public.jobs j
    where j.id = job_meetings.job_id
      and public.is_org_member(j.org_id)
  )
);

-- JOB_MAILING_LISTS
drop policy if exists job_mailing_lists_all on public.job_mailing_lists;
create policy job_mailing_lists_all on public.job_mailing_lists
for all
using (
  public.is_master_admin()
  or exists (
    select 1
    from public.jobs j
    where j.id = job_mailing_lists.job_id
      and public.is_org_member(j.org_id)
  )
)
with check (
  public.is_master_admin()
  or exists (
    select 1
    from public.jobs j
    where j.id = job_mailing_lists.job_id
      and public.is_org_member(j.org_id)
  )
);

-- PRINT_ORDERS
drop policy if exists print_orders_all on public.print_orders;
create policy print_orders_all on public.print_orders
for all
using (
  public.is_master_admin()
  or exists (
    select 1
    from public.jobs j
    where j.id = print_orders.job_id
      and public.is_org_member(j.org_id)
  )
)
with check (
  public.is_master_admin()
  or exists (
    select 1
    from public.jobs j
    where j.id = print_orders.job_id
      and public.is_org_member(j.org_id)
  )
);

-- DELIVERY_EVENTS
drop policy if exists delivery_events_all on public.delivery_events;
create policy delivery_events_all on public.delivery_events
for all
using (
  public.is_master_admin()
  or exists (
    select 1
    from public.print_orders po
    join public.jobs j on j.id = po.job_id
    where po.id = delivery_events.print_order_id
      and public.is_org_member(j.org_id)
  )
)
with check (
  public.is_master_admin()
  or exists (
    select 1
    from public.print_orders po
    join public.jobs j on j.id = po.job_id
    where po.id = delivery_events.print_order_id
      and public.is_org_member(j.org_id)
  )
);

-- RESPONSES (expires after 30 days)
drop policy if exists responses_all on public.responses;
create policy responses_all on public.responses
for all
using (
  public.is_master_admin()
  or exists (
    select 1
    from public.jobs j
    where j.id = responses.job_id
      and public.is_org_member(j.org_id)
  )
)
with check (
  public.is_master_admin()
  or exists (
    select 1
    from public.jobs j
    where j.id = responses.job_id
      and public.is_org_member(j.org_id)
  )
);

-- RESPONSE_NOTES
drop policy if exists response_notes_all on public.response_notes;
create policy response_notes_all on public.response_notes
for all
using (
  public.is_master_admin()
  or exists (
    select 1
    from public.responses r
    join public.jobs j on j.id = r.job_id
    where r.id = response_notes.response_id
      and public.is_org_member(j.org_id)
  )
)
with check (
  public.is_master_admin()
  or exists (
    select 1
    from public.responses r
    join public.jobs j on j.id = r.job_id
    where r.id = response_notes.response_id
      and public.is_org_member(j.org_id)
  )
);

-- EXPORT_RULES / EXPORTS
drop policy if exists export_rules_all on public.export_rules;
create policy export_rules_all on public.export_rules
for all
using (public.is_master_admin() or public.is_org_member(org_id))
with check (public.is_master_admin() or public.is_org_member(org_id));

drop policy if exists exports_all on public.exports;
create policy exports_all on public.exports
for all
using (public.is_master_admin() or public.is_org_member(org_id))
with check (public.is_master_admin() or public.is_org_member(org_id));

-- JOB_STATS
drop policy if exists job_stats_select on public.job_stats;
create policy job_stats_select on public.job_stats
for select
using (
  public.is_master_admin()
  or exists (
    select 1
    from public.jobs j
    where j.id = job_stats.job_id
      and public.is_org_member(j.org_id)
  )
);

-- We'll restrict writes to stats to master admin or service role (via edge function).
drop policy if exists job_stats_modify_master on public.job_stats;
create policy job_stats_modify_master on public.job_stats
for all
using (public.is_master_admin())
with check (public.is_master_admin());

commit;
