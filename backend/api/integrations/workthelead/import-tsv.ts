/**
 * POST /api/integrations/workthelead/import-tsv
 *
 * Master-admin only.
 * Accepts pasted TSV text from a TeleDirect export (.xls, tab-delimited).
 * Parses A (attendee) rows as primary responders; G (guest) rows increment the
 * guest count of the preceding A row.
 *
 * Body: {
 *   jobId:           string   — campaign ID
 *   eventId:         string   — which meeting these attendees belong to
 *   tsv:             string   — full TSV text including header row
 *   replaceExisting: boolean  — if true, DELETE existing responders for this
 *                               campaign_id+event_id before inserting (full refresh)
 * }
 *
 * Duplicate detection (INSERT vs UPDATE):
 *   Match key = campaign_id + event_id + phone + last_name  (case-insensitive)
 *   Fallback  = campaign_id + event_id + email              (email is person-unique)
 *
 * WHY phone+last_name (not phone alone):
 *   Household members share a phone number. Using phone alone collapses
 *   "John Smith" and "Mary Smith" into a single record — the exact bug that
 *   caused 28 TeleDirect attendees to appear as only 16 responders.
 *
 * Preserved on UPDATE (never overwritten):
 *   - attended (manually set by advisor post-event)
 *   - notes that start with "[ADVISOR]" prefix
 *   - matched_to_mail_list / match_confidence / mail_record_id
 *   - age / income / ipa (enrichment data)
 *
 * Returns: {
 *   ok, inserted, updated, skipped, total, rowsParsed,
 *   aRows, gRows, skippedReasons[],
 *   errors[]
 * }
 */
import { getSupabaseAdmin, requireUserIdFromAuthHeader } from '../../_lib/supabaseAdmin.js';

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

type TsvRow = Record<string, string>;

