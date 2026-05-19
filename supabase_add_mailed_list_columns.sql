-- ============================================================
-- Add new columns to campaign_mailed_list_records for the
-- cleaned header-based AccuLeads CSV format.
--
-- Run in Supabase SQL editor for project: lccfprbtmsphesudrpqb
-- This is idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE public.campaign_mailed_list_records
  ADD COLUMN IF NOT EXISTS full_name        text DEFAULT NULL,  -- computed: first_name || ' ' || last_name
  ADD COLUMN IF NOT EXISTS address2         text DEFAULT NULL,  -- address2line
  ADD COLUMN IF NOT EXISTS zip4             text DEFAULT NULL,  -- 4-digit ZIP extension
  ADD COLUMN IF NOT EXISTS gender_code      text DEFAULT NULL,  -- e.g. M / F
  ADD COLUMN IF NOT EXISTS homeowner_flag1  text DEFAULT NULL,  -- e.g. Y / N
  ADD COLUMN IF NOT EXISTS length_residence text DEFAULT NULL,  -- years at address
  ADD COLUMN IF NOT EXISTS marital_status   text DEFAULT NULL,  -- e.g. M / S / D / W
  ADD COLUMN IF NOT EXISTS veh1_make_desc   text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS veh1_model_desc  text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS veh2_make_desc   text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS veh2_model_desc  text DEFAULT NULL;
