-- ============================================================
-- Fix: ensure proper RLS policies on the `responders` table.
--
-- Root cause:
--   The responders table was created without explicit RLS policies.
--   If RLS was enabled in the environment (e.g., via Supabase default
--   settings), UPDATE operations silently returned 0 rows affected
--   with no error — the Supabase client never threw, so the bug was
--   invisible at the application layer.
--
-- This script:
--   1. Enables RLS (idempotent — safe if already on).
--   2. Drops and re-creates SELECT / INSERT / UPDATE / DELETE policies
--      using the existing can_access_job() helper so all three user
--      levels (advisor, fmo_admin, master_admin) work correctly.
--
-- Run in Supabase SQL editor:
--   Project: lccfprbtmsphesudrpqb
-- ============================================================

-- 1. Enable RLS
alter table public.responders enable row level security;

-- 2. SELECT — any authenticated user who can access the parent job
drop policy if exists responders_select on public.responders;
create policy responders_select on public.responders
for select
to authenticated
using (public.can_access_job(campaign_id));

-- 3. INSERT — any authenticated user who can access the parent job
drop policy if exists responders_insert on public.responders;
create policy responders_insert on public.responders
for insert
to authenticated
with check (public.can_access_job(campaign_id));

-- 4. UPDATE — any authenticated user who can access the parent job
--    (this was the missing policy causing silent save failures)
drop policy if exists responders_update on public.responders;
create policy responders_update on public.responders
for update
to authenticated
using  (public.can_access_job(campaign_id))
with check (public.can_access_job(campaign_id));

-- 5. DELETE — master admin or job owner/org member
drop policy if exists responders_delete on public.responders;
create policy responders_delete on public.responders
for delete
to authenticated
using (public.is_master_admin() or public.can_access_job(campaign_id));