function parseTsv(text: string): TsvRow[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const nonEmpty = lines.filter(l => l.trim());
  if (nonEmpty.length < 2) return [];
  const headers = nonEmpty[0].split('\t').map(h => h.trim());
  return nonEmpty.slice(1).map(line => {
    const cells = line.split('\t');
    const row: TsvRow = {};
    headers.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
}

interface Primary {
  row: TsvRow;
  guests: number;
  guestName: string | null;  // full name from the G row, e.g. "Steve Jasnosz"
}

function groupByAttendee(rows: TsvRow[]): { primaries: Primary[]; aRows: number; gRows: number; unknownRows: number } {
  const primaries: Primary[] = [];
  let current: Primary | null = null;
  let aRows = 0, gRows = 0, unknownRows = 0;

  for (const row of rows) {
    const ag = (row['Attendee/Guest'] ?? '').trim().toUpperCase();
    if (ag === 'A') {
      if (current) primaries.push(current);
      current = { row, guests: 0, guestName: null };
      aRows++;
    } else if (ag === 'G') {
      if (current) {
        current.guests += 1;
        // Capture guest name from the G row (first match only — max 1 guest per reservation)
        if (!current.guestName) {
          const gFirst = (row['FirstName'] ?? '').trim();
          const gLast  = (row['LastName']  ?? '').trim();
          const full   = [gFirst, gLast].filter(Boolean).join(' ');
          if (full) current.guestName = full;
        }
      }
      // G rows without a preceding A row are counted but silently ignored
      gRows++;
    } else {
      unknownRows++;
    }
  }
  if (current) primaries.push(current);
  return { primaries, aRows, gRows, unknownRows };
}

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed' }); return; }

  let userId: string;
  try { userId = await requireUserIdFromAuthHeader(req); }
  catch { send(res, 401, { error: 'Unauthorized' }); return; }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: maRow } = await supabaseAdmin
    .from('master_admins').select('user_id').eq('user_id', userId).maybeSingle();
  if (!maRow?.user_id) { send(res, 403, { error: 'Master admin only' }); return; }

  let payload: any;
  try { payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { send(res, 400, { error: 'Invalid JSON body' }); return; }

  const { jobId, eventId, tsv, replaceExisting = false } = payload ?? {};
  if (!jobId || typeof tsv !== 'string' || !tsv.trim()) {
    send(res, 400, { error: 'jobId and tsv are required' }); return;
  }
  if (!eventId || typeof eventId !== 'string') {
    send(res, 400, { error: 'eventId is required — select a meeting before importing' }); return;
  }

  const rows = parseTsv(tsv);
  if (!rows.length) {
    send(res, 400, { error: 'No rows parsed — ensure paste includes the header row' }); return;
  }

  const { primaries, aRows, gRows, unknownRows } = groupByAttendee(rows);
  if (!primaries.length) {
    send(res, 400, {
      error: 'No Attendee (A) rows found — check the Attendee/Guest column',
      rowsParsed: rows.length,
      aRows, gRows, unknownRows,
      // Show first row's keys to help diagnose column name mismatch
      firstRowKeys: Object.keys(rows[0] ?? {}),
    });
    return;
  }

  // ── Replace mode: clear existing records first ────────────────────────────
  if (replaceExisting) {
    const { error: delErr } = await supabaseAdmin
      .from('responders')
      .delete()
      .eq('campaign_id', jobId)
      .eq('event_id', eventId);
    if (delErr) {
      send(res, 500, { error: `Failed to clear existing responders: ${delErr.message}` });
      return;
    }
  }

  let inserted = 0, updated = 0, skipped = 0;
  const errors: string[] = [];
  const skippedReasons: string[] = [];

  for (const { row, guests, guestName } of primaries) {
    const phone     = (row['PhoneNumber'] ?? '').trim() || null;
    const email     = (row['Email'] ?? '').trim().toLowerCase() || null;
    const firstName = (row['FirstName'] ?? '').trim() || null;
    const lastName  = (row['LastName'] ?? '').trim() || null;

    // Skip truly empty rows (no name, no phone, no email)
    if (!firstName && !lastName && !phone && !email) {
      skipped++;
      skippedReasons.push('Empty row (no name, phone, or email)');
      continue;
    }

    const noteParts = [
      row['Status']           ? `Status: ${row['Status']}` : '',
      row['TimeStamp']        ? `Timestamp: ${row['TimeStamp']}` : '',
      row['CreatedBy']        ? `CreatedBy: ${row['CreatedBy']}` : '',
      row['ConfirmationCall'] ? `Confirmation: ${row['ConfirmationCall']}` : '',
      row['Notes']            ? `Notes: ${row['Notes']}` : '',
      row['AdditionalNotes']  ? `AdditionalNotes: ${row['AdditionalNotes']}` : '',
    ].filter(Boolean).join(' | ');

    // Fields to write on both INSERT and UPDATE.
    // Intentionally excludes: attended, matched_to_mail_list, match_confidence,
    // mail_record_id, age, income, ipa — these are set by other workflows.
    const record: Record<string, any> = {
      campaign_id:     jobId,
      event_id:        eventId,
      first_name:      firstName,
      last_name:       lastName,
      phone,
      email,
      address:         (row['Address']  ?? '').trim() || null,
      city:            (row['City']     ?? '').trim() || null,
      state:           (row['State']    ?? '').trim() || null,
      zip:             (row['ZipCode']  ?? '').trim() || null,
      guests,
      guest_name:      guestName ?? null,
      response_source: 'call_center',
      confirmed:       true,
      status:          ((row['Status'] ?? '').trim().toLowerCase()) || 'registered',
      notes:           noteParts || null,
      updated_at:      new Date().toISOString(),
    };

    // ── Duplicate detection ───────────────────────────────────────────────────
    // Key = phone + last_name (case-insensitive). Two people in the same
    // household share a phone; their last names distinguish them.
    let existingId: string | null = null;

    if (phone && lastName) {
      const { data: byPhoneName } = await supabaseAdmin
        .from('responders')
        .select('id')
        .eq('campaign_id', jobId)
        .eq('event_id', eventId)
        .eq('phone', phone)
        .ilike('last_name', lastName)
        .maybeSingle();
      existingId = byPhoneName?.id ?? null;
    } else if (phone && !lastName) {
      // No last name — fall back to phone-only match (better than nothing)
      const { data: byPhone } = await supabaseAdmin
        .from('responders')
        .select('id')
        .eq('campaign_id', jobId)
        .eq('event_id', eventId)
        .eq('phone', phone)
        .maybeSingle();
      existingId = byPhone?.id ?? null;
    }

    if (!existingId && email) {
      // Email is person-unique — match on email alone is safe
      const { data: byEmail } = await supabaseAdmin
        .from('responders')
        .select('id')
        .eq('campaign_id', jobId)
        .eq('event_id', eventId)
        .eq('email', email)
        .maybeSingle();
      existingId = byEmail?.id ?? null;
    }

    if (existingId) {
      const { error } = await supabaseAdmin
        .from('responders')
        .update(record)
        .eq('id', existingId);
      if (error) {
        skipped++;
        const reason = `UPDATE ${firstName} ${lastName}: ${error.message}`;
        errors.push(reason);
        skippedReasons.push(reason);
      } else {
        updated++;
      }
    } else {
      const { error } = await supabaseAdmin
        .from('responders')
        .insert({ ...record, attended: false, created_at: new Date().toISOString() });
      if (error) {
        skipped++;
        const reason = `INSERT ${firstName} ${lastName}: ${error.message}`;
        errors.push(reason);
        skippedReasons.push(reason);
      } else {
        inserted++;
      }
    }
  }

  send(res, 200, {
    ok: true,
    inserted,
    updated,
    skipped,
    total:         primaries.length,
    rowsParsed:    rows.length,
    aRows,
    gRows,
    unknownRows,
    replaceMode:   replaceExisting,
    skippedReasons: skippedReasons.slice(0, 20),
    errors:         errors.slice(0, 20),
  });
}

