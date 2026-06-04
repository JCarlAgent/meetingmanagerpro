-- Add recipient_id and suppressed columns to campaign_mailed_list_records
-- Idempotent migration safe to run multiple times.

ALTER TABLE public.campaign_mailed_list_records
  ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES public.recipients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suppressed boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_cmlr_recipient_id ON public.campaign_mailed_list_records (recipient_id);
