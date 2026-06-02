-- ============================================================
-- Security hardening for v_job_meeting_rollup
-- Goal: make the view execute with invoker privileges so RLS on
-- underlying tables is respected for authenticated users.
-- ============================================================

begin;

do $$
begin
  if to_regclass('public.v_job_meeting_rollup') is not null then
    execute 'alter view public.v_job_meeting_rollup set (security_invoker = true)';
  end if;
end
$$;

commit;
