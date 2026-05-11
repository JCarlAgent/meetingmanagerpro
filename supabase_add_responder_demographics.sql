-- Ensure the responders table exists with all necessary columns
create table if not exists public.responders (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  event_id uuid,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  guests integer default 0,
  response_source text default 'qr_code',
  confirmed boolean default false,
  attended boolean default false,
  notes text,
  income text,
  age text,
  ipa text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- In case the table already existed but was just missing the new columns:
alter table public.responders
  add column if not exists income text,
  add column if not exists age text,
  add column if not exists ipa text;

