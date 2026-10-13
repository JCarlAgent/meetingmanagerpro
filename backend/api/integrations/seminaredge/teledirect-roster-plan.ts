// Shared TeleDirect roster plan. The read-only diagnostic and the Update Confirmations
// sync both build their result from this module, so their counts cannot diverge.
// No XML parsing happens here; callers pass pre-extracted rows in API source order.

import {
  classifyAttendees,
  type AttendeeClassification,
  type AttendeeClassificationInput,
  type AttendeeStatusBucket,
} from './classify-attendees.js';

export type RawStatusBucket = AttendeeStatusBucket | 'unknown';

export interface TeleDirectPlanRow {
  sourceIndex: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  rawStatus: string;
}

export interface ExistingResponderSnapshot {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  responseSource: string | null;
  teledirectAttendeeKey: string | null;
}

export interface PlanBlocker {
  code:
    | 'empty_feed'
    | 'unknown_status'
    | 'other_status'
    | 'unresolved_active'
    | 'duplicate_identity_key'
    | 'ambiguous_identity_match';
  message: string;
  sourceIndexes: number[];
}

export interface PlanGuestDetail {
  first_name: string;
  last_name: string;
  full_name: string;
  status: RawStatusBucket;
  is_cancelled: boolean;
}

export interface PlanPayloadRow {
  responder_id?: string;
  teledirect_attendee_key: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  status: 'registered' | 'waitlist' | 'cancelled';
  confirmed: boolean;
  guests: number;
  guest_name: string | null;
  guest_details: PlanGuestDetail[];
  cancelled_guest_count: number;
  sourceIndex: number;
}

export interface TeleDirectPlanCounts {
  feedRows: number;
  activeRows: number;
  cancelledRows: number;
  statusCounts: Record<RawStatusBucket, number>;
  primaries: number;
  primariesRegistered: number;
  primariesWaitlist: number;
  primariesCancelled: number;
  primariesOther: number;
  guests: number;
  registeredGuestsUnderRegisteredPrimary: number;
  guestsUnderWaitlistPrimary: number;
  cancelledGuests: number;
  inferredLinks: number;
  unresolvedActive: number;
  unresolvedCancelled: number;
  confirmedAttendees: number;
  payloadRows: number;
  adoptedLegacyRows: number;
  unmatchedLegacyRows: number;
}

export interface TeleDirectPlan {
  counts: TeleDirectPlanCounts;
  blockers: PlanBlocker[];
  classification: AttendeeClassification;
  payload: PlanPayloadRow[];
}

const normalizeName = (value: string): string => value.trim().replace(/\s+/g, ' ').toLowerCase();
const digitsOnly = (value: string): string => value.replace(/\D/g, '');
const normalizeEmail = (value: string): string => value.trim().toLowerCase();
const hasText = (value: string): boolean => value.trim().length > 0;

/** Maps a raw TeleDirect status. An empty status is unknown and is never assumed registered. */
export function mapRawStatus(raw: string): RawStatusBucket {
  const status = raw.trim().toLowerCase();
  if (status === '') return 'unknown';
  if (status === 'registered') return 'registered';
  if (status === 'cancelled' || status === 'canceled') return 'cancelled';
  if (status === 'waitlist' || status === 'waiting list' || status === 'waitlisted') return 'waitlist';
  return 'other';
}

/** Persistent identity used for upsert matching. Never derived from sourceIndex. */
export function buildIdentityKey(row: Pick<TeleDirectPlanRow, 'firstName' | 'lastName' | 'phone' | 'email'>): string {
  return [
    normalizeName(row.lastName),
    normalizeName(row.firstName),
    digitsOnly(row.phone),
    normalizeEmail(row.email),
  ].join('|');
}

const nameKey = (first: string, last: string): string => `${normalizeName(last)}|${normalizeName(first)}`;

function findAdoptionCandidates(
  row: PlanPayloadRow,
  contact: { phoneDigits: string; email: string },
  legacy: ExistingResponderSnapshot[]
): ExistingResponderSnapshot[] {
  const wantName = nameKey(row.first_name, row.last_name);
  return legacy.filter((candidate) => {
    if (nameKey(candidate.firstName, candidate.lastName) !== wantName) return false;
    if (!contact.phoneDigits && !contact.email) return true;
    const candidatePhone = digitsOnly(candidate.phone);
    const candidateEmail = normalizeEmail(candidate.email);
    return (
      (!!contact.phoneDigits && candidatePhone === contact.phoneDigits) ||
      (!!contact.email && candidateEmail === contact.email)
    );
  });
}

