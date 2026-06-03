import { decryptString } from '../../_lib/crypto.js';
import { getSupabaseAdmin, requireUserIdFromAuthHeader } from '../../_lib/supabaseAdmin.js';

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 7 ? digits : null;
}

function stripXml(xml: string): string {
  return xml.replace(/\s+/g, ' ').trim();
}

function usernamePreview(u: string): string {
  if (!u) return '(blank)';
  if (u.length <= 4) return '***';
  return `${u.slice(0, 2)}***${u.slice(-2)}`;
}

function detectContainerTag(xml: string): { containerTag: string; allTagsFound: string[] } {
  const tagCounts: Record<string, number> = {};
  const tagRe = /<([A-Za-z][A-Za-z0-9_]*)[\s>]/g;
  let m: RegExpExecArray | null;

  while ((m = tagRe.exec(xml)) !== null) {
    const t = m[1];
    tagCounts[t] = (tagCounts[t] ?? 0) + 1;
  }

  const repeating = Object.entries(tagCounts)
    .filter(([, count]) => count > 1)
    .map(([tag]) => tag);

  const priorityOrder = [
    'Attendee',
    'attendee',
    'Record',
    'record',
    'Lead',
    'lead',
    'Row',
    'row',
    'Item',
    'item',
    'Response',
    'response',
  ];

  let containerTag = '';
  for (const tag of priorityOrder) {
    if (repeating.includes(tag)) {
      containerTag = tag;
      break;
    }
  }

  if (!containerTag && repeating.length > 0) {
    const rootCandidates = new Set([
      'xml',
      'Results',
      'results',
      'Response',
      'response',
      'Root',
      'root',
      'Data',
      'data',
      'Rows',
      'rows',
      'Attendees',
      'attendees',
    ]);

    const nonRoot = repeating.filter(t => !rootCandidates.has(t));
    const source = nonRoot.length > 0 ? nonRoot : repeating;
    containerTag = source.sort((a, b) => (tagCounts[b] ?? 0) - (tagCounts[a] ?? 0))[0] ?? '';
  }

  return { containerTag, allTagsFound: Object.keys(tagCounts) };
}

function parseXmlRecords(xml: string): {
  records: Record<string, string>[];
  containerTag: string;
  allTagsFound: string[];
} {
  const { containerTag, allTagsFound } = detectContainerTag(xml);
  const records: Record<string, string>[] = [];

  if (!containerTag) {
    return { records, containerTag: '', allTagsFound };
  }

  const recordRegex = new RegExp(
    `<${containerTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${containerTag}>`,
    'gi'
  );

  let match: RegExpExecArray | null;
  while ((match = recordRegex.exec(xml)) !== null) {
    const block = match[1];
    const record: Record<string, string> = {};

    const fieldRegex = /<([A-Za-z_][A-Za-z0-9_.-]*)(?:\s[^>]*)?>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/\1>/g;
    let fm: RegExpExecArray | null;
    while ((fm = fieldRegex.exec(block)) !== null) {
      record[fm[1]] = fm[2].trim();
    }

    const emptyFieldRegex = /<([A-Za-z_][A-Za-z0-9_.-]*)(?:\s[^>]*)?\/>/g;
    let ef: RegExpExecArray | null;
    while ((ef = emptyFieldRegex.exec(block)) !== null) {
      if (!(ef[1] in record)) record[ef[1]] = '';
    }

    if (Object.keys(record).length > 0) records.push(record);
  }

  return { records, containerTag, allTagsFound };
}

function getField(record: Record<string, string>, ...keys: string[]): string {
  const entries = Object.entries(record);
  for (const key of keys) {
    const entry = entries.find(([k]) => k.toLowerCase() === key.toLowerCase());
    if (entry && entry[1]) return entry[1].trim();
  }
  return '';
}

function getAgMarker(record: Record<string, string>): string {
  const raw = getField(
    record,
    'Attendee/Guest',
    'AttendeeGuest',
    'A/G',
    'AG',
    'Type',
    'RecordType',
    'EntryType'
  );
  return raw.trim().toUpperCase();
}

