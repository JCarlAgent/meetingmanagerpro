-- ============================================================
-- Responders Duplicate Detection & Cleanup
-- Project: lccfprbtmsphesudrpqb  (MeetingManagerPRO-DB)
--
-- BACKGROUND
-- ----------
-- The TeleDirect importer deduplicates within (campaign_id + event_id).
-- This means:
--   • The same person re-imported against a different event_id creates two rows.
--   • Before phone normalization was added (commit 131cae5), phones were stored
--     as "(702) 555-1234" — now they are stored as "7025551234".  A re-import
--     after the fix creates a new row that doesn't match the old formatted one.
--   • Guest rows can be accidentally imported twice if "Replace existing" was
--     not checked on a retry.
--
-- HOW TO USE THIS FILE
-- --------------------
-- 1. Run the DETECTION queries (Section 1–5) in the Supabase SQL editor.
--    Review the output carefully.
-- 2. Cross-reference Section 6 (score ranking) — the top-ranked row per group
--    is the one to KEEP.
-- 3. Only after you are confident in the results, uncomment and run the
--    DELETE statements in Section 7.
--
-- COLUMN REFERENCE (responders table)
-- ------------------------------------
--   id, campaign_id, event_id
--   first_name, last_name, phone, email, address, city, state, zip
--   guests, guest_name, response_source
--   status, confirmed, attended, notes
--   matched_to_mail_list, match_confidence
--   age, income, ipa
--   lat, lng
--   created_at, updated_at
-- ============================================================


-- ============================================================
-- SECTION 0 — Convenience: find Kevin's campaign_id
-- ============================================================
-- Replace 'Kevin' with whatever name or job reference you use.
-- Copy the id from the result and paste it into the queries below.

select
  id          as campaign_id,
  created_at,
  (notes::text)
from public.jobs
where notes::text ilike '%kevin%'
   or id::text ilike '%kevin%'
order by created_at desc
limit 10;

-- ─── PASTE YOUR campaign_id HERE ─────────────────────────────
-- Change this value before running any of the queries below.
-- Every query below references this variable via a CTE so you
-- only need to change it in one place.

-- ============================================================
-- SECTION 1 — Exact duplicates within same event
--             (campaign_id + event_id + normalized phone)
--
-- What to look for: count > 1 means the same phone appeared
-- twice for the same meeting — a clear double-import.
-- ============================================================

with campaign as (select '<PASTE_CAMPAIGN_ID>'::uuid as id)

select
  r.campaign_id,
  r.event_id,
  r.phone,
  count(*)                                 as dup_count,
  array_agg(r.id order by r.created_at)   as ids,
  array_agg(r.first_name)                 as first_names,
  array_agg(r.last_name)                  as last_names,
  array_agg(r.status)                     as statuses,
  array_agg(r.guests)                     as guests,
  array_agg(r.created_at order by r.created_at) as created_ats
from public.responders r
join campaign c on r.campaign_id = c.id
where r.phone is not null
group by r.campaign_id, r.event_id, r.phone
having count(*) > 1
order by dup_count desc, r.event_id, r.phone;


-- ============================================================
-- SECTION 2 — Same person across different events
--             (campaign_id + phone — ignoring event_id)
--
-- What to look for: same phone in two different event_ids.
-- May be legitimate (person re-registered for a different date)
-- OR an accidental re-import against the wrong event.
-- Review event_ids carefully — if the same event name just has
-- two UUIDs, that's the problem.
-- ============================================================

with campaign as (select '<PASTE_CAMPAIGN_ID>'::uuid as id)

select
  r.campaign_id,
  r.phone,
  count(distinct r.event_id)               as event_count,
  count(*)                                 as total_rows,
  array_agg(distinct r.event_id)           as event_ids,
  array_agg(r.id order by r.created_at)   as ids,
  array_agg(r.first_name)                 as first_names,
  array_agg(r.last_name)                  as last_names,
  array_agg(r.status)                     as statuses,
  array_agg(r.guests)                     as guests,
  array_agg(r.created_at order by r.created_at) as created_ats
