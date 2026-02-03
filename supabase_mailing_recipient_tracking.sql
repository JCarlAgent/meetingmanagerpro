-- Mailing recipient tracking (address-level) + demographics CSV storage
--
-- Purpose:
-- - Track "times mailed" per recipient (address-level) across all jobs.
-- - Store demographics CSV in Supabase Storage, but persist mailing events in Postgres.
--
-- Assumes you have already run:
-- - supabase_multitenant_jobs_mvp.sql
-- - supabase_rbac_three_levels_migration.sql
--
-- Also creates a private Storage bucket `job-demographics` and RLS policies for it.

begin;

create extension if not exists "pgcrypto";

-- =========================
-- Fingerprint helpers
-- =========================
create or replace function public.normalize_for_fingerprint(p_text text)
returns text
language sql
stable
as $$
  select regexp_replace(
    regexp_replace(
      upper(coalesce(p_text, '')),
      '[^A-Z0-9 ]',
      '',
      'g'
    ),
    '\\s+',
    ' ',
    'g'
  );
$$;

create or replace function public.zip5(p_zip text)
returns text
language sql
stable
as $$
  select left(regexp_replace(coalesce(p_zip, ''), '[^0-9]', '', 'g'), 5);
$$;

-- Address-level fingerprint (household)
create or replace function public.recipient_fingerprint_address(
  p_address1 text,
  p_address2 text,
  p_city text,
  p_state text,
  p_zip text
)
returns text
language sql
stable
as $$
  select encode(
    digest(
      public.normalize_for_fingerprint(p_address1)
      || '|' || public.normalize_for_fingerprint(p_address2)
      || '|' || public.normalize_for_fingerprint(p_city)
      || '|' || public.normalize_for_fingerprint(p_state)
      || '|' || public.normalize_for_fingerprint(public.zip5(p_zip)),
      'sha256'
    ),
    'hex'
  );
$$;

-- Name+address fingerprint (person-level). Not used by default, but handy later.
create or replace function public.recipient_fingerprint_name_address(
  p_first_name text,
  p_last_name text,
  p_address1 text,
  p_address2 text,
  p_city text,
  p_state text,
  p_zip text
)
returns text
language sql
stable
as $$
  select encode(
    digest(
      public.normalize_for_fingerprint(p_first_name)
      || '|' || public.normalize_for_fingerprint(p_last_name)
      || '|' || public.normalize_for_fingerprint(p_address1)
      || '|' || public.normalize_for_fingerprint(p_address2)
      || '|' || public.normalize_for_fingerprint(p_city)
      || '|' || public.normalize_for_fingerprint(p_state)
      || '|' || public.normalize_for_fingerprint(public.zip5(p_zip)),
      'sha256'
    ),
    'hex'
  );
$$;

-- =========================
-- Recipients (deduped per org)
-- =========================
create table if not exists public.recipients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  fingerprint text not null,

  -- Display / search (PII). Keep minimal; fingerprint is what we use for counting.
  first_name text,
  last_name text,
  address1 text,
  address2 text,
  city text,
  state text,
  postal_code text,

  created_at timestamptz not null default now()
);

create unique index if not exists recipients_org_fingerprint_uq
  on public.recipients(org_id, fingerprint);

create index if not exists recipients_org_id_idx on public.recipients(org_id);

alter table public.recipients enable row level security;

drop policy if exists recipients_select on public.recipients;
create policy recipients_select on public.recipients
for select
to authenticated
using (
  public.is_master_admin()
  or public.is_org_member(org_id)
);

drop policy if exists recipients_insert on public.recipients;
create policy recipients_insert on public.recipients
for insert
to authenticated
with check (
  public.is_master_admin()
  or public.is_org_member(org_id)
);

drop policy if exists recipients_update on public.recipients;
create policy recipients_update on public.recipients
for update
to authenticated
using (
  public.is_master_admin()
  or public.is_org_member(org_id)
)
with check (
  public.is_master_admin()
  or public.is_org_member(org_id)
);

