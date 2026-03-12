-- ========================================================
-- DATA TOLL FUNCTION
-- Checks if the active user has any past campaigns where 
-- the meeting date has passed the grace period, but no 
-- ROI report has been filed yet.
-- ========================================================

create or replace function public.get_data_toll_violations()
returns json
language plpgsql
security definer
as $$
declare
  v_user_id uuid := auth.uid();
  v_violation_count int;
  v_violating_jobs json;
begin
  select 
    count(j.id),
    coalesce(json_agg(
      json_build_object(
        'job_id', j.id, 
        'title', j.title, 
        'starts_at', jm.starts_at, 
        'grace_period_days', os.post_meeting_grace_period_days
      )
    ), '[]'::json)
  into 
    v_violation_count,
    v_violating_jobs
  from public.jobs j
  join public.job_meetings jm on jm.job_id = j.id
  join public.org_settings os on os.org_id = j.org_id
  left join public.job_roi_reports r on r.job_id = j.id
  where j.created_by_user_id = v_user_id
    and r.id is null
    and jm.starts_at is not null
    and jm.starts_at < (now() - make_interval(days => os.post_meeting_grace_period_days));

  if v_violation_count > 0 then
    return json_build_object(
      'locked', true,
      'violation_count', v_violation_count,
      'violating_jobs', v_violating_jobs,
      'message', 'You have ' || v_violation_count || ' past campaign(s) missing an ROI report.'
    );
  else
    return json_build_object(
      'locked', false,
      'violation_count', 0,
      'violating_jobs', '[]'::json,
      'message', 'All clear'
    );
  end if;
end;
$$;