from public.responders r
join campaign c on r.campaign_id = c.id
where r.phone is not null
group by r.campaign_id, r.phone
having count(distinct r.event_id) > 1
order by total_rows desc, r.phone;


-- ============================================================
-- SECTION 3 — Name + zip duplicates (catches phone-format drift)
--             (campaign_id + lower(first_name) + lower(last_name) + zip)
--
-- What to look for: same name+zip with different phone strings
-- "(702) 555-1234" vs "7025551234" — old pre-normalization rows.
-- ============================================================

with campaign as (select '<PASTE_CAMPAIGN_ID>'::uuid as id)

select
  r.campaign_id,
  lower(r.first_name)                      as first_name_lc,
  lower(r.last_name)                       as last_name_lc,
  r.zip,
  count(*)                                 as dup_count,
  array_agg(r.id order by r.created_at)   as ids,
  array_agg(r.phone)                       as phones,
  array_agg(r.event_id)                    as event_ids,
  array_agg(r.status)                      as statuses,
  array_agg(r.created_at order by r.created_at) as created_ats
from public.responders r
join campaign c on r.campaign_id = c.id
where r.first_name is not null
  and r.last_name  is not null
  and r.zip        is not null
group by r.campaign_id, lower(r.first_name), lower(r.last_name), r.zip
having count(*) > 1
order by dup_count desc, lower(r.last_name);


-- ============================================================
-- SECTION 4 — Name + address + zip (most precise)
--             Catches cases where zip is missing but address matches.
-- ============================================================

with campaign as (select '<PASTE_CAMPAIGN_ID>'::uuid as id)

select
  r.campaign_id,
  lower(r.first_name)                      as first_name_lc,
  lower(r.last_name)                       as last_name_lc,
  lower(r.address)                         as address_lc,
  r.zip,
  count(*)                                 as dup_count,
  array_agg(r.id order by r.created_at)   as ids,
  array_agg(r.phone)                       as phones,
  array_agg(r.event_id)                    as event_ids,
  array_agg(r.status)                      as statuses,
  array_agg(r.created_at order by r.created_at) as created_ats
from public.responders r
join campaign c on r.campaign_id = c.id
where r.first_name is not null
  and r.last_name  is not null
  and r.address    is not null
group by r.campaign_id, lower(r.first_name), lower(r.last_name), lower(r.address), r.zip
having count(*) > 1
order by dup_count desc, lower(r.last_name);


-- ============================================================
-- SECTION 5 — Old-format phone detection
--             Shows rows whose phone contains non-digit characters
--             (i.e., from before normalization was deployed).
--             These may have been re-imported as new rows rather
--             than matched as updates.
-- ============================================================

with campaign as (select '<PASTE_CAMPAIGN_ID>'::uuid as id)

select
  r.id,
  r.first_name,
  r.last_name,
  r.phone                                  as raw_phone,
  regexp_replace(r.phone, '\D', '', 'g')   as normalized_phone,
  r.event_id,
  r.status,
  r.guests,
  r.created_at
from public.responders r
join campaign c on r.campaign_id = c.id
where r.phone is not null
  and r.phone ~ '[^0-9]'   -- contains a non-digit character
order by r.last_name, r.first_name;


-- ============================================================
-- SECTION 6 — Full detail view of ALL suspected duplicates
--             with enrichment score for keep/delete decision
--
-- Run this after identifying which duplicate groups exist from
-- sections 1-5. The score column tells you which row to KEEP.
--
-- Score breakdown (higher = more enriched = keep this row):
--   +4  matched_to_mail_list = true
--   +3  match_confidence is not null
--   +2  age is not null
--   +2  income is not null
--   +2  ipa is not null
--   +2  lat is not null (geocoded)
--   +2  guest_name is not null
--   +3  status = 'registered'  (vs waitlist/cancelled/null)
--   +1  attended = true
--   +1  confirmed = true
--   +1  notes is not null
-- (highest score = keep; lowest score = candidate for deletion)
-- ============================================================

