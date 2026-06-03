-- TeleDirect / Seminar Edge per-user credential storage
--
-- This table is intentionally NOT readable/writable from the browser.
-- Only server-side code using the Supabase Service Role should access it.

create table if not exists public.user_seminaredge_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username_enc text not null,
  password_enc text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_seminaredge_credentials enable row level security;

-- No RLS policies on purpose.
-- This prevents access via anon/auth keys from the frontend.
-- Serverless functions should use SUPABASE_SERVICE_ROLE_KEY to read/write.

create index if not exists user_seminaredge_credentials_updated_at_idx
  on public.user_seminaredge_credentials (updated_at);
