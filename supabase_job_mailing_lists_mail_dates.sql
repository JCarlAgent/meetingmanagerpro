-- Migration: Add planned mail date fields to job_mailing_lists
-- Safe to run multiple times (IF NOT EXISTS).

alter table public.job_mailing_lists
  add column if not exists planned_mail_date          date    null,
  add column if not exists planned_mail_date_is_override boolean not null default false;

comment on column public.job_mailing_lists.planned_mail_date is
  'Recommended mail drop date, calculated from first event date. Nullable until a first event exists.';

comment on column public.job_mailing_lists.planned_mail_date_is_override is
  'True when the planned_mail_date was manually set by a user, overriding the auto-calculated value.';
