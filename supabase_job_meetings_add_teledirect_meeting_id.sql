-- Add the canonical TeleDirect Meeting ID for each job meeting.
ALTER TABLE public.job_meetings
  ADD COLUMN IF NOT EXISTS teledirect_meeting_id text;
