import https from 'node:https';
import { randomUUID } from 'node:crypto';
import { decryptString } from '../../_lib/crypto.js';
import { getSupabaseAdmin, requireUserIdFromAuthHeader } from '../../_lib/supabaseAdmin.js';
import { canAccessJobEvent, runPostImportEnrichment } from './import-roster-replace.js';
import {
  buildTeleDirectPlan,
  type ExistingResponderSnapshot,
  type TeleDirectPlan,
  type TeleDirectPlanCounts,
  type TeleDirectPlanRow,
} from './teledirect-roster-plan.js';

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

export function checkStoredMeetingId(
  storedValue: unknown,
  requestedMeetingId: string
): { ok: boolean; reason?: string; error?: string } {
  const stored = String(storedValue ?? '').trim();
  if (!stored) {
    return {
      ok: false,
      reason: 'stored_meeting_id_missing',
      error: 'This event has no stored TeleDirect meeting ID. Update Confirmations is blocked.',
    };
  }
  if (stored !== requestedMeetingId.trim()) {
    return {
      ok: false,
      reason: 'meeting_id_mismatch',
      error: 'meetingId does not match the TeleDirect meeting ID stored for this event.',
    };
  }
  return { ok: true };
}

const DIAGNOSTIC_RELATIONSHIP_FIELDS = [
  'AttendeeID', 'MainAttendeeID', 'Attendee/Guest', 'AttendeeGuest', 'A/G', 'AG', 'Type', 'RecordType', 'EntryType',
  'Role', 'PersonType', 'ParticipantType', 'Status', 'AttendeeStatus', 'ReservationStatus',
];

function isGuestRecord(record: Record<string, string>): boolean {
  const relationship = getAttendeeRelationship(record);
  return isLikelyGuestRow(record, getAgMarker(record)) || (relationship.explicitGuest && relationship.mainAttendeeId !== '0');
}

function bucketAttendeeStatus(raw: string): 'registered' | 'cancelled' | 'waitlist' | 'other' {
  const status = raw.trim().toLowerCase();
  if (status === 'cancelled' || status === 'canceled') return 'cancelled';
  if (status === 'waitlist' || status === 'waiting list' || status === 'waitlisted') return 'waitlist';
  if (status === '' || status === 'registered') return 'registered';
  return 'other';
}

const DATE_FIELD_PATTERN = /date|time|created|registered|registration|timestamp|submitted|entered|added|signup|purchas|modified|updated/i;
const DATE_FIELD_EXCLUDE_PATTERN = /status|type/i;
const SEQUENCE_FIELD_PATTERN = /^(attendee_?id|id|record_?id|seq|sequence(_?(no|num|number|id))?|order(_?(no|num|number))?|reg(istration)?_?(no|num|number|id)|confirmation_?(no|num|number|id)|row_?(no|num|number))$/i;
const PHONE_FIELD_NAMES = ['Phone', 'Phone1', 'PhoneNumber', 'Phone Number', 'Mobile', 'MobilePhone', 'Cell', 'CellPhone', 'Telephone'];
const EMAIL_FIELD_NAMES = ['Email', 'EmailAddress', 'Email Address', 'E-mail'];
const SURNAME_FIELD_NAMES = ['LastName', 'Last Name', 'Surname', 'LName'];

type TimePrecision = 'date' | 'minute' | 'second' | 'unparsed';

