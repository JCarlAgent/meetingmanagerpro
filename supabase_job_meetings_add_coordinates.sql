-- Migration: add optional venue coordinate columns to job_meetings
-- Run once against the MeetingManagerPRO-DB Supabase project.
-- Safe to re-run: IF NOT EXISTS guards prevent duplicate-column errors.
-- No RLS changes required — the existing job_meetings_all policy covers new columns.

ALTER TABLE public.job_meetings
  ADD COLUMN IF NOT EXISTS venue_lat  double precision,
  ADD COLUMN IF NOT EXISTS venue_lng  double precision;
