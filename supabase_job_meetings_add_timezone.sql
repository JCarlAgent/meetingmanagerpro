alter table public.job_meetings
  add column if not exists timezone text;

comment on column public.job_meetings.timezone is 'IANA timezone for venue-local meeting time, e.g. America/New_York';
