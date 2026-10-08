import https from 'node:https';
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

function normalizeLookupToken(value: string | null): string | null {
  const cleaned = (value ?? '').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.toLowerCase() : null;
}

function getAttendeeRelationship(record: Record<string, string>) {
  const attendeeId = getField(record, 'AttendeeID', 'Attendee_Id', 'AttendeeId', 'ID') || null;
  const mainAttendeeId = getField(record, 'MainAttendeeID', 'MainAttendee_Id', 'MainAttendeeId', 'ParentAttendeeID', 'ParentAttendeeId') || '0';
  const normalizedAttendeeId = attendeeId ? attendeeId.trim() : null;
  const normalizedMainAttendeeId = normalizeLookupToken(mainAttendeeId);
  const explicitGuest = !!normalizedAttendeeId && !!normalizedMainAttendeeId && normalizedMainAttendeeId !== '0' && normalizedMainAttendeeId !== normalizedAttendeeId;

  return {
    attendeeId: normalizedAttendeeId,
    mainAttendeeId: normalizedMainAttendeeId,
    explicitGuest,
  };
}

function normalizeGuestName(value: string | null): string | null {
  const cleaned = (value ?? '').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.toLowerCase() : null;
}

function guestNameAlreadyIncluded(existingGuestName: string | null, candidate: string | null): boolean {
  const existingKey = normalizeGuestName(existingGuestName);
  const candidateKey = normalizeGuestName(candidate);
  if (!candidateKey) return true;
  if (!existingKey) return false;
  return existingKey === candidateKey || existingKey.includes(candidateKey);
}

