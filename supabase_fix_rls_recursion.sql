-- ============================================================
-- Fix: stack depth limit exceeded (code 54001) on job_meetings
-- Project: lccfprbtmsphesudrpqb
--
-- ROOT CAUSE — two independent recursion loops:
--
-- Loop A (direct self-reference on org_members):
--   is_org_member(p_org_id)
--     → SELECT FROM org_members (RLS enabled)
--     → org_members_select policy calls is_org_member(org_id)
--     → SELECT FROM org_members → ... ∞
--
-- Loop B (master_admins self-reference):
--   is_master_admin()
--     → SELECT FROM master_admins (RLS enabled)
--     → master_admins_select policy calls is_master_admin()
--     → SELECT FROM master_admins → ... ∞
--
-- Full trigger chain for Kevin querying job_meetings:
--   job_meetings_all RLS → can_access_job(job_id)
--     → SELECT FROM jobs (RLS) → jobs_select calls is_fmo_admin / is_org_member
--       → is_org_member → SELECT FROM org_members (RLS)
--         → org_members_select calls is_org_member → ∞  [Loop A]
--       OR → is_master_admin → SELECT FROM master_admins (RLS)
--         → master_admins_select calls is_master_admin → ∞  [Loop B]
--
-- FIX: Add SECURITY DEFINER + SET search_path = '' to all four helper
-- functions. SECURITY DEFINER makes each function execute with the
-- owner's privileges (bypassing RLS on the tables it directly queries),
-- breaking every recursive policy evaluation loop.
--
-- SECURITY RATIONALE:
--   All four functions only check auth.uid() / auth.email() for the
--   CURRENT authenticated user. They never expose other users' data.
--   SECURITY DEFINER here only removes RLS overhead on the lookup —
--   the access decision is still scoped strictly to the caller.
--
-- Run this in the Supabase SQL editor for project lccfprbtmsphesudrpqb.
-- This is idempotent — safe to run multiple times.
-- ============================================================

-- 1. is_master_admin()
--    Checks admins (by email) and master_admins (by user_id).
--    master_admins has RLS using is_master_admin() → Loop B.
--    SECURITY DEFINER bypasses that RLS.
create or replace function public.is_master_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.master_admins ma
      where ma.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.admins a
      where a.email = auth.email()
    );
$$;

grant execute on function public.is_master_admin() to authenticated;


-- 2. is_org_member(p_org_id)
--    Checks org_members for any role match on the given org.
--    org_members has RLS using is_org_member() → Loop A.
--    SECURITY DEFINER bypasses that RLS.
create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_members m
    where m.org_id = p_org_id
      and m.user_id = auth.uid()
  );
$$;

grant execute on function public.is_org_member(uuid) to authenticated;


-- 3. is_fmo_admin(p_org_id)
--    Checks org_members for fmo_admin or org_admin role.
--    Also queries org_members — same Loop A risk.
--    SECURITY DEFINER bypasses that RLS.
create or replace function public.is_fmo_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_members m
    where m.org_id = p_org_id
      and m.user_id = auth.uid()
      and m.role in ('fmo_admin', 'org_admin')
  );
$$;

grant execute on function public.is_fmo_admin(uuid) to authenticated;


-- 4. can_access_job(p_job_id)
--    Queries jobs (RLS enabled) then calls is_fmo_admin / is_org_member.
--    Without SECURITY DEFINER, querying jobs triggers jobs_select RLS
--    which calls the above helpers, re-entering the loop.
--    SECURITY DEFINER makes the jobs lookup bypass RLS; then the
--    helper calls (also SECURITY DEFINER) bypass org_members RLS.
create or replace function public.can_access_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
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

grant execute on function public.can_access_job(uuid) to authenticated;