drop policy if exists recipients_delete on public.recipients;
create policy recipients_delete on public.recipients
for delete
to authenticated
using (
  public.is_master_admin()
  or public.is_org_member(org_id)
);

-- =========================
-- Mailings ledger
-- One row per recipient per mailing list upload (idempotent by unique index).
-- =========================
create table if not exists public.mailings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  recipient_id uuid not null references public.recipients(id) on delete cascade,

  -- Link back to the uploaded CSV that caused these mailings.
  mailing_list_id uuid references public.job_mailing_lists(id) on delete set null,

  mailed_at timestamptz not null default now(),
  pieces int not null default 1,

  created_at timestamptz not null default now()
);

create index if not exists mailings_org_id_idx on public.mailings(org_id);
create index if not exists mailings_job_id_idx on public.mailings(job_id);
create index if not exists mailings_recipient_id_idx on public.mailings(recipient_id);
create index if not exists mailings_mailed_at_idx on public.mailings(mailed_at);

-- Prevent double-counting when ingesting the same list twice.
create unique index if not exists mailings_list_recipient_uq
  on public.mailings(mailing_list_id, recipient_id)
  where mailing_list_id is not null;

alter table public.mailings enable row level security;

drop policy if exists mailings_select on public.mailings;
create policy mailings_select on public.mailings
for select
to authenticated
using (
  public.is_master_admin()
  or public.can_access_job(job_id)
);

drop policy if exists mailings_insert on public.mailings;
create policy mailings_insert on public.mailings
for insert
to authenticated
with check (
  public.is_master_admin()
  or public.can_access_job(job_id)
);

drop policy if exists mailings_update on public.mailings;
create policy mailings_update on public.mailings
for update
to authenticated
using (
  public.is_master_admin()
  or public.can_access_job(job_id)
)
with check (
  public.is_master_admin()
  or public.can_access_job(job_id)
);

drop policy if exists mailings_delete on public.mailings;
create policy mailings_delete on public.mailings
for delete
to authenticated
using (
  public.is_master_admin()
  or public.can_access_job(job_id)
);

-- =========================
-- Storage bucket for demographics CSV
-- =========================
-- Create private bucket (safe to rerun)
insert into storage.buckets (id, name, public)
values ('job-demographics', 'job-demographics', false)
on conflict (id) do nothing;

-- RLS for storage.objects is enabled by default in Supabase.
-- Policies below assume objects are stored under:
--   orgs/<org_uuid>/jobs/<job_uuid>/demographics/<file>.csv

drop policy if exists job_demographics_read on storage.objects;
create policy job_demographics_read on storage.objects
for select
to authenticated
using (
  bucket_id = 'job-demographics'
  and (
    public.is_master_admin()
    or public.is_org_member(
      (substring(name from 'orgs/([0-9a-fA-F\\-]{36})/'))::uuid
    )
  )
);

drop policy if exists job_demographics_write on storage.objects;
create policy job_demographics_write on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'job-demographics'
  and (
    public.is_master_admin()
    or public.is_org_member(
      (substring(name from 'orgs/([0-9a-fA-F\\-]{36})/'))::uuid
    )
  )
);

drop policy if exists job_demographics_update on storage.objects;
create policy job_demographics_update on storage.objects
for update
to authenticated
using (
  bucket_id = 'job-demographics'
  and (
    public.is_master_admin()
    or public.is_org_member(
      (substring(name from 'orgs/([0-9a-fA-F\\-]{36})/'))::uuid
    )
  )
)
with check (
  bucket_id = 'job-demographics'
  and (
    public.is_master_admin()
    or public.is_org_member(
      (substring(name from 'orgs/([0-9a-fA-F\\-]{36})/'))::uuid
    )
  )
);

drop policy if exists job_demographics_delete on storage.objects;
create policy job_demographics_delete on storage.objects
for delete
to authenticated
using (
  bucket_id = 'job-demographics'
  and (
    public.is_master_admin()
    or public.is_org_member(
      (substring(name from 'orgs/([0-9a-fA-F\\-]{36})/'))::uuid
    )
  )
);

commit;
