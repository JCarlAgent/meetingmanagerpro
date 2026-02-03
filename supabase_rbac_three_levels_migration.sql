-- RBAC migration: 3 admin levels (Advisor / FMO Admin / Master Admin)
--
-- Run AFTER `supabase_multitenant_jobs_mvp.sql`.
--
-- Goals:
-- - Advisors: can only access jobs/meetings/responses they created.
-- - FMO admins: can access everything in their org.
-- - Master admins: can access everything across orgs.
--
-- Notes:
-- - This migration is non-destructive; it tightens RLS policies.
-- - Master admins can be defined either by `public.admins(email)` (legacy) OR `public.master_admins(user_id)`.

begin;

-- Optional (but recommended): master admins by user_id
create table if not exists public.master_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.master_admins enable row level security;

-- Only master admins should see/manage this list
drop policy if exists master_admins_select on public.master_admins;
create policy master_admins_select on public.master_admins
for select
to authenticated
using (public.is_master_admin());

drop policy if exists master_admins_modify on public.master_admins;
create policy master_admins_modify on public.master_admins
for all
to authenticated
using (public.is_master_admin())
with check (public.is_master_admin());

-- Expand org role options to include advisor/fmo_admin
-- (existing installs likely have an auto-named CHECK constraint; drop it dynamically)
do $$
declare
  v_name text;
begin
  select c.conname
    into v_name
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public'
     and t.relname = 'org_members'
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%role%in%'
   limit 1;

  if v_name is not null then
    execute format('alter table public.org_members drop constraint %I', v_name);
  end if;
end $$;

alter table public.org_members
  add constraint org_members_role_check
  check (role in ('advisor','fmo_admin'));

-- Helpers
create or replace function public.is_master_admin()
returns boolean
language sql
stable
as $$
  select
    exists (
      select 1
      from public.master_admins ma
      where ma.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.admins a
      where a.email = auth.email()
    );
$$;

create or replace function public.is_fmo_admin(p_org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.org_members m
    where m.org_id = p_org_id
      and m.user_id = auth.uid()
      and m.role = 'fmo_admin'
  );
$$;

create or replace function public.can_access_job(p_job_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_master_admin()
    or exists (
      select 1
      from public.jobs j
      where j.id = p_job_id
        and (
          public.is_fmo_admin(j.org_id)
          or j.created_by_user_id = auth.uid()
        )
    );
$$;

-- RLS policy updates

-- jobs
alter table public.jobs enable row level security;

drop policy if exists jobs_select on public.jobs;
create policy jobs_select on public.jobs
for select
to authenticated
using (
  public.is_master_admin()
  or public.is_fmo_admin(org_id)
  or created_by_user_id = auth.uid()
);

drop policy if exists jobs_insert on public.jobs;
create policy jobs_insert on public.jobs
for insert
to authenticated
with check (
  public.is_master_admin()
  or (
    public.is_org_member(org_id)
    and created_by_user_id = auth.uid()
  )
);

drop policy if exists jobs_update on public.jobs;
create policy jobs_update on public.jobs
for update
to authenticated
using (
  public.is_master_admin()
  or public.is_fmo_admin(org_id)
  or created_by_user_id = auth.uid()
)
with check (
  public.is_master_admin()
  or public.is_fmo_admin(org_id)
  or created_by_user_id = auth.uid()
);

-- job_meetings
alter table public.job_meetings enable row level security;

drop policy if exists job_meetings_all on public.job_meetings;
create policy job_meetings_all on public.job_meetings
for all
to authenticated
using (public.can_access_job(job_id))
with check (public.can_access_job(job_id));

-- job_mailing_lists
alter table public.job_mailing_lists enable row level security;

drop policy if exists job_mailing_lists_all on public.job_mailing_lists;
create policy job_mailing_lists_all on public.job_mailing_lists
for all
to authenticated
using (public.can_access_job(job_id))
with check (public.can_access_job(job_id));

-- print_orders
alter table public.print_orders enable row level security;

drop policy if exists print_orders_all on public.print_orders;
create policy print_orders_all on public.print_orders
for all
to authenticated
using (public.can_access_job(job_id))
with check (public.can_access_job(job_id));

-- delivery_events (join via print_order)
alter table public.delivery_events enable row level security;

drop policy if exists delivery_events_all on public.delivery_events;
create policy delivery_events_all on public.delivery_events
for all
to authenticated
using (
  public.is_master_admin()
  or exists (
    select 1
    from public.print_orders po
    where po.id = delivery_events.print_order_id
      and public.can_access_job(po.job_id)
  )
)
with check (
  public.is_master_admin()
  or exists (
    select 1
    from public.print_orders po
    where po.id = delivery_events.print_order_id
      and public.can_access_job(po.job_id)
  )
);

-- responses
alter table public.responses enable row level security;

drop policy if exists responses_all on public.responses;
create policy responses_all on public.responses
for all
to authenticated
using (public.can_access_job(job_id))
with check (public.can_access_job(job_id));

-- response_notes (join via response)
alter table public.response_notes enable row level security;

drop policy if exists response_notes_all on public.response_notes;
create policy response_notes_all on public.response_notes
for all
to authenticated
using (
  public.is_master_admin()
  or exists (
    select 1
    from public.responses r
    where r.id = response_notes.response_id
      and public.can_access_job(r.job_id)
  )
)
with check (
  public.is_master_admin()
  or exists (
    select 1
    from public.responses r
    where r.id = response_notes.response_id
      and public.can_access_job(r.job_id)
  )
);

-- exports / rules remain org-scoped (FMO admin + master). Advisors can still view their own job exports via job_id if you want later.
-- For now: FMO admin can manage exports; advisors are excluded.

alter table public.export_rules enable row level security;
drop policy if exists export_rules_all on public.export_rules;
create policy export_rules_all on public.export_rules
for all
to authenticated
using (public.is_master_admin() or public.is_fmo_admin(org_id))
with check (public.is_master_admin() or public.is_fmo_admin(org_id));

alter table public.exports enable row level security;
drop policy if exists exports_all on public.exports;
create policy exports_all on public.exports
for all
to authenticated
using (public.is_master_admin() or public.is_fmo_admin(org_id))
with check (public.is_master_admin() or public.is_fmo_admin(org_id));

commit;