function buildDateTime(
  year: number,
  month: number,
  day: number,
  hourRaw: string | undefined,
  minuteRaw: string | undefined,
  secondRaw: string | undefined,
  meridiem: string | undefined
): { precision: TimePrecision; ms: number | null } {
  const unparsed = { precision: 'unparsed' as const, ms: null };
  const hasTime = hourRaw !== undefined && minuteRaw !== undefined;
  let hour = hasTime ? Number(hourRaw) : 0;
  const minute = hasTime ? Number(minuteRaw) : 0;
  const second = hasTime && secondRaw !== undefined ? Number(secondRaw) : 0;
  if (meridiem) {
    if (hour < 1 || hour > 12) return unparsed;
    const pm = meridiem.toLowerCase() === 'pm';
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const valid =
    month >= 1 && month <= 12 && day >= 1 && day <= 31 &&
    hour < 24 && minute < 60 && second < 60 &&
    !Number.isNaN(date.getTime()) && date.getUTCDate() === day;
  if (!valid) return unparsed;
  const precision: TimePrecision = !hasTime ? 'date' : secondRaw === undefined ? 'minute' : 'second';
  return { precision, ms: date.getTime() };
}

// Parses a value only to classify its precision and order. The value itself is never returned.
function parseDateTimeValue(raw: string): { precision: TimePrecision; ms: number | null } {
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  if (iso) {
    return buildDateTime(Number(iso[1]), Number(iso[2]), Number(iso[3]), iso[4], iso[5], iso[6], undefined);
  }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/.exec(value);
  if (us) {
    const year = us[3].length === 2 ? Number(us[3]) + 2000 : Number(us[3]);
    return buildDateTime(year, Number(us[1]), Number(us[2]), us[4], us[5], us[6], us[7]);
  }
  return { precision: 'unparsed', ms: null };
}

// Compares consecutive rows in record order. Null values are skipped.
function compareAdjacent(values: Array<number | null>) {
  let comparablePairs = 0;
  let ascendingPairs = 0;
  let descendingPairs = 0;
  let tiedPairs = 0;
  for (let i = 0; i < values.length - 1; i++) {
    const a = values[i];
    const b = values[i + 1];
    if (a === null || b === null) continue;
    comparablePairs += 1;
    if (b > a) ascendingPairs += 1;
    else if (b < a) descendingPairs += 1;
    else tiedPairs += 1;
  }
  return { comparablePairs, ascendingPairs, descendingPairs, tiedPairs };
}

function analyzeDateTimeField(records: Record<string, string>[], field: string) {
  const precision = { date: 0, minute: 0, second: 0, unparsed: 0 };
  const values: Array<number | null> = [];
  let nonEmpty = 0;
  for (const record of records) {
    const raw = getField(record, field);
    if (!raw) {
      values.push(null);
      continue;
    }
    nonEmpty += 1;
    const parsed = parseDateTimeValue(raw);
    precision[parsed.precision] += 1;
    values.push(parsed.ms);
  }
  return { field, nonEmpty, precision, ...compareAdjacent(values) };
}

function analyzeSequenceField(records: Record<string, string>[], field: string) {
  const values: Array<number | null> = [];
  const unique = new Set<string>();
  let nonEmpty = 0;
  let numeric = 0;
  for (const record of records) {
    const raw = getField(record, field);
    if (!raw) {
      values.push(null);
      continue;
    }
    nonEmpty += 1;
    unique.add(raw);
    if (/^\d+$/.test(raw)) {
      numeric += 1;
      values.push(Number(raw));
    } else {
      values.push(null);
    }
  }
  return { field, nonEmpty, numeric, unique: unique.size, ...compareAdjacent(values) };
}

function summarizeOrderEvidence(
  sequenceFields: ReturnType<typeof analyzeSequenceField>[],
  dateTimeFields: ReturnType<typeof analyzeDateTimeField>[]
): string {
  const sequence = sequenceFields.find(
    (f) => f.comparablePairs > 0 && f.numeric === f.nonEmpty && f.unique === f.nonEmpty
  );
  if (sequence) {
    if (sequence.ascendingPairs === sequence.comparablePairs) return 'sequence_ascending_in_record_order';
    if (sequence.descendingPairs === sequence.comparablePairs) return 'sequence_descending_in_record_order';
    return 'sequence_not_monotonic_in_record_order';
  }
  const timestamp = dateTimeFields.find((f) => f.comparablePairs > 0);
  if (timestamp) {
    if (timestamp.descendingPairs === 0) return 'timestamp_nondecreasing_in_record_order';
    if (timestamp.ascendingPairs === 0) return 'timestamp_nonincreasing_in_record_order';
    return 'timestamp_not_monotonic_in_record_order';
  }
  return 'none';
}

// Heuristic only: pairs each row with the next row when surnames match and the second row has no phone or email.
function analyzeContactPairing(records: Record<string, string>[], fieldNames: string[]) {
  const rows = records.map((record) => ({
    hasContact: getField(record, ...PHONE_FIELD_NAMES) !== '' || getField(record, ...EMAIL_FIELD_NAMES) !== '',
    surname: normalizeLookupToken(getField(record, ...SURNAME_FIELD_NAMES)),
  }));
  const present = (names: string[]) =>
    names.filter((name) => fieldNames.some((field) => field.toLowerCase() === name.toLowerCase()));

  const pairMatch = (i: number) => {
    const first = rows[i];
    const second = rows[i + 1];
    const sameSurname = !!first.surname && first.surname === second.surname;
    const secondLacksContact = !second.hasContact;
    return { sameSurname, secondLacksContact, both: sameSurname && secondLacksContact };
  };

  let rowsMissingBothPhoneAndEmail = 0;
  for (const row of rows) {
    if (!row.hasContact) rowsMissingBothPhoneAndEmail += 1;
  }

  let consecutivePairsSameSurname = 0;
  let consecutivePairsSecondLacksContact = 0;
  let consecutivePairsSameSurnameAndSecondLacksContact = 0;
  for (let i = 0; i < rows.length - 1; i++) {
    const match = pairMatch(i);
    if (match.sameSurname) consecutivePairsSameSurname += 1;
    if (match.secondLacksContact) consecutivePairsSecondLacksContact += 1;
    if (match.both) consecutivePairsSameSurnameAndSecondLacksContact += 1;
  }

  // Non-overlapping greedy pairing from the top of the feed.
  let inferredPairs = 0;
  for (let i = 0; i < rows.length - 1; ) {
    if (pairMatch(i).both) {
      inferredPairs += 1;
      i += 2;
    } else {
      i += 1;
    }
  }

  return {
    phoneFieldsPresent: present(PHONE_FIELD_NAMES),
    emailFieldsPresent: present(EMAIL_FIELD_NAMES),
    surnameFieldsPresent: present(SURNAME_FIELD_NAMES),
    rowsMissingBothPhoneAndEmail,
    consecutivePairsSameSurname,
    consecutivePairsSecondLacksContact,
    consecutivePairsSameSurnameAndSecondLacksContact,
    inferredPairs,
    unresolvedRows: rows.length - 2 * inferredPairs,
  };
}

// Ordered preview in API source order. Only the fields listed here are returned;
// contact values are reduced to booleans and nothing is sorted or filtered.
export function buildOrderPreview(records: Record<string, string>[]) {
  return records.map((record, index) => {
    const status = bucketAttendeeStatus(getField(record, 'Status', 'AttendeeStatus', 'ReservationStatus'));
    return {
      sourceIndex: index + 1,
      firstName: getField(record, 'FirstName', 'First_Name', 'FName', 'firstname') || null,
      lastName: getField(record, 'LastName', 'Last_Name', 'LName', 'lastname') || null,
      hasPhone: getField(record, ...PHONE_FIELD_NAMES) !== '',
      hasEmail: getField(record, ...EMAIL_FIELD_NAMES) !== '',
      status,
    };
  });
}

// Read-only diagnostic summary. Returns aggregate counts and XML field names only;
// names, contact details, and raw rows are never included unless the caller opts into
// the ordered preview, which carries names and contact booleans only.
export function buildTeleDirectFeedDiagnostic(
  records: Record<string, string>[],
  meetingId: string,
  options: { includeOrderPreview?: boolean } = {}
) {
  const fieldSet = new Set<string>();
  records.forEach((record) => Object.keys(record).forEach((key) => fieldSet.add(key)));
  const relevantFieldNames = Array.from(fieldSet)
    .filter((key) => DIAGNOSTIC_RELATIONSHIP_FIELDS.some((field) => field.toLowerCase() === key.toLowerCase()))
    .sort();

  const primaryAttendeeIds = new Set<string>();
  for (const record of records) {
    const relationship = getAttendeeRelationship(record);
    if (!isGuestRecord(record) && relationship.attendeeId) primaryAttendeeIds.add(relationship.attendeeId);
  }

  let mainAttendeeIdGreaterThanZero = 0;
  let agA = 0;
  let agG = 0;
  let agMissingOrOther = 0;
  const statusCounts = { registered: 0, cancelled: 0, waitlist: 0, other: 0 };
  let primaryRows = 0;
  let guestRows = 0;
  let cancelledPrimaryRows = 0;
  let cancelledGuestRows = 0;
  let identifiablePrimaryRows = 0;
  let identifiableGuestRows = 0;
  let unresolvedRelationshipRows = 0;
  let activeAttendees = 0;

  for (const record of records) {
    const relationship = getAttendeeRelationship(record);
    const agMarker = getAgMarker(record);
    if (/^\d+$/.test(relationship.mainAttendeeId ?? '') && Number(relationship.mainAttendeeId) > 0) {
      mainAttendeeIdGreaterThanZero += 1;
    }
    if (agMarker === 'A') agA += 1;
    else if (agMarker === 'G' || agMarker === 'GUEST') agG += 1;
    else agMissingOrOther += 1;

    const status = bucketAttendeeStatus(getField(record, 'Status', 'AttendeeStatus', 'ReservationStatus'));
    statusCounts[status] += 1;
    const cancelled = status === 'cancelled';
    if (!cancelled) activeAttendees += 1;

    if (isGuestRecord(record)) {
      guestRows += 1;
      if (cancelled) cancelledGuestRows += 1;
      const mainResolved = !!relationship.mainAttendeeId && relationship.mainAttendeeId !== '0' && primaryAttendeeIds.has(relationship.mainAttendeeId);
      if (mainResolved) identifiableGuestRows += 1;
      else unresolvedRelationshipRows += 1;
    } else {
      primaryRows += 1;
      if (cancelled) cancelledPrimaryRows += 1;
      if (relationship.attendeeId) identifiablePrimaryRows += 1;
    }
  }

  const allFieldNames = Array.from(fieldSet).sort();
  const dateTimeFieldNames = allFieldNames.filter(
    (key) => DATE_FIELD_PATTERN.test(key) && !DATE_FIELD_EXCLUDE_PATTERN.test(key)
  );
  const sequenceFieldNames = allFieldNames.filter((key) => SEQUENCE_FIELD_PATTERN.test(key));
  const dateTimeFields = dateTimeFieldNames.map((field) => analyzeDateTimeField(records, field));
  const sequenceFields = sequenceFieldNames.map((field) => analyzeSequenceField(records, field));
  const contactPairing = analyzeContactPairing(records, allFieldNames);

  return {
    diagnostic: true,
    meetingId,
    ...(options.includeOrderPreview ? { orderPreview: buildOrderPreview(records) } : {}),
    totalRecords: records.length,
    relevantFieldNames,
    mainAttendeeIdGreaterThanZero,
    agMarkers: { A: agA, G: agG, missingOrOther: agMissingOrOther },
    statusCounts,
    classification: {
      primaryRows,
      guestRows,
      cancelledPrimaryRows,
      cancelledGuestRows,
      identifiablePrimaryRows,
      identifiableGuestRows,
      unresolvedRelationshipRows,
      activeAttendees,
    },
    orderEvidence: {
      dateTimeFields,
      sequenceFields,
      conclusion: summarizeOrderEvidence(sequenceFields, dateTimeFields),
    },
    contactPairing,
  };
}

function buildPlanRows(records: Record<string, string>[]): TeleDirectPlanRow[] {
  const rows: TeleDirectPlanRow[] = [];
  records.forEach((record, sourceIndex) => {
    const firstName = getField(record, 'FirstName', 'First_Name', 'FName', 'firstname').trim();
    const lastName = getField(record, 'LastName', 'Last_Name', 'LName', 'lastname').trim();
    const phone = normalizePhone(getField(record, 'Phone', 'PhoneNumber', 'Phone1', 'HomePhone', 'CellPhone', 'PhoneNum')) ?? '';
    const email = getField(record, 'Email', 'EmailAddress', 'EmailAddr', 'email_address').trim().toLowerCase();
    const rawStatus = getField(record, 'Status', 'AttendeeStatus', 'ReservationStatus').trim();
    // Fully blank filler rows carry no attendee and are skipped, as before.
    if (!firstName && !lastName && !phone && !email) return;
    rows.push({ sourceIndex, firstName, lastName, phone, email, rawStatus });
  });
  return rows;
}

async function loadExistingResponderSnapshots(
  supabaseAdmin: any,
  jobId: string,
  eventId: string
): Promise<{ ok: true; rows: ExistingResponderSnapshot[] } | { ok: false; error: string }> {
  const rows: ExistingResponderSnapshot[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from('responders')
      .select('id, first_name, last_name, phone, email, response_source, teledirect_attendee_key')
      .eq('campaign_id', jobId)
      .eq('event_id', eventId)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) return { ok: false, error: error.message };
    for (const r of data ?? []) {
      rows.push({
        id: r.id,
        firstName: r.first_name ?? '',
        lastName: r.last_name ?? '',
        phone: r.phone ?? '',
        email: r.email ?? '',
        responseSource: r.response_source ?? null,
        teledirectAttendeeKey: r.teledirect_attendee_key ?? null,
      });
    }
    if (!data || data.length < pageSize) break;
  }
  return { ok: true, rows };
}