export function buildTeleDirectPlan(
  rows: readonly TeleDirectPlanRow[],
  existing: readonly ExistingResponderSnapshot[] = []
): TeleDirectPlan {
  const blockers: PlanBlocker[] = [];
  const statusCounts: Record<RawStatusBucket, number> = {
    registered: 0, cancelled: 0, waitlist: 0, other: 0, unknown: 0,
  };
  const rowStatus = new Map<number, RawStatusBucket>();
  for (const row of rows) {
    const bucket = mapRawStatus(row.rawStatus);
    rowStatus.set(row.sourceIndex, bucket);
    statusCounts[bucket] += 1;
  }

  if (rows.length === 0) {
    blockers.push({ code: 'empty_feed', message: 'TeleDirect returned no attendees.', sourceIndexes: [] });
  }
  const unknownIndexes = rows.filter((r) => rowStatus.get(r.sourceIndex) === 'unknown').map((r) => r.sourceIndex);
  if (unknownIndexes.length) {
    blockers.push({
      code: 'unknown_status',
      message: 'Attendees with an empty status cannot be safely classified.',
      sourceIndexes: unknownIndexes,
    });
  }
  const otherIndexes = rows.filter((r) => rowStatus.get(r.sourceIndex) === 'other').map((r) => r.sourceIndex);
  if (otherIndexes.length) {
    blockers.push({
      code: 'other_status',
      message: 'Attendees with an unsupported status block synchronization.',
      sourceIndexes: otherIndexes,
    });
  }

  // Unknown and other statuses are classified as 'other' so the adjacency rules still run for diagnostics.
  const classifierInputs: AttendeeClassificationInput[] = rows.map((row) => {
    const bucket = rowStatus.get(row.sourceIndex) ?? 'other';
    return {
      sourceIndex: row.sourceIndex,
      lastName: row.lastName,
      phone: row.phone,
      email: row.email,
      status: bucket === 'unknown' ? 'other' : bucket,
    };
  });
  const classification = classifyAttendees(classifierInputs);

  const byIndex = new Map(rows.map((r) => [r.sourceIndex, r]));

  const unresolvedActiveIndexes = classification.attendees
    .filter((a) => a.role === 'unresolved' && !a.cancelled)
    .map((a) => a.sourceIndex);
  if (unresolvedActiveIndexes.length) {
    blockers.push({
      code: 'unresolved_active',
      message: 'Active attendees without contact information appear before any primary; the sync cannot place them.',
      sourceIndexes: unresolvedActiveIndexes,
    });
  }

  // Build one payload row per primary and per unresolved cancelled row.
  const payload: PlanPayloadRow[] = [];
  for (const attendee of classification.attendees) {
    if (attendee.role === 'guest') continue;
    const row = byIndex.get(attendee.sourceIndex);
    if (!row) continue;
    if (attendee.role === 'unresolved' && !attendee.cancelled) continue;

    const bucket = rowStatus.get(row.sourceIndex) ?? 'unknown';
    // Unknown or unsupported primaries have no payload row. Their blocker rejects the sync before any write.
    if (bucket !== 'registered' && bucket !== 'waitlist' && bucket !== 'cancelled') continue;
    const primaryStatus: PlanPayloadRow['status'] = bucket;
    const guestRows = classification.attendees
      .filter((g) => g.role === 'guest' && g.primarySourceIndex === row.sourceIndex)
      .map((g) => byIndex.get(g.sourceIndex))
      .filter((g): g is TeleDirectPlanRow => !!g);

    const guestDetails: PlanGuestDetail[] = guestRows.map((g) => {
      const guestBucket = rowStatus.get(g.sourceIndex) ?? 'other';
      return {
        first_name: g.firstName,
        last_name: g.lastName,
        full_name: `${g.firstName} ${g.lastName}`.trim(),
        status: guestBucket,
        is_cancelled: guestBucket === 'cancelled',
      };
    });
    // Guests are confirmed only when both the primary and the guest are registered.
    const confirmedGuests = guestDetails.filter(
      (g) => primaryStatus === 'registered' && g.status === 'registered'
    );

    payload.push({
      teledirect_attendee_key: buildIdentityKey(row),
      first_name: row.firstName,
      last_name: row.lastName,
      phone: row.phone,
      email: row.email,
      status: primaryStatus,
      confirmed: primaryStatus === 'registered',
      guests: confirmedGuests.length,
      guest_name: confirmedGuests.length
        ? confirmedGuests.map((g) => g.full_name).join(', ')
        : null,
      guest_details: guestDetails,
      cancelled_guest_count: guestDetails.filter((g) => g.is_cancelled).length,
      sourceIndex: row.sourceIndex,
    });
  }

  // Identity keys must be unique within a single feed.
  const keyOwners = new Map<string, number[]>();
  for (const row of payload) {
    const owners = keyOwners.get(row.teledirect_attendee_key) ?? [];
    owners.push(row.sourceIndex);
    keyOwners.set(row.teledirect_attendee_key, owners);
  }
  const duplicateIndexes = [...keyOwners.values()].filter((o) => o.length > 1).flat();
  if (duplicateIndexes.length) {
    blockers.push({
      code: 'duplicate_identity_key',
      message: 'Two TeleDirect rows share the same identity; they cannot be stored safely.',
      sourceIndexes: duplicateIndexes,
    });
  }

  // Match rows to existing legacy responders, which have no identity key yet.
  const keyedExisting = new Set(
    existing.filter((e) => e.teledirectAttendeeKey).map((e) => e.teledirectAttendeeKey as string)
  );
  const legacy = existing.filter((e) => !e.teledirectAttendeeKey && e.responseSource === 'call_center');
  const claimed = new Map<string, number[]>();
  const ambiguous: number[] = [];
  for (const row of payload) {
    if (keyedExisting.has(row.teledirect_attendee_key)) continue;
    const src = byIndex.get(row.sourceIndex);
    if (!src) continue;
    const candidates = findAdoptionCandidates(
      row,
      { phoneDigits: digitsOnly(src.phone), email: normalizeEmail(src.email) },
      legacy
    );
    if (candidates.length === 1) {
      row.responder_id = candidates[0].id;
      const owners = claimed.get(candidates[0].id) ?? [];
      owners.push(row.sourceIndex);
      claimed.set(candidates[0].id, owners);
    } else if (candidates.length > 1) {
      ambiguous.push(row.sourceIndex);
    }
  }
  for (const owners of claimed.values()) {
    if (owners.length > 1) ambiguous.push(...owners);
  }
  const ambiguousUnique = [...new Set(ambiguous)];
  if (ambiguousUnique.length) {
    for (const row of payload) {
      if (ambiguousUnique.includes(row.sourceIndex)) delete row.responder_id;
    }
    blockers.push({
      code: 'ambiguous_identity_match',
      message: 'Existing responders match more than one TeleDirect attendee; no rows were written.',
      sourceIndexes: ambiguousUnique,
    });
  }
  // Counted after ambiguous adoptions are cleared, so only rows that will really adopt are reported.
  const adoptedIds = new Set(payload.map((r) => r.responder_id).filter((id): id is string => !!id));
  const adoptedLegacyRows = adoptedIds.size;
  const unmatchedLegacyRows = legacy.filter((e) => !adoptedIds.has(e.id)).length;

  // Counts. Classification eligibility and confirmed counting stay separate.
  let primariesRegistered = 0;
  let primariesWaitlist = 0;
  let primariesCancelled = 0;
  let registeredGuestsUnderRegisteredPrimary = 0;
  let guestsUnderWaitlistPrimary = 0;
  for (const row of payload) {
    if (row.status === 'registered') primariesRegistered += 1;
    else if (row.status === 'waitlist') primariesWaitlist += 1;
    else primariesCancelled += 1;
    for (const guest of row.guest_details) {
      if (row.status === 'registered' && guest.status === 'registered') registeredGuestsUnderRegisteredPrimary += 1;
      if (row.status === 'waitlist') guestsUnderWaitlistPrimary += 1;
    }
  }

  const cancelledRows = rows.filter((r) => rowStatus.get(r.sourceIndex) === 'cancelled').length;
  const counts: TeleDirectPlanCounts = {
    feedRows: rows.length,
    activeRows: rows.length - cancelledRows,
    cancelledRows,
    statusCounts,
    primaries: classification.summary.primaries,
    primariesRegistered,
    primariesWaitlist,
    primariesCancelled,
    primariesOther: classification.attendees.filter(
      (a) => a.role === 'primary' && (rowStatus.get(a.sourceIndex) === 'other' || rowStatus.get(a.sourceIndex) === 'unknown')
    ).length,
    guests: classification.summary.guests,
    registeredGuestsUnderRegisteredPrimary,
    guestsUnderWaitlistPrimary,
    cancelledGuests: classification.summary.cancelledGuests,
    inferredLinks: classification.summary.inferredLinks,
    unresolvedActive: unresolvedActiveIndexes.length,
    unresolvedCancelled: classification.attendees.filter((a) => a.role === 'unresolved' && a.cancelled).length,
    confirmedAttendees: primariesRegistered + registeredGuestsUnderRegisteredPrimary,
    payloadRows: payload.length,
    adoptedLegacyRows,
    unmatchedLegacyRows,
  };

  return { counts, blockers, classification, payload };
}
