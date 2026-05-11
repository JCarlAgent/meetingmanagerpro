begin;
drop policy if exists orgs_update_contact on public.orgs;
create policy orgs_update_contact on public.orgs
for update
to authenticated
using (
  true
)
with check (
  true
);
commit;
