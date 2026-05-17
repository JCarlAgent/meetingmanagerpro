import { decryptString } from '../../_lib/crypto.js';
import { getSupabaseAdmin, requireUserIdFromAuthHeader } from '../../_lib/supabaseAdmin.js';

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/**
 * Detect which repeating element tag contains leads in TeleDirect XML.
 * Returns { containerTag, allCandidatesFound } for diagnostics.
 */
function detectContainerTag(xml: string): { containerTag: string; allTagsFound: string[] } {
  // Scan ALL element tag names that appear more than once (repeating = record containers).
  const tagCounts: Record<string, number> = {};
  const tagRe = /<([A-Za-z][A-Za-z0-9_]*)[\s>]/g;
  let m;
  while ((m = tagRe.exec(xml)) !== null) {
    const t = m[1];
    tagCounts[t] = (tagCounts[t] ?? 0) + 1;
  }
  const repeating = Object.entries(tagCounts)
    .filter(([, count]) => count > 1)
    .map(([tag]) => tag);

  // Priority candidates — check exact tag name first (case-sensitive as found in XML)
  const priorityOrder = ['Lead', 'lead', 'Record', 'record', 'Row', 'row',
    'Reservation', 'reservation', 'Caller', 'caller', 'Responder', 'responder',
    'Item', 'item', 'Contact', 'contact', 'Response', 'response'];

  let containerTag = '';
  for (const tag of priorityOrder) {
    if (repeating.includes(tag)) { containerTag = tag; break; }
  }
  // Fallback: pick whichever repeating tag has the most occurrences (excluding root/wrapper tags)
  if (!containerTag && repeating.length > 0) {
    const rootCandidates = new Set(['xml', 'Leads', 'leads', 'Records', 'records',
      'Results', 'results', 'Root', 'root', 'Data', 'data', 'Response', 'Rows', 'rows']);
    const nonRoot = repeating.filter(t => !rootCandidates.has(t));
    if (nonRoot.length > 0) {
      containerTag = nonRoot.sort((a, b) => (tagCounts[b] ?? 0) - (tagCounts[a] ?? 0))[0];
    } else if (repeating.length > 0) {
      containerTag = repeating.sort((a, b) => (tagCounts[b] ?? 0) - (tagCounts[a] ?? 0))[0];
    }
  }
  return { containerTag, allTagsFound: Object.keys(tagCounts) };
}

/**
 * Parse TeleDirect XML leads into flat records.
 * Returns records plus diagnostics.
 */
