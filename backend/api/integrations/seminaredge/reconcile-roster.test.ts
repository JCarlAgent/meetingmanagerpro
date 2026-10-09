import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseTeleDirectRosterDetailed } from '../../../src/lib/teleDirectRoster';
import handler, { reconcileRosterReadOnly } from './reconcile-roster.ts';

type FixtureResponder = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  guests: number | null;
  guest_name: string | null;
  status: string | null;
};

type FixtureRosterRow = {
  attendeeType: 'A' | 'G';
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  isCancelled: boolean;
  primaryRosterIndex: number | null;
};

function splitNameParts(firstName: string | null, lastName: string | null, fallbackPrefix: string, fallbackIndex: number) {
  const safeFirst = (firstName ?? '').trim() || `${fallbackPrefix}${fallbackIndex + 1}`;
  const safeLast = (lastName ?? '').trim() || 'Guest';
  return { first: safeFirst, last: safeLast };
}

function toRosterRowsFromFixture(args: {
  primaries: Array<{ firstName: string | null; lastName: string | null; isCancelled: boolean }>;
  guests: Array<{ firstName: string | null; lastName: string | null; isCancelled: boolean; primaryRosterIndex: number | null }>;
}): FixtureRosterRow[] {
  const primaryRows: FixtureRosterRow[] = args.primaries.map((primary, index) => {
    const safe = splitNameParts(primary.firstName, primary.lastName, 'Primary', index);
    return {
      attendeeType: 'A',
      firstName: safe.first,
      lastName: safe.last,
      fullName: `${safe.first} ${safe.last}`,
      phone: null,
      email: `primary-${index + 1}@example.test`,
      status: primary.isCancelled ? 'cancelled' : 'registered',
      isCancelled: primary.isCancelled,
      primaryRosterIndex: index,
    };
  });

  const guestRows: FixtureRosterRow[] = args.guests.map((guest, index) => {
    const safe = splitNameParts(guest.firstName, guest.lastName, 'Guest', index);
    return {
      attendeeType: 'G',
      firstName: safe.first,
      lastName: safe.last,
      fullName: `${safe.first} ${safe.last}`,
      phone: null,
      email: null,
      status: guest.isCancelled ? 'cancelled' : 'registered',
      isCancelled: guest.isCancelled,
      primaryRosterIndex: guest.primaryRosterIndex,
    };
  });

  return [...primaryRows, ...guestRows];
}

function buildOct13ResponderFixture(rows: FixtureRosterRow[]): FixtureResponder[] {
  const primaries = rows.filter((row) => row.attendeeType === 'A');
  const guests = rows.filter((row) => row.attendeeType === 'G');
  assert.equal(primaries.length, 13);
  assert.equal(guests.length, 11);

  const responders: FixtureResponder[] = [];
  let idCounter = 1;

  const addResponder = (responder: Omit<FixtureResponder, 'id'>) => {
    responders.push({ id: `oct13-r${idCounter++}`, ...responder });
  };

  // 10 existing primaries represented by strong email evidence.
  for (let i = 0; i < 10; i += 1) {
    const rosterPrimary = primaries[i];
    addResponder({
      first_name: rosterPrimary.firstName,
      last_name: rosterPrimary.lastName,
      phone: null,
      email: rosterPrimary.email,
      guests: null,
      guest_name: null,
      status: rosterPrimary.isCancelled ? 'cancelled' : 'registered',
    });
  }

  // 9 guest identities imported as standalone responder rows (with duplicates).
  const duplicateCounts = [4, 3, 3, 3, 3, 3, 3, 2, 2];
  for (let guestIndex = 0; guestIndex < 9; guestIndex += 1) {
    const rosterGuest = guests[guestIndex];
    const duplicateCount = duplicateCounts[guestIndex];
    for (let dup = 0; dup < duplicateCount; dup += 1) {
      addResponder({
        first_name: rosterGuest.firstName,
        last_name: rosterGuest.lastName,
        phone: null,
        email: null,
        guests: null,
        guest_name: null,
        status: rosterGuest.isCancelled ? 'cancelled' : 'registered',
      });
    }
  }

  // One guest correctly attached through guest_name metadata.
  const attachedGuest = guests.find((guest) => typeof guest.primaryRosterIndex === 'number' && guest.primaryRosterIndex >= 0 && guest.primaryRosterIndex < 10) ?? guests[9];
  responders[0].guest_name = `${attachedGuest.firstName ?? ''} ${attachedGuest.lastName ?? ''}`.trim() || null;
  responders[0].guests = responders[0].guest_name ? 1 : 0;

  assert.equal(responders.length, 36, 'oct13 responder fixture must keep total rows');
  return responders;
}

