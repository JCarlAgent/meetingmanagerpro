-- Master admin bootstrap/fix
-- Run in the Supabase SQL editor for the PORTAL project.
-- This ensures the `is_master_admin()` RPC exists and works even if `master_admins` has RLS enabled.

begin;

create extension if not exists "pgcrypto";

-- Optional legacy table (email-based). Keep if you already use it.
create table if not exists public.admins (
  email text primary key,
  created_at timestamptz not null default now()
);

-- Canonical master list (user_id-based)
create table if not exists public.master_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.master_admins enable row level security;

-- IMPORTANT: make this SECURITY DEFINER so it can see master_admins even with RLS.
create or replace function public.is_master_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from public.master_admins ma where ma.user_id = auth.uid())
    or exists (select 1 from public.admins a where a.email = auth.email());
$$;

grant execute on function public.is_master_admin() to authenticated;

-- Policies for master_admins (optional; safe defaults)
-- Allow a user to see their own row, and master admins to see all.
drop policy if exists master_admins_select on public.master_admins;
create policy master_admins_select on public.master_admins
for select
to authenticated
using (user_id = auth.uid() or public.is_master_admin());

-- Only master admins can modify the list.
drop policy if exists master_admins_modify on public.master_admins;
create policy master_admins_modify on public.master_admins
for all
to authenticated
using (public.is_master_admin())
with check (public.is_master_admin());

commit;

-- After running this, add yourself as master admin using ONE of these:
-- 1) user-id based:
--    insert into public.master_admins(user_id) values ('YOUR_AUTH_USER_UUID') on conflict do nothing;
-- 2) email based:
--    insert into public.admins(email) values ('you@domain.com') on conflict do nothing;
