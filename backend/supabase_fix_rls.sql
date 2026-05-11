begin;
drop policy if exists orgs_update_contact on public.orgs;
create policy orgs_update_contact on public.orgs
for update
to authenticated
using (
  public.is_master_admin()
  or exists (
    select 1
    from public.org_members m
    where m.org_id = orgs.id
      and m.user_id = auth.uid()
  )
)
with check (
  public.is_master_admin()
  or exists (
    select 1
    from public.org_members m
    where m.org_id = orgs.id
      and m.user_id = auth.uid()
  )
);
commit;