function summarizePlan(plan: TeleDirectPlan) {
  return {
    counts: plan.counts,
    blockers: plan.blockers.map((b) => ({ code: b.code, message: b.message, sourceIndexes: b.sourceIndexes })),
  };
}

function dryRunCounts(totalReceived: number, counts: TeleDirectPlanCounts) {
  return {
    totalReceived,
    primaryCount: counts.primaries,
    guestCount: counts.guests,
    registeredPrimaryCount: counts.primariesRegistered,
    waitlistPrimaryCount: counts.primariesWaitlist,
    cancelledPrimaryCount: counts.primariesCancelled,
    nonCancelledPrimaryCount: counts.primaries - counts.primariesCancelled,
    guestsOnNonCancelledPrimaries: counts.guests - counts.cancelledGuests,
    attendeeEquivalentTotal: counts.confirmedAttendees,
    confirmedAttendees: counts.confirmedAttendees,
    activeAttendees: counts.activeRows,
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

  if (replaceExisting) {
    send(res, 400, {
      error: 'replaceExisting is not supported by Update Confirmations. Use the roster import for a full replacement.',
    });
    return;
  }

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

  // Server-side authorization: master admin only, and the event must belong to the job.
  const access = await canAccessJobEvent({ userId, email: null, jobId, eventId, supabaseAdmin });
  if (!access.ok) {
    const status = access.reason === 'master_admin_lookup_failed' ? 500 : 403;
    send(res, status, { error: 'Not authorized to update confirmations for this event.', reason: access.reason });
    return;
  }

  // The TeleDirect meeting must match the one stored on this event before any TeleDirect call or write.
  const meetingCheck = checkStoredMeetingId(access.event?.teledirect_meeting_id, meetingId);
  if (!meetingCheck.ok) {
    send(res, 409, { error: meetingCheck.error, reason: meetingCheck.reason });
    return;
  }

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
  const { records, containerTag, allTagsFound } = parseXmlRecords(rawText);
  const explicitErrorTag = rawText.match(/<error[^>]*>([\s\S]*?)<\/error>/i);
  const hasAuthErrorText =
    bodyLower.includes('login failed') ||
    bodyLower.includes('invalid user') ||
    bodyLower.includes('invalid password');
  // Treat auth/error text as fatal only when the payload has no parsed attendee rows.
  // Some valid attendee feeds include free-text fields that can contain these words.
  const bodyHasError = Boolean(explicitErrorTag) || (hasAuthErrorText && records.length === 0);

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
      parsedRecordCount: records.length,
      xmlErrorMessage: explicitErrorTag ? String(explicitErrorTag[1]).trim() : null,
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

  const fieldNameSet = new Set<string>();
  for (const rec of records) {
    Object.keys(rec).forEach(k => fieldNameSet.add(k));
  }
  const fieldNames = Array.from(fieldNameSet);

  // Diagnostic, dry run, and sync all build from the same plan. Only the sync branch writes.
  const planRows = buildPlanRows(records);
  const existingLoad = await loadExistingResponderSnapshots(supabaseAdmin, jobId, eventId);
  if (!existingLoad.ok) {
    send(res, 500, { error: `Failed to read existing responders: ${existingLoad.error}` });
    return;
  }
  const plan = buildTeleDirectPlan(planRows, existingLoad.rows);
  const planSummary = summarizePlan(plan);

  if (payload?.diagnostic === true) {
    send(res, 200, {
      ...buildTeleDirectFeedDiagnostic(records, meetingId, { includeOrderPreview: payload?.orderPreview === true }),
      plan: planSummary,
    });
    return;
  }

  if (dryRun) {
    send(res, 200, {
      dryRun: true,
      ...dryRunCounts(records.length, plan.counts),
      plan: planSummary,
    });
    return;
  }

  if (plan.blockers.length > 0 || plan.payload.length === 0) {
    send(res, 422, {
      error: 'Roster cannot be synchronized safely. No changes were written.',
      blockers: planSummary.blockers,
      plan: planSummary,
    });
    return;
  }

  const requestId = randomUUID();
  const rpcRows = plan.payload.map((row) => {
    const { sourceIndex: _sourceIndex, ...rest } = row;
    return rest;
  });

  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('sync_event_responders_from_teledirect', {
    p_job_id: jobId,
    p_event_id: eventId,
    p_rows: rpcRows,
    p_actor_user_id: userId,
    p_request_id: requestId,
  });

  if (rpcError) {
    console.error('[update-responses] roster sync failed', { requestId, jobId, eventId, message: rpcError.message });
    send(res, 500, {
      error: 'Roster synchronization failed. No responder changes were applied.',
      message: rpcError.message,
      requestId,
    });
    return;
  }

  const result = (rpcData ?? {}) as Record<string, number | null>;
  const adopted = Number(result.adopted ?? 0);
  const updated = Number(result.updated ?? 0) + adopted;

  // Enrichment runs only after the atomic sync has committed. Its outcome is reported separately.
  const demographicEnrichment = await runPostImportEnrichment({ supabaseAdmin, jobId, eventId, requestId });

  send(res, 200, {
    ok: true,
    endpoint,
    httpStatus,
    containerTag,
    allTagsFound,
    inserted: Number(result.inserted ?? 0),
    updated,
    adopted,
    skipped: records.length - planRows.length,
    total: records.length,
    totalA: plan.counts.primaries,
    totalG: plan.counts.guests,
    retainedAbsent: Number(result.retainedAbsent ?? 0),
    eventResponderCount: result.eventResponderCount ?? null,
    confirmedAttendees: plan.counts.confirmedAttendees,
    activeAttendees: plan.counts.activeRows,
    plan: planSummary,
    demographicEnrichment,
    fieldNames,
    source: {
      safeUrl,
      meetingId: meetingId || null,
      replaceExisting: false,
      recordsParsed: records.length,
      requestId,
    },
  });
}