function buildOct14ResponderFixture(rows: FixtureRosterRow[]): FixtureResponder[] {
  const primaries = rows.filter((row) => row.attendeeType === 'A');
  const guests = rows.filter((row) => row.attendeeType === 'G');
  assert.equal(primaries.length, 6);
  assert.equal(guests.length, 4);

  const responders: FixtureResponder[] = [];
  let idCounter = 1;

  const addResponder = (responder: Omit<FixtureResponder, 'id'>) => {
    responders.push({ id: `oct14-r${idCounter++}`, ...responder });
  };

  // All primaries already represented.
  for (let i = 0; i < primaries.length; i += 1) {
    const rosterPrimary = primaries[i];
    addResponder({
      first_name: rosterPrimary.firstName,
      last_name: rosterPrimary.lastName,
      phone: null,
      email: rosterPrimary.email,
      guests: null,
      guest_name: null,
      status: rosterPrimary.isCancelled ? 'cancelled' : 'registered',
    });
  }

  // Four guest identities imported as standalone responder rows.
  const duplicateCounts = [4, 4, 4, 3];
  for (let guestIndex = 0; guestIndex < 4; guestIndex += 1) {
    const rosterGuest = guests[guestIndex];
    const duplicateCount = duplicateCounts[guestIndex];
    for (let dup = 0; dup < duplicateCount; dup += 1) {
      addResponder({
        first_name: rosterGuest.firstName,
        last_name: rosterGuest.lastName,
        phone: null,
        email: null,
        guests: null,
        guest_name: null,
        status: rosterGuest.isCancelled ? 'cancelled' : 'registered',
      });
    }
  }

  assert.equal(responders.length, 21, 'oct14 responder fixture must keep total rows');
  return responders;
}

function countDistinctIdentitiesForFixture(responders: FixtureResponder[]): number {
  const keys = new Set<string>();
  for (const responder of responders) {
    const first = String(responder.first_name ?? '').trim().toLowerCase();
    const last = String(responder.last_name ?? '').trim().toLowerCase();
    const email = String(responder.email ?? '').trim().toLowerCase();
    const phoneDigits = String(responder.phone ?? '').replace(/\D/g, '');
    const nameKey = first && last ? `${first}|${last}` : 'name:unknown';
    const key = phoneDigits
      ? `${nameKey}|phone:${phoneDigits}`
      : email
        ? `${nameKey}|email:${email}`
        : `${nameKey}|contact:none`;
    keys.add(key);
  }
  return keys.size;
}

const roster601425 = parseTeleDirectRosterDetailed(fs.readFileSync('/Users/jack/Downloads/meeting601425-2.xls', 'utf8'));
const roster601426 = parseTeleDirectRosterDetailed(fs.readFileSync('/Users/jack/Downloads/meeting601426.xls', 'utf8'));

assert.equal(roster601425.preview.primaryCount, 13, 'fixture 601425 must parse 13 primaries');
assert.equal(roster601425.preview.guestCount, 11, 'fixture 601425 must parse 11 guests');
assert.equal(roster601426.preview.primaryCount, 6, 'fixture 601426 must parse 6 primaries');
assert.equal(roster601426.preview.guestCount, 4, 'fixture 601426 must parse 4 guests');

const oct13Rows = toRosterRowsFromFixture({
  primaries: roster601425.attendees
    .filter((row) => row.attendeeType === 'A')
    .map((row) => ({ firstName: row.firstName, lastName: row.lastName, isCancelled: row.isCancelled })),
  guests: roster601425.attendees
    .filter((row) => row.attendeeType === 'G')
    .map((row) => ({
      firstName: row.firstName,
      lastName: row.lastName,
      isCancelled: row.isCancelled,
      primaryRosterIndex: row.primaryRosterIndex,
    })),
});

const oct14Rows = toRosterRowsFromFixture({
  primaries: roster601426.attendees
    .filter((row) => row.attendeeType === 'A')
    .map((row) => ({ firstName: row.firstName, lastName: row.lastName, isCancelled: row.isCancelled })),
  guests: roster601426.attendees
    .filter((row) => row.attendeeType === 'G')
    .map((row) => ({
      firstName: row.firstName,
      lastName: row.lastName,
      isCancelled: row.isCancelled,
      primaryRosterIndex: row.primaryRosterIndex,
    })),
});

const oct13Responders = buildOct13ResponderFixture(oct13Rows);
const oct14Responders = buildOct14ResponderFixture(oct14Rows);

assert.equal(oct13Responders.length, 36, 'October 13 fixture must keep 36 responder rows');
assert.equal(countDistinctIdentitiesForFixture(oct13Responders), 19, 'October 13 fixture must keep 19 distinct identities');
assert.equal(oct13Responders.length - countDistinctIdentitiesForFixture(oct13Responders), 17, 'October 13 fixture must keep 17 excess duplicate rows');

assert.equal(oct14Responders.length, 21, 'October 14 fixture must keep 21 responder rows');
assert.equal(countDistinctIdentitiesForFixture(oct14Responders), 10, 'October 14 fixture must keep 10 distinct identities');
assert.equal(oct14Responders.length - countDistinctIdentitiesForFixture(oct14Responders), 11, 'October 14 fixture must keep 11 excess duplicate rows');

