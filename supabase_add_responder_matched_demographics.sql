-- ============================================================
-- Add responder matched-demographic columns
-- Project: MeetingManagerPRO
-- Safe to run multiple times
-- ============================================================

alter table public.responders
  add column if not exists est_income_code   text,
  add column if not exists est_income_range  text,
  add column if not exists gender_code       text,
  add column if not exists homeowner_flag1   text,
  add column if not exists marital_status    text,
  add column if not exists length_residence  text,
  add column if not exists veh1_make_desc    text,
  add column if not exists veh1_model_desc   text,
  add column if not exists veh2_make_desc    text,
  add column if not exists veh2_model_desc   text,
  add column if not exists claritas_ipa_raw  text;
