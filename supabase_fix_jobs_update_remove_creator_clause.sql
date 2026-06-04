-- Migration: Remove creator-based UPDATE access on public.jobs
-- Purpose: ensure job updates require org membership (no creator-based bypass)
-- Run in Supabase SQL editor as a privileged (service) role. Idempotent.

BEGIN;

-- Drop existing update policy (if present)
DROP POLICY IF EXISTS jobs_update ON public.jobs;

-- Create stricter update policy: master admins OR org members only
CREATE POLICY jobs_update ON public.jobs
FOR UPDATE
TO authenticated
USING (
  public.is_master_admin()
  OR public.is_org_member(org_id)
)
WITH CHECK (
  public.is_master_admin()
  OR public.is_org_member(org_id)
);

COMMIT;

-- Verification queries (run after applying):
-- 1) Check policies on `jobs`:
-- SELECT policyname, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'jobs';

-- 2) Confirm the `jobs_update` policy shows the new condition:
-- SELECT policyname, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'jobs' AND policyname = 'jobs_update';

-- 3) Jobs created by non-members (sanity check):
-- SELECT j.id, j.job_number, j.org_id, j.created_by_user_id,
--   CASE WHEN EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = j.org_id AND m.user_id = j.created_by_user_id)
--     THEN 'CREATOR IS MEMBER' ELSE 'CREATOR NOT MEMBER OF JOB ORG' END AS creator_membership_status
-- FROM public.jobs j ORDER BY creator_membership_status, j.job_number;
