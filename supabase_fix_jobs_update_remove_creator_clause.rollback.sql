-- Rollback: restore previous `jobs_update` policy that included created_by_user_id
-- Use only if you need to revert the migration.

BEGIN;

DROP POLICY IF EXISTS jobs_update ON public.jobs;

CREATE POLICY jobs_update ON public.jobs
FOR UPDATE
TO authenticated
USING (
  public.is_master_admin()
  OR public.is_fmo_admin(org_id)
  OR (created_by_user_id = auth.uid())
)
WITH CHECK (
  public.is_master_admin()
  OR public.is_fmo_admin(org_id)
  OR (created_by_user_id = auth.uid())
);

COMMIT;