function isLikelyGuestRow(record: Record<string, string>, agMarker: string): boolean {
  if (agMarker === 'G' || agMarker === 'GUEST') return true;

  const role = getField(record, 'Role', 'PersonType', 'ParticipantType').toLowerCase();
  if (role.includes('guest')) return true;

  return false;
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
  const eventId = (payload?.eventId ?? '').toString().trim();
  const meetingId = (payload?.meetingId ?? '').toString().trim();
  const seminarId = (payload?.seminarId ?? '').toString().trim();
  const replaceExisting = Boolean(payload?.replaceExisting);

  if (!jobId) {
    send(res, 400, { error: 'jobId is required' });
    return;
  }

  if (!eventId) {
    send(res, 400, { error: 'eventId is required' });
    return;
  }

  if (!meetingId && !seminarId) {
    send(res, 400, { error: 'meetingId or seminarId is required' });
    return;
  }

  const supabaseAdmin = getSupabaseAdmin();

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
    send(res, 400, { error: 'No credentials saved. Save credentials in Settings first.' });
    return;
  }

  let username: string;
  let password: string;
  try {
    username = decryptString(credsData.username_enc);
    password = decryptString(credsData.password_enc);
  } catch (decryptErr: any) {
    send(res, 500, {
      error: 'Failed to decrypt saved credentials. The encryption key may have changed. Re-save credentials in Settings.',
      decryptError: decryptErr?.message ?? 'unknown',
    });
    return;
  }

  // Safe diagnostics — lengths only, no values ever exposed.
  const credDiag = {
    usernamePresent: username.trim().length > 0,
    passwordPresent: password.trim().length > 0,
    usernameLength: username.trim().length,
    passwordLength: password.trim().length,
    authParamNamesUsed: ['UserName', 'Password'],
    credentialSource: 'user_workthelead_credentials',
    requestMethod: 'GET',
  };

  if (!credDiag.usernamePresent || !credDiag.passwordPresent) {
    send(res, 500, {
      error: 'Saved credentials are blank after decrypt. Re-save credentials in Settings.',
      ...credDiag,
    });
    return;
  }

  const baseUrl = 'https://client.teledirect.com/seminaredge/api';
  const primaryByMeeting = !!meetingId;

  const endpoint = primaryByMeeting ? 'get_AttendeesByMeetingID.asp' : 'get_AttendeesBySeminarID.asp';
  const idKey = primaryByMeeting ? 'MeetingID' : 'SeminarID';
  const idValue = primaryByMeeting ? meetingId : seminarId;

  const qs = [
    `UserName=${encodeURIComponent(username)}`,
    `Password=${encodeURIComponent(password)}`,
    `${idKey}=${encodeURIComponent(idValue)}`,
  ].join('&');

  const safeQs = [
    `UserName=${encodeURIComponent(usernamePreview(username))}`,
    'Password=***',
    `${idKey}=${encodeURIComponent(idValue)}`,
  ].join('&');

  const url = `${baseUrl}/${endpoint}?${qs}`;
  const safeUrl = `${baseUrl}/${endpoint}?${safeQs}`;

  let resp: Response;
  let rawText = '';
  try {
    resp = await fetch(url, { method: 'GET' });
    rawText = await resp.text();
  } catch (e: any) {
    send(res, 502, {
      error: 'Failed calling Seminar Edge API',
      message: e?.message || 'Unknown fetch error',
      safeUrl,
    });
    return;
  }

  const normalizedBody = stripXml(rawText);
  const looksXml = normalizedBody.startsWith('<?xml') || normalizedBody.startsWith('<');
  const bodyLower = normalizedBody.toLowerCase();
  const bodyHasError =
    bodyLower.includes('<error>') ||
    bodyLower.includes('login failed') ||
    bodyLower.includes('invalid user') ||
    bodyLower.includes('invalid password');

  if (!resp.ok || bodyHasError) {
    send(res, 502, {
      error: `Seminar Edge request failed (HTTP ${resp.status})`,
      endpoint,
      safeUrl,
      httpStatus: resp.status,
      looksXml,
      bodyHasError,
      rawPreview: normalizedBody.slice(0, 1200),
      authDiagnostics: {
        usernamePresent: credDiag.usernamePresent,
        passwordPresent: credDiag.passwordPresent,
        usernameLength: credDiag.usernameLength,
        passwordLength: credDiag.passwordLength,
        authParamNamesUsed: credDiag.authParamNamesUsed,
        credentialSource: credDiag.credentialSource,
        requestMethod: credDiag.requestMethod,
        safeUrl,
      },
      ...credDiag,
    });
    return;
  }

  const { records, containerTag, allTagsFound } = parseXmlRecords(rawText);
  const fieldNameSet = new Set<string>();
  for (const rec of records) {
    Object.keys(rec).forEach(k => fieldNameSet.add(k));
  }
  const fieldNames = Array.from(fieldNameSet);

  if (replaceExisting) {
    const { error: deleteError } = await supabaseAdmin
      .from('responders')
      .delete()
      .eq('campaign_id', jobId)
      .eq('event_id', eventId);

    if (deleteError) {
      send(res, 500, {
        error: `Failed to clear existing responders: ${deleteError.message}`,
        endpoint,
        safeUrl,
      });
      return;
    }
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let totalA = 0;
  let totalG = 0;

  let currentAttendee: {
    index: number;
    id: string | null;
    timestamp: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null = null;

  let orphanGuestRows = 0;
  const pairingSamples: string[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const agMarker = getAgMarker(record);

    const firstName = getField(record, 'FirstName', 'First_Name', 'FName', 'firstname') || null;
    const lastName = getField(record, 'LastName', 'Last_Name', 'LName', 'lastname') || null;
    const phone = normalizePhone(getField(record, 'Phone', 'PhoneNumber', 'Phone1', 'HomePhone', 'CellPhone', 'PhoneNum'));
    const email = getField(record, 'Email', 'EmailAddress', 'EmailAddr', 'email_address').toLowerCase() || null;
    const timestamp = getField(record, 'TimeStamp', 'Timestamp', 'CreatedOn', 'CreateDate', 'DateCreated') || null;

    const looksGuest = isLikelyGuestRow(record, agMarker);

    if (looksGuest) {
      totalG += 1;

      if (currentAttendee?.id) {
        const { data: existingGuestData, error: existingGuestErr } = await supabaseAdmin
          .from('responders')
          .select('guests,guest_name')
          .eq('id', currentAttendee.id)
          .maybeSingle();

        if (!existingGuestErr && existingGuestData) {
          const nextGuests = Number(existingGuestData.guests ?? 0) + 1;
          const guestFullName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
          const nextGuestName = existingGuestData.guest_name || guestFullName;

          const { error: bumpErr } = await supabaseAdmin
            .from('responders')
            .update({
              guests: nextGuests,
              guest_name: nextGuestName,
              updated_at: new Date().toISOString(),
            })
            .eq('id', currentAttendee.id);

          if (bumpErr) {
            skipped += 1;
          }
        } else {
          skipped += 1;
        }

        if (pairingSamples.length < 8) {
          const lhs = [currentAttendee.firstName, currentAttendee.lastName].filter(Boolean).join(' ').trim() || 'Unknown A';
          const rhs = [firstName, lastName].filter(Boolean).join(' ').trim() || 'Unnamed G';
          pairingSamples.push(`A#${currentAttendee.index + 1}(${lhs}) <- G#${i + 1}(${rhs})`);
        }
      } else {
        orphanGuestRows += 1;
      }

      continue;
    }

    totalA += 1;

    if (!firstName && !lastName && !phone && !email) {
      skipped += 1;
      currentAttendee = null;
      continue;
    }

    const noteParts = [
      timestamp ? `Timestamp: ${timestamp}` : '',
      getField(record, 'CreatedBy') ? `CreatedBy: ${getField(record, 'CreatedBy')}` : '',
      getField(record, 'ConfirmationCall') ? `Confirmation: ${getField(record, 'ConfirmationCall')}` : '',
      getField(record, 'Notes') ? `Notes: ${getField(record, 'Notes')}` : '',
      getField(record, 'AdditionalNotes') ? `AdditionalNotes: ${getField(record, 'AdditionalNotes')}` : '',
      agMarker ? `AG: ${agMarker}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    const statusRaw = getField(record, 'Status', 'AttendeeStatus', 'ReservationStatus').toLowerCase();

    const upsertRecord: Record<string, any> = {
      campaign_id: jobId,
      event_id: eventId,
      first_name: firstName,
      last_name: lastName,
      phone,
      email,
      address: getField(record, 'Address', 'Address1', 'StreetAddress', 'Addr', 'Addr1') || null,
      city: getField(record, 'City') || null,
      state: getField(record, 'State', 'St', 'StateCode') || null,
      zip: getField(record, 'Zip', 'ZipCode', 'PostalCode', 'Zip5', 'ZipCode5') || null,
      guests: 0,
      response_source: 'call_center',
      confirmed: true,
      status: statusRaw || 'registered',
      notes: noteParts || null,
      updated_at: new Date().toISOString(),
    };

    let existingId: string | null = null;

    if (phone && lastName) {
      const { data: byPhoneLast } = await supabaseAdmin
        .from('responders')
        .select('id')
        .eq('campaign_id', jobId)
        .eq('event_id', eventId)
        .eq('phone', phone)
        .ilike('last_name', lastName)
        .maybeSingle();

      existingId = byPhoneLast?.id ?? null;
    } else if (phone && !lastName) {
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
      const { error: updateError } = await supabaseAdmin
        .from('responders')
        .update(upsertRecord)
        .eq('id', existingId);

      if (updateError) {
        skipped += 1;
        currentAttendee = null;
        continue;
      }

      updated += 1;
      currentAttendee = {
        index: i,
        id: existingId,
        timestamp,
        firstName,
        lastName,
      };
    } else {
      const insertPayload = {
        ...upsertRecord,
        attended: false,
        created_at: new Date().toISOString(),
      };

      const { data: insertedRow, error: insertError } = await supabaseAdmin
        .from('responders')
        .insert(insertPayload)
        .select('id')
        .single();

      if (insertError) {
        skipped += 1;
        currentAttendee = null;
        continue;
      }

      inserted += 1;
      currentAttendee = {
        index: i,
        id: insertedRow?.id ?? null,
        timestamp,
        firstName,
        lastName,
      };
    }
  }

  send(res, 200, {
    ok: true,
    endpoint,
    httpStatus: resp.status,
    containerTag,
    allTagsFound,
    inserted,
    updated,
    skipped,
    totalA,
    totalG,
    fieldNames,
    rawPreview: normalizedBody.slice(0, 1200),
    pairingDiagnostics: {
      strategy: 'Sequential row-order pairing (A row owns following G rows until next A row)',
      orphanGuestRows,
      samplePairs: pairingSamples,
    },
    source: {
      safeUrl,
      meetingId: meetingId || null,
      seminarId: seminarId || null,
      replaceExisting,
      recordsParsed: records.length,
    },
  });
}
