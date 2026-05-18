-- ============================================================
-- Fix: allow org members (advisors) to read job_meetings
-- and related job-scoped tables for their own org's jobs.
--
-- Root cause:
--   can_access_job() only passed for is_master_admin(),
--   is_fmo_admin(), or created_by_user_id = auth.uid().
--   Advisors (role='advisor'|'member') were excluded, so
--   job_meetings returned 0 rows → no meeting cards shown,
--   responders appeared unassigned (no matching event objects).
--
-- Run in Supabase SQL editor:
--   Project: lccfprbtmsphesudrpqb
-- ============================================================

-- 1. Update can_access_job to include is_org_member
--    is_org_member checks org_members.user_id = auth.uid() for any role.
create or replace function public.can_access_job(p_job_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_master_admin()
    or exists (
      select 1
      from public.jobs j
      where j.id = p_job_id
        and (
          public.is_fmo_admin(j.org_id)
          or public.is_org_member(j.org_id)
          or j.created_by_user_id = auth.uid()
        )
    );
$$;

-- 2. Also update jobs_select policy to include is_org_member
--    (already done in supabase_fix_kevin_job_rls.sql if you ran that,
--     but repeated here for idempotent completeness)
drop policy if exists jobs_select on public.jobs;

create policy jobs_select on public.jobs
for select to authenticated
using (
  public.is_master_admin()
  or public.is_fmo_admin(org_id)
  or public.is_org_member(org_id)
  or created_by_user_id = auth.uid()
);