const october13Summary = reconcileRosterReadOnly({
  rosterRows: oct13Rows as any,
  responders: oct13Responders as any,
});
assert.equal(october13Summary.readOnly, true, 'reconciliation must be read-only');
assert.equal(october13Summary.databaseSummary.responderRows, 36, 'oct13 rows should remain 36');
assert.equal(october13Summary.databaseSummary.distinctIdentities, 19, 'oct13 identities should remain 19');
assert.equal(october13Summary.databaseSummary.excessDuplicateRows, 17, 'oct13 excess duplicate rows should remain 17');
assert.equal(october13Summary.proposedReconciliation.primaryAlreadyRepresented, 10, 'oct13 should keep 10 matched primaries');
assert.equal(october13Summary.proposedReconciliation.newPrimaryRecordsNeeded, 3, 'oct13 should keep 3 new primaries');
assert.equal(october13Summary.proposedReconciliation.ambiguousPrimaryMatchesRequiringManualReview, 0, 'oct13 should not add primary ambiguity in fixture');
assert.equal(october13Summary.proposedReconciliation.guestAlreadyCorrectlyAttached, 1, 'oct13 should identify one correctly attached guest');
assert.equal(october13Summary.proposedReconciliation.newGuestIdentitiesNeedingAttachment, 2, 'oct13 should identify new guest identities needing attachment');
assert.equal(october13Summary.proposedReconciliation.guestRelationshipsNeedingRepair, 9, 'oct13 should identify standalone guest relationships requiring repair');
assert.equal(october13Summary.databaseSummary.guestAsPrimaryRecords, 26, 'oct13 should count standalone guest responder rows');
assert.equal(october13Summary.proposedReconciliation.guestAsPrimaryRowsRequiringCleanup, 26, 'oct13 cleanup rows should match standalone guest rows');
assert.equal(october13Summary.proposedReconciliation.ambiguousGuestMatchesRequiringManualReview, 0, 'oct13 guest duplicates should no longer be treated as ambiguous');
assert.equal(october13Summary.proposedReconciliation.ambiguousMatchesRequiringManualReview, 0, 'oct13 total ambiguity should be zero in fixture');
assert.equal(october13Summary.proposedReconciliation.cancelledGuestRecords, 1, 'oct13 should preserve cancelled guest history');

const october14Summary = reconcileRosterReadOnly({
  rosterRows: oct14Rows as any,
  responders: oct14Responders as any,
});
assert.equal(october14Summary.readOnly, true, 'reconciliation must be read-only');
assert.equal(october14Summary.databaseSummary.responderRows, 21, 'oct14 rows should remain 21');
assert.equal(october14Summary.databaseSummary.distinctIdentities, 10, 'oct14 identities should remain 10');
assert.equal(october14Summary.databaseSummary.excessDuplicateRows, 11, 'oct14 excess duplicate rows should remain 11');
assert.equal(october14Summary.proposedReconciliation.primaryAlreadyRepresented, 6, 'oct14 should keep 6 matched primaries');
assert.equal(october14Summary.proposedReconciliation.newPrimaryRecordsNeeded, 0, 'oct14 should keep zero new primaries');
assert.equal(october14Summary.proposedReconciliation.ambiguousPrimaryMatchesRequiringManualReview, 0, 'oct14 should not add primary ambiguity in fixture');
assert.equal(october14Summary.proposedReconciliation.guestAlreadyCorrectlyAttached, 0, 'oct14 fixture has no correctly attached guests');
assert.equal(october14Summary.proposedReconciliation.newGuestIdentitiesNeedingAttachment, 0, 'oct14 fixture has no brand-new guest identities');
assert.equal(october14Summary.proposedReconciliation.guestRelationshipsNeedingRepair, 4, 'oct14 should identify all guests as standalone relationships needing repair');
assert.equal(october14Summary.databaseSummary.guestAsPrimaryRecords, 15, 'oct14 should count standalone guest responder rows');
assert.equal(october14Summary.proposedReconciliation.guestAsPrimaryRowsRequiringCleanup, 15, 'oct14 cleanup rows should match standalone guest rows');
assert.equal(october14Summary.proposedReconciliation.ambiguousGuestMatchesRequiringManualReview, 0, 'oct14 guest duplicates should no longer be treated as ambiguous');
assert.equal(october14Summary.proposedReconciliation.ambiguousMatchesRequiringManualReview, 0, 'oct14 total ambiguity should be zero in fixture');
assert.equal(october14Summary.proposedReconciliation.cancelledGuestRecords, 0, 'oct14 has no cancelled guest rows');

const unauthorizedReq = { method: 'POST', headers: {}, body: JSON.stringify({}) };
const unauthorizedRes: any = {
  statusCode: 0,
  headers: {} as Record<string, string>,
  body: '',
  setHeader(key: string, value: string) {
    this.headers[key] = value;
  },
  end(payload: string) {
    this.body = payload;
  },
};

await handler(unauthorizedReq, unauthorizedRes);
assert.equal(unauthorizedRes.statusCode, 401, 'handler should reject unauthorized requests');

console.log('reconcile-roster regressions: ok');