with campaign as (select '<PASTE_CAMPAIGN_ID>'::uuid as id),

-- Step 1: find all phones that appear more than once across the campaign
dup_phones as (
  select phone
  from public.responders r
  join campaign c on r.campaign_id = c.id
  where r.phone is not null
  group by r.phone
  having count(*) > 1
),

-- Step 2: also find all name+zip combos that appear more than once
dup_names as (
  select lower(first_name) as fn, lower(last_name) as ln, zip
  from public.responders r
  join campaign c on r.campaign_id = c.id
  where r.first_name is not null and r.last_name is not null and r.zip is not null
  group by lower(first_name), lower(last_name), zip
  having count(*) > 1
),

-- Step 3: union all suspected duplicate rows with enrichment score
scored as (
  select
    r.id,
    r.campaign_id,
    r.event_id,
    r.first_name,
    r.last_name,
    r.phone,
    r.email,
    r.address,
    r.city,
    r.state,
    r.zip,
    r.status,
    r.guests,
    r.guest_name,
    r.confirmed,
    r.attended,
    r.matched_to_mail_list,
    r.match_confidence,
    r.age,
    r.income,
    r.ipa,
    r.lat,
    r.lng,
    r.notes,
    r.created_at,
    r.updated_at,
    -- enrichment score
    (
      case when r.matched_to_mail_list = true       then 4 else 0 end +
      case when r.match_confidence is not null       then 3 else 0 end +
      case when r.age is not null                    then 2 else 0 end +
      case when r.income is not null                 then 2 else 0 end +
      case when r.ipa is not null                    then 2 else 0 end +
      case when r.lat is not null                    then 2 else 0 end +
      case when r.guest_name is not null             then 2 else 0 end +
      case when coalesce(r.status,'registered')
                  = 'registered'                     then 3 else 0 end +
      case when r.attended  = true                   then 1 else 0 end +
      case when r.confirmed = true                   then 1 else 0 end +
      case when r.notes is not null                  then 1 else 0 end
    )                                                as enrichment_score,
    -- group key for ranking (phone preferred; name+zip fallback)
    coalesce(
      r.phone,
      lower(r.first_name) || '|' || lower(r.last_name) || '|' || coalesce(r.zip,'')
    )                                                as dedup_key
  from public.responders r
  join campaign c on r.campaign_id = c.id
  where
    -- include any row whose phone matches a known duplicate
    r.phone in (select phone from dup_phones)
    or
    -- or whose name+zip matches a known duplicate name set
    (lower(r.first_name), lower(r.last_name), r.zip)
      in (select fn, ln, zip from dup_names)
),

-- Step 4: rank within each dedup group (highest score = rank 1 = KEEP)
ranked as (
  select
    *,
    row_number() over (
      partition by dedup_key
      order by
        enrichment_score desc,
        -- tie-break: prefer registered over waitlist/cancelled
        case coalesce(status,'registered')
          when 'registered' then 0
          when 'waitlist'   then 1
          else 2
        end,
        -- tie-break: prefer most recent row
        created_at desc
    ) as rank_in_group
  from scored
)

select
  rank_in_group,
  case when rank_in_group = 1 then '★ KEEP' else '✗ DELETE?' end as recommendation,
  id,
  event_id,
  first_name,
  last_name,
  phone,
  address,
  city,
  state,
  zip,
  status,
  guests,
  guest_name,
  confirmed,
  attended,
  matched_to_mail_list,
  match_confidence,
  age,
  income,
  ipa,
  lat,
  lng,
  enrichment_score,
  dedup_key,
  created_at,
  updated_at
from ranked
order by dedup_key, rank_in_group;


