-- Add a persisted "paid" marker for legacy campaigns
-- Run this in Supabase SQL editor.

alter table public.campaigns
  add column if not exists paid_at timestamptz;

create index if not exists idx_campaigns_paid_at on public.campaigns(paid_at);
