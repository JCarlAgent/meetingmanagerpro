-- Job stage initials/signoffs + stored setup summaries
--
-- Purpose:
-- - Allow advisors/FMO staff to initial each setup stage.
-- - Store a snapshot summary per stage for future review in the FMO dashboard.
--
-- Assumes you have already run:
-- - supabase_multitenant_jobs_mvp.sql
-- - supabase_rbac_three_levels_migration.sql

begin;

create table if not exists public.job_stage_signoffs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  stage text not null,
  initials text not null,
  signed_by_user_id uuid not null,
  signed_by_email text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint job_stage_signoffs_stage_check
    check (stage in ('locations','template','rsvp','demographics','finalize'))
);

create unique index if not exists job_stage_signoffs_job_stage_uq
  on public.job_stage_signoffs(job_id, stage);

create index if not exists job_stage_signoffs_org_id_idx
  on public.job_stage_signoffs(org_id);

drop trigger if exists trg_job_stage_signoffs_updated_at on public.job_stage_signoffs;
create trigger trg_job_stage_signoffs_updated_at
before update on public.job_stage_signoffs
for each row execute function public.set_updated_at();

alter table public.job_stage_signoffs enable row level security;

drop policy if exists job_stage_signoffs_select on public.job_stage_signoffs;
create policy job_stage_signoffs_select on public.job_stage_signoffs
for select
to authenticated
using (
  public.is_master_admin()
  or public.can_access_job(job_id)
);

drop policy if exists job_stage_signoffs_insert on public.job_stage_signoffs;
create policy job_stage_signoffs_insert on public.job_stage_signoffs
for insert
to authenticated
with check (
  public.can_access_job(job_id)
  and signed_by_user_id = auth.uid()
  and org_id = (select j.org_id from public.jobs j where j.id = job_id)
);

drop policy if exists job_stage_signoffs_update on public.job_stage_signoffs;
create policy job_stage_signoffs_update on public.job_stage_signoffs
for update
to authenticated
using (
  public.can_access_job(job_id)
)
with check (
  public.can_access_job(job_id)
  and signed_by_user_id = auth.uid()
  and org_id = (select j.org_id from public.jobs j where j.id = job_id)
);

drop policy if exists job_stage_signoffs_delete on public.job_stage_signoffs;
create policy job_stage_signoffs_delete on public.job_stage_signoffs
for delete
to authenticated
using (
  public.is_master_admin()
);

commit;