-- ============================================================
-- SECTION 7 — CLEANUP  ❌ DO NOT RUN UNTIL YOU HAVE REVIEWED
--             SECTION 6 OUTPUT AND CONFIRMED THE IDs TO DELETE
--
-- Strategy:
--   - Delete only rank_in_group > 1 rows from Section 6.
--   - Do NOT delete across different event_ids unless you are
--     100% certain it is the same accidental re-import.
--   - Copy the exact UUIDs from the Section 6 output into the
--     list below. Never delete by pattern alone.
--
-- After cleanup, re-run Section 1-5 to confirm 0 duplicates.
-- ============================================================

/*  ██████████████████████████████████████████████████████████
    ██  DO NOT RUN THIS BLOCK UNTIL REVIEWED                ██
    ██████████████████████████████████████████████████████████

-- Paste the IDs of rows marked "✗ DELETE?" from Section 6 here.
-- These are the WEAKER rows (lower enrichment score).
-- The ★ KEEP rows are NOT listed here.

delete from public.responders
where id in (
  -- '<uuid-of-duplicate-1>',
  -- '<uuid-of-duplicate-2>',
  -- '<uuid-of-duplicate-3>',
  -- add more as needed, one per line
  'REPLACE_WITH_ACTUAL_UUID'   -- placeholder — will error if left as-is
)
-- Safety guard: only delete from the specific campaign
and campaign_id = '<PASTE_CAMPAIGN_ID>';

    ██████████████████████████████████████████████████████████
    ██  END DO-NOT-RUN BLOCK                                ██
    ██████████████████████████████████████████████████████████
*/


-- ============================================================
-- SECTION 8 — Post-cleanup verification
--             Run after cleanup to confirm totals look right.
-- ============================================================

with campaign as (select '<PASTE_CAMPAIGN_ID>'::uuid as id)

select
  r.event_id,
  coalesce(r.status, 'registered')         as status,
  count(*)                                 as responder_rows,
  sum(1 + coalesce(r.guests, 0))           as total_seats
from public.responders r
join campaign c on r.campaign_id = c.id
group by r.event_id, coalesce(r.status, 'registered')
order by r.event_id, status;

-- Expected result (Kevin campaign):
--   event 1  registered  ~40 rows  ~42 seats (Derek+guest on waitlist, so those 2 seats
--                                              come from the waitlist rows below)
--   event 1  waitlist     1 row     2 seats  (Derek + guest)
--   event 2  registered  ~29 rows  ~29 seats
--   Total registered + waitlist seats ≈ 71


-- ============================================================
-- SECTION 9 — Importer risk notes (read-only, no SQL)
-- ============================================================
--
-- Current dedup key in import-tsv.ts:
--   campaign_id + event_id + phone (normalized) + last_name (ilike)
--   Fallback: campaign_id + event_id + email
--
-- Risk 1: same person, different event_id
--   The importer only deduplicates WITHIN an event_id.
--   If the same TSV was imported twice against two different event_ids,
--   two rows are created. Section 2 above catches these.
--
-- Risk 2: old non-normalized phone rows
--   Before phone normalization, phones stored as "(702) 555-1234".
--   A re-import after the fix stored "7025551234" — no match found →
--   new INSERT instead of UPDATE. Section 5 + Section 3 catch these.
--
-- Risk 3: no database-level unique constraint
--   There is currently no UNIQUE constraint on the responders table.
--   Application code alone enforces deduplication, which is fragile.
--   A future safe constraint would be:
--
--   CREATE UNIQUE INDEX IF NOT EXISTS responders_dedup_idx
--     ON public.responders (campaign_id, event_id, phone, lower(last_name))
--     WHERE phone IS NOT NULL;
--
--   CREATE UNIQUE INDEX IF NOT EXISTS responders_dedup_email_idx
--     ON public.responders (campaign_id, event_id, email)
--     WHERE email IS NOT NULL;
--
--   DO NOT add these yet — run the dedup cleanup first or the
--   constraint creation will fail on existing duplicate rows.