function parseXmlLeads(xml: string): {
  records: Record<string, string>[];
  containerTag: string;
  allTagsFound: string[];
} {
  const { containerTag, allTagsFound } = detectContainerTag(xml);
  const records: Record<string, string>[] = [];

  if (!containerTag) return { records, containerTag: '', allTagsFound };

  // Match each record block — allow attributes on the opening tag
  const recordRegex = new RegExp(
    `<${containerTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${containerTag}>`,
    'gi'
  );
  let match;
  while ((match = recordRegex.exec(xml)) !== null) {
    const block = match[1];
    const record: Record<string, string> = {};

    // Extract child element text nodes (including CDATA)
    const fieldRegex = /<([A-Za-z_][A-Za-z0-9_.-]*)(?:\s[^>]*)?>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/\1>/g;
    let fm;
    while ((fm = fieldRegex.exec(block)) !== null) {
      const val = fm[2].trim();
      if (val) record[fm[1]] = val;
    }
    // Also capture empty elements as empty string so field names are visible
    const emptyFieldRe = /<([A-Za-z_][A-Za-z0-9_.-]*)(?:\s[^>]*)?\/>/g;
    let ef;
    while ((ef = emptyFieldRe.exec(block)) !== null) {
      if (!(ef[1] in record)) record[ef[1]] = '';
    }
    if (Object.keys(record).length > 0) records.push(record);
  }
  return { records, containerTag, allTagsFound };
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
    // syncDate: admin-supplied date as YYYY-MM-DD; defaults to today (UTC)
    const syncDateRaw = (payload?.syncDate ?? '').toString().trim();

    if (!jobId) {
      send(res, 400, { error: 'jobId is required' });
      return;
    }
    if (!campaignId) {
      send(res, 400, { error: 'campaignId is required' });
      return;
    }

    // Build MM/DD/YYYY from YYYY-MM-DD (or today if not supplied)
    let syncDateMDY: string;
    if (syncDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(syncDateRaw)) {
      const [y, mo, d] = syncDateRaw.split('-');
      syncDateMDY = `${mo}/${d}/${y}`;
    } else {
      const now = new Date();
      const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
      const d  = String(now.getUTCDate()).padStart(2, '0');
      const y  = now.getUTCFullYear();
      syncDateMDY = `${mo}/${d}/${y}`;
    }
    const fromDate = `${syncDateMDY} 00:00:00`;
    const toDate   = `${syncDateMDY} 23:59:59`;
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

    // Masked username for diagnostics — first 2 chars + *** + last 2 chars (or just *** if too short)
    const uLen = username?.length ?? 0;
    const usernamePreview = uLen >= 5
      ? `${username.slice(0, 2)}***${username.slice(-2)}`
      : uLen > 0 ? '***' : '(blank)';

    // Guard: catch a blank decrypt result before hitting TeleDirect
    if (!username || !username.trim()) {
      send(res, 500, {
        error: 'Decrypted username is blank in sync-leads route. Re-save credentials in Settings.',
        credentialUserId: userId,
        usernamePreview,
        hasUsername: false,
        hasPassword: !!password?.trim(),
      });
      return;
    }
    if (!password || !password.trim()) {
      send(res, 500, {
        error: 'Decrypted password is blank in sync-leads route. Re-save credentials in Settings.',
        credentialUserId: userId,
        usernamePreview,
        hasUsername: true,
        hasPassword: false,
      });
      return;
    }

      // POST form-encoded — TeleDirect requires FromDate/ToDate window < 25 hours
      const baseUrl = 'https://client.teledirect.com/workthelead/api';
      const postBody = [
        `UserName=${encodeURIComponent(username)}`,
        `Password=${encodeURIComponent(password)}`,
        `CampaignID=${encodeURIComponent(campaignId)}`,
        `FromDate=${encodeURIComponent(fromDate)}`,
        `ToDate=${encodeURIComponent(toDate)}`,
      ].join('&');
      const safeUrl = `${baseUrl}/get_Leads.asp [POST CampaignID=${encodeURIComponent(campaignId)} FromDate=${fromDate} ToDate=${toDate}]`;

      const resp = await fetch(`${baseUrl}/get_Leads.asp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: postBody,
      });
      const text = await resp.text();
      const httpStatus = resp.status;
      const normalized = text.replace(/\s+/g, ' ').trim();
      const looksXml = normalized.startsWith('<?xml') || normalized.startsWith('<');
      const rawPreview = normalized.slice(0, 2000);

      if (!resp.ok) {
        send(res, 502, {
          ok: false,
          error: `TeleDirect returned HTTP ${httpStatus}`,
          syncDate: syncDateMDY,
          fromDate,
          toDate,
          safeUrl,
          httpStatus,
          looksXml,
          rawPreview,
          credentialUserId: userId,
          usernamePreview,
          hasUsername: true,
          hasPassword: true,
        });
        return;
      }

      // Parse XML into flat records with full diagnostics
      const { records, containerTag, allTagsFound } = parseXmlLeads(text);

      const rawFirstRecord = records[0] ?? null;
      const fieldNames = rawFirstRecord ? Object.keys(rawFirstRecord) : [];

      if (records.length === 0) {
        send(res, 200, {
          ok: true,
          inserted: 0,
          updated: 0,
          skipped: 0,
          total: 0,
          syncDate: syncDateMDY,
          fromDate,
          toDate,
          safeUrl,
          httpStatus,
          looksXml,
          rawPreview,
          containerTag,
          allTagsFound,
          fieldNames,
          rawFirstRecord,
          credentialUserId: userId,
          usernamePreview,
          hasUsername: true,
          hasPassword: true,
          message: looksXml
            ? `XML received but 0 records parsed. Container tag: "${containerTag || 'none'}". Tags found: [${allTagsFound.join(', ')}].`
            : `TeleDirect did not return XML. Raw: ${rawPreview.slice(0, 300)}`,
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
        syncDate: syncDateMDY,
        fromDate,
        toDate,
        safeUrl,
        httpStatus,
        looksXml,
        containerTag,
        fieldNames,
        rawFirstRecord,
        credentialUserId: userId,
        usernamePreview,
        hasUsername: true,
        hasPassword: true,
      });
    } catch (e: any) {
      send(res, 500, { error: e?.message || 'Server error' });
    }
  }
