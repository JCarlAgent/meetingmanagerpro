-- MeetingManagerPRO 2.0 Foundation
--
-- Goals:
-- 1. Expand RBAC to 4 Tiers: Platform Admin -> Enterprise/FMO Admin -> Org Admin -> Advisor
-- 2. Establish Enterprise/Org settings for the "Data Toll" (Grace period for ROI reporting)
-- 3. Create ROI Reports schema to power the AI intent engine's memory
-- 4. Add 'pending_roi_report' to the job lifecycle

begin;

-- ========================================================
-- 1. HIERARCHY & RBAC UPDATES
-- ========================================================

-- Many systems handle hierarchy by allowing an organization to have a "parent".
-- If orgs.parent_org_id is null, it's an Enterprise/FMO. 
-- If it has a parent, it's a regional office / organization.
alter table public.orgs 
  add column if not exists parent_org_id uuid references public.orgs(id) on delete restrict;

-- Expand the roles in org_members.
-- We dynamically drop the constraint to prevent errors on existing instances.
do $$
declare
  v_name text;
begin
  select c.conname
    into v_name
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public'
     and t.relname = 'org_members'
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%role%in%'
   limit 1;

  if v_name is not null then
    execute format('alter table public.org_members drop constraint %I', v_name);
  end if;
end $$;

-- Roles: 
-- - 'enterprise_admin' (FMO / Print House God View)
-- - 'org_admin' (Local Office Manager)
-- - 'advisor' (Presenter)
alter table public.org_members
  add constraint org_members_role_check
  check (role in ('enterprise_admin', 'fmo_admin', 'org_admin', 'advisor'));

-- Upgrade fmo_admin to enterprise_admin for clarity (optional, kept both in constraint for backwards compatibility)
update public.org_members set role = 'enterprise_admin' where role = 'fmo_admin';


-- ========================================================
-- 2. ENTERPRISE SETTINGS & "DATA TOLL" COMPLIANCE GATE
-- ========================================================

create table if not exists public.org_settings (
    org_id uuid primary key references public.orgs(id) on delete cascade,
    -- Enforce the platform cap: between 1 and 7 days for the reporting grace period
    post_meeting_grace_period_days int not null default 3 check (post_meeting_grace_period_days between 1 and 7),
    ai_features_enabled boolean not null default true,
    updated_at timestamptz not null default now()
);

alter table public.org_settings enable row level security;

-- Only Enterprise/Org Admins or Master Admins can update their settings
drop policy if exists org_settings_select on public.org_settings;
create policy org_settings_select on public.org_settings
for select to authenticated
using (
    public.is_master_admin() 
    or exists (select 1 from public.org_members m where m.org_id = org_settings.org_id and m.user_id = auth.uid())
);

drop policy if exists org_settings_update on public.org_settings;
create policy org_settings_update on public.org_settings
for update to authenticated
using (
    public.is_master_admin() 
    or exists (select 1 from public.org_members m where m.org_id = org_settings.org_id and m.user_id = auth.uid() and m.role in ('enterprise_admin', 'org_admin'))
);


-- ========================================================
-- 3. JOB LIFECYCLE & ROI REPORTING
-- ========================================================

-- Safely add 'pending_roi_report' to the existing enum
alter type public.job_status add value if not exists 'pending_roi_report';
alter type public.job_status add value if not exists 'completed';

create table if not exists public.job_roi_reports (
    id uuid primary key default gen_random_uuid(),
    job_id uuid not null references public.jobs(id) on delete cascade unique,
    reported_by_user_id uuid references auth.users(id) on delete set null,
    
    -- The core data points the AI needs
    actual_attendees int not null,
    buying_units int not null,
    appointments_booked int,
    estimated_sales numeric(12, 2),
    
    -- Feedback signal for the AI
    venue_rating int check (venue_rating between 1 and 5),
    notes text,
    
    created_at timestamptz not null default now()
);

alter table public.job_roi_reports enable row level security;

-- RLS: Master Admin, Org Admins, and the Advisor who created the job can see the ROI
drop policy if exists job_roi_reports_select on public.job_roi_reports;
create policy job_roi_reports_select on public.job_roi_reports
for select to authenticated
using (
    public.is_master_admin()
    or exists (
        select 1 from public.jobs j
        left join public.org_members m on m.org_id = j.org_id and m.user_id = auth.uid()
        where j.id = job_roi_reports.job_id
        and (m.role in ('enterprise_admin', 'org_admin') or j.created_by_user_id = auth.uid())
    )
);

drop policy if exists job_roi_reports_insert on public.job_roi_reports;
create policy job_roi_reports_insert on public.job_roi_reports
for insert to authenticated
with check (
    public.is_master_admin()
    or exists (
        select 1 from public.jobs j
        where j.id = job_roi_reports.job_id
        and (j.created_by_user_id = auth.uid() or exists (
            select 1 from public.org_members m where m.org_id = j.org_id and m.user_id = auth.uid() and m.role in ('enterprise_admin', 'org_admin')
        ))
    )
);

-- When a report is submitted, we should automatically update the job status
create or replace function public.update_job_status_on_report()
returns trigger
language plpgsql security definer
as $$
begin
    update public.jobs 
    set status = 'completed', updated_at = now()
    where id = new.job_id;
    return new;
end;
$$;

drop trigger if exists trg_update_job_status_on_report on public.job_roi_reports;
create trigger trg_update_job_status_on_report
after insert on public.job_roi_reports
for each row execute function public.update_job_status_on_report();

commit;
