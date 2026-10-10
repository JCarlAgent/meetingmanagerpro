-- ============================================================
-- Explicit target-job -> master-source-job demographic links
-- Project: MeetingManagerPRO
-- STATUS: PREPARED FOR REVIEW. NOT APPLIED. Seeds no rows.
--
-- A target job (e.g. a meeting campaign's current responder job) may draw
-- demographic enrichment only from a source job (e.g. the purchased master
-- prospect job) that an administrator has explicitly linked here.
--
-- Composite foreign keys (job_id, org_id) guarantee that the link's org
-- matches both jobs' org. Deleting either job cascades its link rows, so the
-- Delete Job feature needs no change.
-- ============================================================

BEGIN;

-- Composite-FK target. Guarded so it can be re-run safely.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.jobs'::regclass AND conname = 'jobs_id_org_unique'
  ) THEN
    ALTER TABLE public.jobs ADD CONSTRAINT jobs_id_org_unique UNIQUE (id, org_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.job_demographic_sources (
  target_job_id      uuid NOT NULL,
  source_job_id      uuid NOT NULL,
  org_id             uuid NOT NULL,
  created_by_user_id uuid NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target_job_id, source_job_id),
  CONSTRAINT job_demographic_sources_distinct CHECK (target_job_id <> source_job_id),
  CONSTRAINT job_demographic_sources_target_fk
    FOREIGN KEY (target_job_id, org_id) REFERENCES public.jobs (id, org_id) ON DELETE CASCADE,
  CONSTRAINT job_demographic_sources_source_fk
    FOREIGN KEY (source_job_id, org_id) REFERENCES public.jobs (id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_job_demographic_sources_target
  ON public.job_demographic_sources (target_job_id);

-- Service role only. No client-facing policies are created.
ALTER TABLE public.job_demographic_sources ENABLE ROW LEVEL SECURITY;

COMMIT;