async function findExistingResponderMatches(
  supabaseAdmin: any,
  jobId: string,
  eventId: string,
  input: {
    phone: string | null;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  }
) {
  const { phone, email, firstName, lastName } = input;
  let query = supabaseAdmin
    .from('responders')
    .select('id, first_name, last_name, phone, email, guests, guest_name, mail_record_id, notes')
    .eq('campaign_id', jobId)
    .eq('event_id', eventId);

  if (phone && lastName) {
    query = query.eq('phone', phone).ilike('last_name', lastName);
  } else if (phone) {
    query = query.eq('phone', phone);
  } else if (email) {
    query = query.eq('email', email);
  } else {
    const firstKey = normalizeLookupToken(firstName);
    const lastKey = normalizeLookupToken(lastName);
    if (!firstKey || !lastKey) {
      return { rows: [], error: null, ambiguous: false, status: 'none' as const };
    }
    query = query.ilike('first_name', firstKey).ilike('last_name', lastKey);
  }

  const { data, error } = await query.limit(2);
  if (error) {
    return { rows: [], error, ambiguous: false, status: 'error' as const };
  }

  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) {
    return { rows: [], error: null, ambiguous: false, status: 'none' as const };
  }
  if (rows.length > 1) {
    return { rows, error: null, ambiguous: true, status: 'multiple' as const };
  }

  return {
    rows,
    error: null,
    ambiguous: false,
    status: 'single' as const,
    row: rows[0],
  };
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

  const jobId = ((payload?.jobId ?? payload?.campaign_id ?? '').toString()).trim();
  const eventId = ((payload?.eventId ?? payload?.event_id ?? '').toString()).trim();
  const meetingId = ((payload?.meetingId ?? payload?.MeetingID ?? payload?.meeting_id ?? '').toString()).trim();
  const replaceExisting = Boolean(payload?.replaceExisting);
  const dryRun = Boolean(payload?.dryRun);

  if (!jobId) {
    send(res, 400, { error: 'jobId is required' });
    return;
  }

  if (!eventId) {
    send(res, 400, { error: 'eventId is required' });
    return;
  }

  if (!meetingId) {
    send(res, 400, { error: 'meetingId is required' });
    return;
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: credsData, error: credsError } = await supabaseAdmin
    .from('user_seminaredge_credentials')
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
    credentialSource: 'user_seminaredge_credentials',
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

  const endpoint = 'get_AttendeesByMeetingID.asp';
  const safeUrl = `${baseUrl}/${endpoint}`;
  const idKey = 'MeetingID';
  const idValue = meetingId;

  const body = new URLSearchParams({
    UserName: username,
    Password: password,
    [idKey]: idValue,
  }).toString();

  const bodyByteLength = Buffer.byteLength(body, 'utf8');
  const safeBody = new URLSearchParams({
    UserName: usernamePreview(username),
    Password: '***',
    [idKey]: idValue,
  }).toString();

  let httpStatus = 0;
  let contentType = '';
  let rawText = '';
  let bodyWasSent = false;

  try {
    await new Promise<void>((resolve, reject) => {
      const req = https.request(
        `${baseUrl}/${endpoint}`,
        {
          method: 'GET',
          headers: {
            Accept: 'text/xml, application/xml, */*',
            'User-Agent': 'Mozilla/5.0 (compatible; MeetingsManagerPRO/1.0; diagnostics)',
            Connection: 'close',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': String(bodyByteLength),
          },
        },
        (res) => {
          httpStatus = res.statusCode ?? 0;
          contentType = String(res.headers['content-type'] || '');

          const chunks: Buffer[] = [];
          res.on('data', (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
          });
          res.on('end', () => {
            rawText = Buffer.concat(chunks).toString('utf8');
            resolve();
          });
          res.on('error', reject);
        }
      );

      req.on('error', reject);
      req.write(body);
      bodyWasSent = true;
      req.end();
    });
  } catch (e: any) {
    send(res, 502, {
      error: 'Failed calling Seminar Edge API',
      message: e?.message || 'Unknown fetch error',
      requestMethod: 'GET',
      requestBodySent: bodyWasSent,
      requestBodyByteLength: bodyByteLength,
      endpoint,
      safeBody,
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

  if (httpStatus >= 400 || bodyHasError) {
    send(res, 502, {
      error: `Seminar Edge request failed (HTTP ${httpStatus})`,
      endpoint,
      httpStatus,
      contentType,
      requestMethod: 'GET',
      requestBodySent: bodyWasSent,
      requestBodyByteLength: bodyByteLength,
      looksXml,
      bodyHasError,
      authDiagnostics: {
        usernamePresent: credDiag.usernamePresent,
        passwordPresent: credDiag.passwordPresent,
        usernameLength: credDiag.usernameLength,
        passwordLength: credDiag.passwordLength,
        authParamNamesUsed: credDiag.authParamNamesUsed,
        credentialSource: credDiag.credentialSource,
        requestMethod: credDiag.requestMethod,
        safeBody,
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

  if (dryRun) {
    const primaryStatuses: Array<string> = [];
    const primaryGuestCounts: number[] = [];
    const primaryByAttendeeId = new Map<string, string>();

    let primaryCount = 0;
    let guestCount = 0;
    let registeredPrimaryCount = 0;
    let waitlistPrimaryCount = 0;
    let cancelledPrimaryCount = 0;
    let rowsWithMainAttendeeZero = 0;
    let rowsWithMainAttendeeNonZero = 0;
    let guestReferencesResolved = 0;
    let unresolvedGuestReferences = 0;

    for (const record of records) {
      const relationship = getAttendeeRelationship(record);
      const agMarker = getAgMarker(record);
      const looksGuest = isLikelyGuestRow(record, agMarker) || (relationship.explicitGuest && relationship.mainAttendeeId !== '0');
      if (!looksGuest && relationship.attendeeId) {
        primaryByAttendeeId.set(relationship.attendeeId, relationship.attendeeId);
      }
      if (relationship.mainAttendeeId === '0') {
        rowsWithMainAttendeeZero += 1;
      } else if (relationship.mainAttendeeId) {
        rowsWithMainAttendeeNonZero += 1;
      }
    }

    for (const record of records) {
      const agMarker = getAgMarker(record);
      const relationship = getAttendeeRelationship(record);
      const looksGuest = isLikelyGuestRow(record, agMarker) || (relationship.explicitGuest && relationship.mainAttendeeId !== '0');
      const statusRaw = getField(record, 'Status', 'AttendeeStatus', 'ReservationStatus') || 'registered';
      const status = statusRaw.toLowerCase();

      if (looksGuest) {
        guestCount += 1;
        if (primaryStatuses.length > 0) {
          primaryGuestCounts[primaryGuestCounts.length - 1] += 1;
        }
        if (relationship.mainAttendeeId && relationship.mainAttendeeId !== '0' && relationship.mainAttendeeId !== relationship.attendeeId) {
          if (primaryByAttendeeId.has(relationship.mainAttendeeId)) {
            guestReferencesResolved += 1;
          } else {
            unresolvedGuestReferences += 1;
          }
        }
        continue;
      }

      primaryStatuses.push(status || 'registered');
      primaryGuestCounts.push(0);
      primaryCount += 1;

      if (status === 'cancelled' || status === 'canceled') {
        cancelledPrimaryCount += 1;
      } else if (status === 'waitlist' || status === 'waiting list' || status === 'waitlisted') {
        waitlistPrimaryCount += 1;
      } else {
        registeredPrimaryCount += 1;
      }
    }

    const nonCancelledPrimaryCount = primaryCount - cancelledPrimaryCount;
    const guestsOnNonCancelledPrimaries = primaryStatuses
      .map((status, index) => (status === 'cancelled' || status === 'canceled' ? 0 : primaryGuestCounts[index]))
      .reduce((sum, count) => sum + count, 0);

    send(res, 200, {
      dryRun: true,
      totalReceived: records.length,
      primaryCount,
      guestCount,
      registeredPrimaryCount,
      waitlistPrimaryCount,
      cancelledPrimaryCount,
      nonCancelledPrimaryCount,
      guestsOnNonCancelledPrimaries,
      attendeeEquivalentTotal: nonCancelledPrimaryCount + guestsOnNonCancelledPrimaries,
      rowsWithMainAttendeeZero,
      rowsWithMainAttendeeNonZero,
      guestReferencesResolved,
      unresolvedGuestReferences,
      relationshipFieldsPresent: {
        attendeeId: records.some(r => !!getAttendeeRelationship(r).attendeeId),
        mainAttendeeId: records.some(r => !!getAttendeeRelationship(r).mainAttendeeId),
      },
    });
    return;
  }

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

  const apiPrimaryByAttendeeId = new Map<string, Record<string, string>>();
  const guestPrimaryAttendeeMap = new Map<string, string>();
  let lastPrimaryRecord: Record<string, string> | null = null;

  for (const record of records) {
    const relationship = getAttendeeRelationship(record);
    const attendeeId = relationship.attendeeId;
    const agMarker = getAgMarker(record);
    const looksGuest = isLikelyGuestRow(record, agMarker) || (relationship.explicitGuest && relationship.mainAttendeeId !== '0');

    if (attendeeId) {
      apiPrimaryByAttendeeId.set(attendeeId, record);
    }

    if (attendeeId && relationship.mainAttendeeId && relationship.mainAttendeeId !== '0' && relationship.mainAttendeeId !== attendeeId) {
      guestPrimaryAttendeeMap.set(attendeeId, relationship.mainAttendeeId);
    }

    if (!looksGuest) {
      lastPrimaryRecord = record;
    }
  }

  const primaryRecords: Array<{ index: number; record: Record<string, string> }> = [];
  const guestRecords: Array<{ index: number; record: Record<string, string>; primaryRecord: Record<string, string> | null; primaryApiId: string | null }> = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const agMarker = getAgMarker(record);
    const relationship = getAttendeeRelationship(record);
    const looksGuest = isLikelyGuestRow(record, agMarker) || (relationship.explicitGuest && relationship.mainAttendeeId !== '0');

    if (looksGuest) {
      const primaryApiId = relationship.mainAttendeeId && relationship.mainAttendeeId !== '0' && relationship.mainAttendeeId !== relationship.attendeeId
        ? relationship.mainAttendeeId
        : null;
      const resolvedPrimaryRecord = primaryApiId && apiPrimaryByAttendeeId.get(primaryApiId)
        ? apiPrimaryByAttendeeId.get(primaryApiId) ?? lastPrimaryRecord
        : lastPrimaryRecord;

      guestRecords.push({
        index: i,
        record,
        primaryRecord: resolvedPrimaryRecord ?? null,
        primaryApiId: primaryApiId ?? null,
      });
      continue;
    }

    primaryRecords.push({ index: i, record });
  }

  const apiPrimaryDbIdByAttendeeId = new Map<string, string>();
  const seenGuestKeysByPrimary = new Map<string, Set<string>>();
  let currentAttendee: {
    index: number;
    id: string | null;
    timestamp: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null = null;
  let orphanGuestRows = 0;
  const pairingSamples: string[] = [];

  for (const { index, record } of primaryRecords) {
    const agMarker = getAgMarker(record);
    const firstName = getField(record, 'FirstName', 'First_Name', 'FName', 'firstname') || null;
    const lastName = getField(record, 'LastName', 'Last_Name', 'LName', 'lastname') || null;
    const phone = normalizePhone(getField(record, 'Phone', 'PhoneNumber', 'Phone1', 'HomePhone', 'CellPhone', 'PhoneNum'));
    const email = getField(record, 'Email', 'EmailAddress', 'EmailAddr', 'email_address').toLowerCase() || null;
    const timestamp = getField(record, 'TimeStamp', 'Timestamp', 'CreatedOn', 'CreateDate', 'DateCreated') || null;

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

    const attendeeRelationship = getAttendeeRelationship(record);
    const candidateMatch = await findExistingResponderMatches(supabaseAdmin, jobId, eventId, { phone, email, firstName, lastName });

    let resolvedExistingId: string | null = null;

    if (candidateMatch.status === 'error') {
      skipped += 1;
      currentAttendee = null;
      continue;
    }

    if (candidateMatch.status === 'multiple') {
      skipped += 1;
      currentAttendee = null;
      continue;
    }

    if (candidateMatch.status === 'single') {
      resolvedExistingId = candidateMatch.row?.id ?? null;
    }

    if (resolvedExistingId) {
      const { data: existingRow, error: existingRowError } = await supabaseAdmin
        .from('responders')
        .select('*')
        .eq('id', resolvedExistingId)
        .maybeSingle();

      if (existingRowError || !existingRow) {
        skipped += 1;
        currentAttendee = null;
        continue;
      }

      const nextUpdate: Record<string, any> = {
        ...upsertRecord,
        phone: phone ?? existingRow.phone ?? null,
        email: email ?? existingRow.email ?? null,
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabaseAdmin
        .from('responders')
        .update(nextUpdate)
        .eq('id', existingRow.id);

      if (updateError) {
        skipped += 1;
        currentAttendee = null;
        continue;
      }

      updated += 1;
      currentAttendee = {
        index,
        id: existingRow.id,
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
        index,
        id: insertedRow?.id ?? null,
        timestamp,
        firstName,
        lastName,
      };
    }

    if (attendeeRelationship.attendeeId && currentAttendee?.id) {
      apiPrimaryDbIdByAttendeeId.set(attendeeRelationship.attendeeId, currentAttendee.id);
    }
  }

  for (const { index, record, primaryRecord, primaryApiId } of guestRecords) {
    const agMarker = getAgMarker(record);
    const firstName = getField(record, 'FirstName', 'First_Name', 'FName', 'firstname') || null;
    const lastName = getField(record, 'LastName', 'Last_Name', 'LName', 'lastname') || null;
    const phone = normalizePhone(getField(record, 'Phone', 'PhoneNumber', 'Phone1', 'HomePhone', 'CellPhone', 'PhoneNum'));
    const email = getField(record, 'Email', 'EmailAddress', 'EmailAddr', 'email_address').toLowerCase() || null;
    const guestFullName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
    const relationship = getAttendeeRelationship(record);

    let primaryDbId: string | null = currentAttendee?.id ?? null;

    if (primaryApiId && apiPrimaryDbIdByAttendeeId.has(primaryApiId)) {
      primaryDbId = apiPrimaryDbIdByAttendeeId.get(primaryApiId) ?? null;
    } else if (primaryRecord) {
      const primaryFirstName = getField(primaryRecord, 'FirstName', 'First_Name', 'FName', 'firstname') || null;
      const primaryLastName = getField(primaryRecord, 'LastName', 'Last_Name', 'LName', 'lastname') || null;
      const primaryPhone = normalizePhone(getField(primaryRecord, 'Phone', 'PhoneNumber', 'Phone1', 'HomePhone', 'CellPhone', 'PhoneNum'));
      const primaryEmail = getField(primaryRecord, 'Email', 'EmailAddress', 'EmailAddr', 'email_address').toLowerCase() || null;
      const primaryLookup = await findExistingResponderMatches(supabaseAdmin, jobId, eventId, {
        phone: primaryPhone,
        email: primaryEmail,
        firstName: primaryFirstName,
        lastName: primaryLastName,
      });

      if (primaryLookup.status === 'error') {
        skipped += 1;
        continue;
      }

      if (primaryLookup.status === 'multiple') {
        skipped += 1;
        continue;
      }

      primaryDbId = primaryLookup.status === 'single' ? primaryLookup.row?.id ?? null : null;
    }

    if (!primaryDbId) {
      orphanGuestRows += 1;
      skipped += 1;
      continue;
    }

    const { data: existingGuestData, error: existingGuestErr } = await supabaseAdmin
      .from('responders')
      .select('guests,guest_name')
      .eq('id', primaryDbId)
      .maybeSingle();

    if (existingGuestErr || !existingGuestData) {
      skipped += 1;
      continue;
    }

    const guestKey = `${primaryDbId}|${normalizeGuestName(guestFullName) ?? 'unnamed-guest'}`;
    const primaryGuestSet = seenGuestKeysByPrimary.get(primaryDbId) ?? new Set<string>();
    if (primaryGuestSet.has(guestKey)) {
      continue;
    }
    primaryGuestSet.add(guestKey);
    seenGuestKeysByPrimary.set(primaryDbId, primaryGuestSet);

    const guestCount = Number(existingGuestData.guests ?? 0);
    const currentGuestName = existingGuestData.guest_name ?? null;
    const shouldIncreaseGuestCount = !guestNameAlreadyIncluded(currentGuestName, guestFullName);
    const nextGuests = shouldIncreaseGuestCount ? guestCount + 1 : guestCount;
    const nextGuestName = currentGuestName && currentGuestName.trim() ? currentGuestName : guestFullName;

    const { error: bumpErr } = await supabaseAdmin
      .from('responders')
      .update({
        guests: nextGuests,
        guest_name: nextGuestName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', primaryDbId);

    if (bumpErr) {
      skipped += 1;
      continue;
    }

    totalG += 1;
    if (pairingSamples.length < 8) {
      const lhs = [primaryRecord ? getField(primaryRecord, 'FirstName', 'First_Name', 'FName', 'firstname') : null, primaryRecord ? getField(primaryRecord, 'LastName', 'Last_Name', 'LName', 'lastname') : null].filter(Boolean).join(' ').trim() || 'Unknown A';
      const rhs = guestFullName || 'Unnamed G';
      pairingSamples.push(`A(${lhs}) <- G(${rhs})`);
    }
  }

  send(res, 200, {
    ok: true,
    endpoint,
    httpStatus,
    containerTag,
    allTagsFound,
    inserted,
    updated,
    skipped,
    totalA,
    totalG,
    fieldNames,
    pairingDiagnostics: {
      strategy: 'Primary records first; explicit MainAttendeeID/AttendeeID relationship overrides row order; no-contact fallbacks require a single name match within the meeting',
      orphanGuestRows,
      samplePairs: pairingSamples,
    },
    source: {
      safeUrl,
      meetingId: meetingId || null,
      replaceExisting,
      recordsParsed: records.length,
    },
  });
}
