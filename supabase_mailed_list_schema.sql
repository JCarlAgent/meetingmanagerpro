-- ============================================================
-- MeetingsManagerPRO — Mailed List Import & Responder Enrichment
-- Run in Supabase SQL editor (project: lccfprbtmsphesudrpqb)
-- ============================================================

-- 1. Mailed-list records table
--    Stores every record from the client's uploaded CSV mailing list.
--    Layout based on 11240729_lay.txt (1-indexed columns):
--      1  Prefixtitle         → prefix_title
--      2  Individualname      → individual_name
--      3  Firstname           → first_name
--      5  Lastname            → last_name
--      6  Address             → address
--      8  City                → city
--      9  State               → state
--      10 Zip                 → zip
--      16 CLARITAS_IPA        → claritas_ipa
--      18 AGE_BAND            → age_band
--      31 EST_INCOME_CODE     → est_income_code
--      33 EST_INCOME_NARROW_RANGE → est_income_range
-- ============================================================

CREATE TABLE IF NOT EXISTS campaign_mailed_list_records (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id     text NOT NULL,          -- matches jobs.id / campaign.id
  prefix_title    text,
  individual_name text,
  first_name      text,
  last_name       text,
  address         text,
  city            text,
  state           text,
  zip             text,
  claritas_ipa    text,
  age_band        text,
  est_income_code text,
  est_income_range text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mailed_list_campaign     ON campaign_mailed_list_records (campaign_id);
CREATE INDEX IF NOT EXISTS idx_mailed_list_name_zip    ON campaign_mailed_list_records (campaign_id, lower(last_name), lower(first_name), zip);
CREATE INDEX IF NOT EXISTS idx_mailed_list_last_addr   ON campaign_mailed_list_records (campaign_id, lower(last_name));

-- Enable RLS (restrict to service role from API; frontend never reads this directly)
ALTER TABLE campaign_mailed_list_records ENABLE ROW LEVEL SECURITY;

-- Policy: only service-role API can access (Edge Functions use service key → bypasses RLS)
-- No client-facing policy needed unless you later expose this to the UI via Supabase client.


-- ============================================================
-- 2. Add enrichment columns to responders table
-- ============================================================

ALTER TABLE responders
  ADD COLUMN IF NOT EXISTS matched_to_mail_list boolean      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS match_confidence      text         DEFAULT NULL,  -- 'exact' | 'fuzzy' | 'none'
  ADD COLUMN IF NOT EXISTS mail_record_id        uuid         DEFAULT NULL REFERENCES campaign_mailed_list_records(id);

-- age, income, ipa columns (may already exist — ADD IF NOT EXISTS is safe)
ALTER TABLE responders
  ADD COLUMN IF NOT EXISTS age    text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS income text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ipa    text DEFAULT NULL;
