/**
 * Master-admin only.
 * Accepts pasted TSV text from a TeleDirect export (.xls, actually tab-delimited).
 * Parses A (attendee) rows as primary responders; counts following G (guest) rows.
 * Inserts/updates responders for the given jobId with duplicate prevention.
 */
import { getSupabaseAdmin, requireUserIdFromAuthHeader } from '../../_lib/supabaseAdmin.js';

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
}

function groupByAttendee(rows: TsvRow[]): Primary[] {
  const primaries: Primary[] = [];
  let current: Primary | null = null;
  for (const row of rows) {
    const ag = (row['Attendee/Guest'] ?? '').trim().toUpperCase();
    if (ag === 'A') {
      if (current) primaries.push(current);
      current = { row, guests: 0 };
    } else if (ag === 'G' && current) {
      current.guests += 1;
    }
  }
  if (current) primaries.push(current);
  return primaries;
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

  const { jobId, tsv } = payload ?? {};
  if (!jobId || typeof tsv !== 'string' || !tsv.trim()) {
    send(res, 400, { error: 'jobId and tsv are required' }); return;
  }

  const rows = parseTsv(tsv);
  if (!rows.length) {
    send(res, 400, { error: 'No rows parsed — ensure paste includes the header row' }); return;
  }

  const primaries = groupByAttendee(rows);
  if (!primaries.length) {
    send(res, 400, { error: 'No Attendee (A) rows found — check the Attendee/Guest column' }); return;
  }

  let inserted = 0, updated = 0, skipped = 0;
  const errors: string[] = [];

  for (const { row, guests } of primaries) {
    const phone = (row['PhoneNumber'] ?? '').trim() || null;
    const email = (row['Email'] ?? '').trim().toLowerCase() || null;

    const noteParts = [
      row['Status'] ? `Status: ${row['Status']}` : '',
      row['TimeStamp'] ? `Timestamp: ${row['TimeStamp']}` : '',
      row['CreatedBy'] ? `CreatedBy: ${row['CreatedBy']}` : '',
      row['ConfirmationCall'] ? `Confirmation: ${row['ConfirmationCall']}` : '',
      row['Notes'] ? `Notes: ${row['Notes']}` : '',
      row['AdditionalNotes'] ? `AdditionalNotes: ${row['AdditionalNotes']}` : '',
    ].filter(Boolean).join(' | ');

    const record: Record<string, any> = {
      campaign_id: jobId,
      event_id: null,
      first_name: (row['FirstName'] ?? '').trim() || null,
      last_name: (row['LastName'] ?? '').trim() || null,
      phone,
      email,
      address: (row['Address'] ?? '').trim() || null,
      city: (row['City'] ?? '').trim() || null,
      state: (row['State'] ?? '').trim() || null,
      zip: (row['ZipCode'] ?? '').trim() || null,
      guests,
      response_source: 'call_center',
      confirmed: true,
      attended: false,
      notes: noteParts || null,
      updated_at: new Date().toISOString(),
    };

    // Duplicate prevention: check by campaign_id+phone first, then campaign_id+email
    let existingId: string | null = null;
    if (phone) {
      const { data: byPhone } = await supabaseAdmin
        .from('responders').select('id')
        .eq('campaign_id', jobId).eq('phone', phone).maybeSingle();
      existingId = byPhone?.id ?? null;
    }
    if (!existingId && email) {
      const { data: byEmail } = await supabaseAdmin
        .from('responders').select('id')
        .eq('campaign_id', jobId).eq('email', email).maybeSingle();
      existingId = byEmail?.id ?? null;
    }

    if (existingId) {
      const { error } = await supabaseAdmin.from('responders').update(record).eq('id', existingId);
      if (error) { skipped++; errors.push(`UPDATE ${existingId}: ${error.message}`); }
      else { updated++; }
    } else {
      const { error } = await supabaseAdmin.from('responders')
        .insert({ ...record, created_at: new Date().toISOString() });
      if (error) { skipped++; errors.push(`INSERT ${row['FirstName']} ${row['LastName']}: ${error.message}`); }
      else { inserted++; }
    }
  }

  send(res, 200, {
    ok: true,
    inserted,
    updated,
    skipped,
    total: primaries.length,
    rowsParsed: rows.length,
    errors: errors.slice(0, 10), // cap error list
  });
}
