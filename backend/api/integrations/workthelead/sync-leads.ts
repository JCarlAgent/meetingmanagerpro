import { decryptString } from '../../_lib/crypto.js';
import { getSupabaseAdmin, requireUserIdFromAuthHeader } from '../../_lib/supabaseAdmin.js';

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/**
 * Simple XML lead parser.
 * Tries common TeleDirect record element tag names, then extracts child text fields.
 * Returns an array of plain string→string records.
 */
function parseXmlLeads(xml: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];

  // Try these tag names in order for the repeating record element
  const containerCandidates = ['Lead', 'Record', 'Row', 'Responder', 'Item', 'Reservation', 'Caller'];
  let containerTag = '';
  for (const tag of containerCandidates) {
    if (new RegExp(`<${tag}[\\s>]`, 'i').test(xml) || new RegExp(`<${tag}>`, 'i').test(xml)) {
      containerTag = tag;
      break;
    }
  }
  if (!containerTag) return records;

  const recordRegex = new RegExp(`<${containerTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${containerTag}>`, 'gi');
  let match;
  while ((match = recordRegex.exec(xml)) !== null) {
    const block = match[1];
    const record: Record<string, string> = {};
    const fieldRegex = /<([A-Za-z_][A-Za-z0-9_]*)(?:\s[^>]*)?>([^<]*)<\/\1>/g;
    let fm;
    while ((fm = fieldRegex.exec(block)) !== null) {
      record[fm[1]] = fm[2].trim();
    }
    if (Object.keys(record).length > 0) records.push(record);
  }
  return records;
}

/**
 * Case-insensitive field getter with multiple fallback key names.
 */
function getField(record: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const entry = Object.entries(record).find(([k]) => k.toLowerCase() === key.toLowerCase());
    if (entry && entry[1]) return entry[1];
  }
  return '';
}

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    send(res, 405, { error: 'Method not allowed' });
    return;
  }

  let userId: string;
  try {
    userId = await requireUserIdFromAuthHeader(req);
  } catch {
    send(res, 401, { error: 'Unauthorized' });
    return;
  }

  let payload: any;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    send(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  const jobId = (payload?.jobId ?? '').toString().trim();
  const campaignId = (payload?.campaignId ?? '').toString().trim();

  if (!jobId) {
    send(res, 400, { error: 'jobId is required' });
    return;
  }
  if (!campaignId) {
    send(res, 400, { error: 'campaignId is required' });
    return;
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    // Load saved TeleDirect credentials for this user
    const { data: credsData, error: credsError } = await supabaseAdmin
      .from('user_workthelead_credentials')
      .select('username_enc,password_enc')
      .eq('user_id', userId)
      .maybeSingle();

    if (credsError) {
      send(res, 500, { error: 'Failed to read credentials' });
      return;
    }
    if (!credsData?.username_enc || !credsData?.password_enc) {
      send(res, 400, { error: 'No TeleDirect credentials saved. Save credentials in Settings first.' });
      return;
    }

    const username = decryptString(credsData.username_enc);
    const password = decryptString(credsData.password_enc);

    // Call TeleDirect get_Leads.asp
    const baseUrl = 'https://client.teledirect.com/workthelead/api';
    const url = `${baseUrl}/get_Leads.asp?UserName=${encodeURIComponent(username)}&Password=${encodeURIComponent(password)}&CampaignID=${encodeURIComponent(campaignId)}`;

    const resp = await fetch(url, { method: 'GET' });
    const text = await resp.text();

    if (!resp.ok) {
      send(res, 502, { error: `TeleDirect returned HTTP ${resp.status}` });
      return;
    }

    // Parse XML into flat records
    const records = parseXmlLeads(text);

    // Always return the first raw record and field names so the admin can
    // verify the mapping if leads don't appear as expected.
    const rawFirstRecord = records[0] ?? null;
    const fieldNames = rawFirstRecord ? Object.keys(rawFirstRecord) : [];

    if (records.length === 0) {
      send(res, 200, {
        ok: true,
        inserted: 0,
        updated: 0,
        skipped: 0,
        total: 0,
        message: 'No leads found in TeleDirect response. Check the Campaign ID.',
        fieldNames,
        rawFirstRecord,
      });
      return;
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const record of records) {
      // Map TeleDirect fields → responders columns using multiple possible names
      const firstName = getField(record, 'FirstName', 'First_Name', 'FName', 'firstname');
      const lastName  = getField(record, 'LastName',  'Last_Name',  'LName', 'lastname');
      const phone     = getField(record, 'Phone', 'PhoneNumber', 'Phone1', 'HomePhone', 'CellPhone', 'phone_number', 'PhoneNum');
      const email     = getField(record, 'Email', 'EmailAddress', 'email_address', 'EmailAddr');
      const address   = getField(record, 'Address', 'Address1', 'StreetAddress', 'Addr', 'Addr1');
      const city      = getField(record, 'City');
      const state     = getField(record, 'State', 'St', 'StateCode');
      const zip       = getField(record, 'Zip', 'ZipCode', 'PostalCode', 'Zip5', 'ZipCode5');
      const guestsRaw = getField(record, 'Guests', 'NumGuests', 'GuestCount', 'PartySize', 'AdditionalGuests', 'Party', 'TotalGuests');
      const guests    = guestsRaw ? (parseInt(guestsRaw, 10) || 0) : 0;

      // Skip records with no identifying information whatsoever
      if (!firstName && !lastName && !phone && !email) {
        skipped++;
        continue;
      }

      // --- Duplicate prevention ---
      // Strategy: look for existing responder in same campaign by phone, then email.
      // No external_id column exists, so we use best available unique contact key.
      let existingId: string | null = null;

      if (phone) {
        const { data: found } = await supabaseAdmin
          .from('responders')
          .select('id')
          .eq('campaign_id', jobId)
          .eq('phone', phone)
          .maybeSingle();
        if (found?.id) existingId = found.id;
      }

      if (!existingId && email) {
        const { data: found } = await supabaseAdmin
          .from('responders')
          .select('id')
          .eq('campaign_id', jobId)
          .eq('email', email)
          .maybeSingle();
        if (found?.id) existingId = found.id;
      }

      const row: Record<string, any> = {
        campaign_id:     jobId,
        first_name:      firstName,
        last_name:       lastName,
        phone:           phone || '',
        email:           email || '',
        address:         address || '',
        city:            city || '',
        state:           state || '',
        zip:             zip || '',
        guests,
        response_source: 'call_center',
        confirmed:       true,
        attended:        false,
        updated_at:      new Date().toISOString(),
      };

      if (existingId) {
        const { error } = await supabaseAdmin
          .from('responders')
          .update(row)
          .eq('id', existingId);
        if (!error) updated++;
        else skipped++;
      } else {
        const { error } = await supabaseAdmin
          .from('responders')
          .insert({ ...row, created_at: new Date().toISOString() });
        if (!error) inserted++;
        else skipped++;
      }
    }

    send(res, 200, {
      ok: true,
      inserted,
      updated,
      skipped,
      total: records.length,
      fieldNames,
      rawFirstRecord,
    });
  } catch (e: any) {
    send(res, 500, { error: e?.message || 'Server error' });
  }
}
