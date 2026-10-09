-- MeetingManagerPRO TeleDirect roster replacement (event-scoped, atomic)
-- Adds explicit guest-detail storage and a transactional replacement function.

BEGIN;

ALTER TABLE public.responders
  ADD COLUMN IF NOT EXISTS guest_details jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cancelled_guest_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_responders_campaign_event
  ON public.responders (campaign_id, event_id);

CREATE OR REPLACE FUNCTION public.replace_event_responders_from_teledirect(
  p_job_id uuid,
  p_event_id uuid,
  p_rows jsonb,
  p_actor_user_id uuid DEFAULT NULL,
  p_request_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before_count integer := 0;
  v_deleted_count integer := 0;
  v_inserted_count integer := 0;
  v_after_count integer := 0;
  v_rows_len integer := 0;
  v_active_attendees integer := 0;
  v_has_meeting integer := 0;
BEGIN
  IF p_job_id IS NULL OR p_event_id IS NULL THEN
    RAISE EXCEPTION 'job_id and event_id are required';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  v_rows_len := jsonb_array_length(p_rows);
  IF v_rows_len <= 0 THEN
    RAISE EXCEPTION 'p_rows cannot be empty';
  END IF;

  SELECT COUNT(1)
    INTO v_has_meeting
    FROM public.job_meetings jm
   WHERE jm.id = p_event_id
     AND jm.job_id = p_job_id;
  IF v_has_meeting = 0 THEN
    RAISE EXCEPTION 'event_id does not belong to job_id';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('teledirect-replace:' || p_event_id::text));

  SELECT COUNT(1)
    INTO v_before_count
    FROM public.responders r
   WHERE r.campaign_id = p_job_id
     AND r.event_id = p_event_id;

  DELETE FROM public.responders r
   WHERE r.campaign_id = p_job_id
     AND r.event_id = p_event_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  INSERT INTO public.responders (
    campaign_id,
    event_id,
    first_name,
    last_name,
    email,
    phone,
    guests,
    cancelled_guest_count,
    guest_name,
    guest_details,
    response_source,
    confirmed,
    attended,
    status,
    notes,
    created_at,
    updated_at
  )
  SELECT
    p_job_id,
    p_event_id,
    x.first_name,
    x.last_name,
    x.email,
    x.phone,
    GREATEST(COALESCE(x.guests, 0), 0),
    GREATEST(COALESCE(x.cancelled_guest_count, 0), 0),
    x.guest_name,
    COALESCE(x.guest_details, '[]'::jsonb),
    'call_center',
    true,
    false,
    COALESCE(NULLIF(lower(trim(x.status)), ''), 'registered'),
    x.notes,
    now(),
    now()
  FROM jsonb_to_recordset(p_rows) AS x(
    first_name text,
    last_name text,
    email text,
    phone text,
    guests integer,
    cancelled_guest_count integer,
    guest_name text,
    guest_details jsonb,
    status text,
    notes text
  );
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  IF v_inserted_count <> v_rows_len THEN
    RAISE EXCEPTION 'inserted count mismatch (% vs %)', v_inserted_count, v_rows_len;
  END IF;

  SELECT
    COUNT(1),
    COALESCE(SUM(
      CASE
        WHEN COALESCE(lower(trim(r.status)), 'registered') IN ('cancelled', 'canceled') THEN 0
        ELSE 1 + GREATEST(COALESCE(r.guests, 0), 0)
      END
    ), 0)
    INTO v_after_count, v_active_attendees
    FROM public.responders r
   WHERE r.campaign_id = p_job_id
     AND r.event_id = p_event_id;

  RETURN jsonb_build_object(
    'jobId', p_job_id,
    'eventId', p_event_id,
    'requestId', p_request_id,
    'actorUserId', p_actor_user_id,
    'beforeCount', v_before_count,
    'deletedCount', v_deleted_count,
    'insertedCount', v_inserted_count,
    'afterCount', v_after_count,
    'activeAttendees', v_active_attendees
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_event_responders_from_teledirect(uuid, uuid, jsonb, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replace_event_responders_from_teledirect(uuid, uuid, jsonb, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_event_responders_from_teledirect(uuid, uuid, jsonb, uuid, text) TO service_role;

COMMIT;
