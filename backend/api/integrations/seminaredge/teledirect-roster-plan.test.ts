import assert from 'node:assert/strict';
import { buildTeleDirectPlan, mapRawStatus, type TeleDirectPlanRow } from './teledirect-roster-plan.ts';

// Observed live fixture (31 rows, API order). Names are the observed names.
// Contact flags are observed booleans; they are converted to synthetic strings below.
// Expected roles and parents are kept here, separate from classifier input.
const fixture: Array<[number, string, string, boolean, boolean, string, 'primary' | 'guest', number | null]> = [
  [1, 'Sherisse', 'Bailey', true, true, 'registered', 'primary', null],
  [2, 'Yallngn', 'Skinner', false, false, 'registered', 'guest', 1],
  [3, 'Wilson', 'Ortiz', true, true, 'registered', 'primary', null],
  [4, 'Ynes', 'Ortiz', false, false, 'registered', 'guest', 3],
  [5, 'Corey', 'Ricks', true, true, 'registered', 'primary', null],
  [6, 'Joyce', 'Goodwin', false, false, 'registered', 'guest', 5],
  [7, 'Kimberly', 'Alston', true, true, 'registered', 'primary', null],
  [8, 'Alvin', 'Williams', false, false, 'registered', 'guest', 7],
  [9, 'Maria', 'Wong', true, true, 'registered', 'primary', null],
  [10, 'Corrie', 'Marable', false, false, 'cancelled', 'guest', 11],
  [11, 'Donald', 'Marable', true, false, 'registered', 'primary', null],
  [12, 'Pamela', 'Young', true, true, 'registered', 'primary', null],
  [13, 'Lisa', 'Young', false, false, 'registered', 'guest', 12],
  [14, 'Jan', 'Mackenzie', true, true, 'registered', 'primary', null],
  [15, 'James', 'Stanley', false, false, 'registered', 'guest', 14],
  [16, 'Rita', 'Brewer', true, true, 'registered', 'primary', null],
  [17, 'Robert', 'Brewer', false, false, 'registered', 'guest', 16],
  [18, 'Rand', 'Matthews', true, true, 'registered', 'primary', null],
  [19, 'Nancy', 'Matthews', false, false, 'registered', 'guest', 18],
  [20, 'Dorothy', 'Chavis', true, true, 'registered', 'primary', null],
  [21, 'Clementine', 'Hodge', false, false, 'registered', 'guest', 20],
  [22, 'Chelsea', 'Stubbman', true, true, 'registered', 'primary', null],
  [23, 'Jonathan', 'Stubbman', false, false, 'registered', 'guest', 22],
  [24, 'Maimunata', 'Thomas', true, true, 'registered', 'primary', null],
  [25, 'Ernest', 'Hawkins', true, true, 'registered', 'primary', null],
  [26, 'Crystal', 'Wilson', false, false, 'registered', 'guest', 25],
  [27, 'Nicholas', 'Versteeg', true, true, 'registered', 'primary', null],
  [28, 'Sophia', 'Myers', false, false, 'registered', 'guest', 27],
  [29, 'Britta', 'Svensson-Dotson', true, true, 'registered', 'primary', null],
  [30, 'Kelly', 'Anderson', true, true, 'registered', 'primary', null],
  [31, 'Mike', 'Anderson', false, false, 'registered', 'guest', 30],
];

const rows: TeleDirectPlanRow[] = fixture.map(([sourceIndex, firstName, lastName, hasPhone, hasEmail, rawStatus]) => ({
  sourceIndex,
  firstName,
  lastName,
  phone: hasPhone ? `555-000-${String(sourceIndex).padStart(4, '0')}` : '',
  email: hasEmail ? `person${sourceIndex}@example.test` : '',
  rawStatus,
}));

const plan = buildTeleDirectPlan(rows);

// Totals (no fixed roster enforcement beyond these fixture expectations).
assert.equal(plan.counts.feedRows, 31);
assert.equal(plan.counts.primaries, 17);
assert.equal(plan.counts.guests, 14);
assert.equal(plan.counts.cancelledGuests, 1);
assert.equal(plan.counts.activeRows, 30);
assert.equal(plan.blockers.length, 0, JSON.stringify(plan.blockers));

// Roles and parent links match the expected fixture.
const byIndex = new Map(plan.classification.attendees.map((a) => [a.sourceIndex, a]));
for (const [sourceIndex, , , , , , expectedRole, expectedParent] of fixture) {
  const actual = byIndex.get(sourceIndex);
  assert.ok(actual, `missing attendee ${sourceIndex}`);
  assert.equal(actual.role, expectedRole, `role for ${sourceIndex}`);
  assert.equal(actual.primarySourceIndex, expectedParent, `parent for ${sourceIndex}`);
}

// Corrie -> Donald is the only inferred link and is recorded as surname inference.
const corrie = byIndex.get(10);
assert.equal(corrie?.linkBasis, 'surname-inference');
assert.equal(plan.counts.inferredLinks, 1);

// Maria Wong has no guest. Pamela Young has Lisa Young.
const maria = plan.payload.find((r) => r.sourceIndex === 9);
assert.ok(maria);
assert.deepEqual(maria.guest_details, []);
const pamela = plan.payload.find((r) => r.sourceIndex === 12);
assert.ok(pamela);
assert.equal(pamela.guest_details[0]?.full_name, 'Lisa Young');

// Donald carries Corrie as a cancelled guest. The primary stays registered.
const donald = plan.payload.find((r) => r.sourceIndex === 11);
assert.ok(donald);
assert.equal(donald.status, 'registered');
assert.equal(donald.cancelled_guest_count, 1);
assert.equal(donald.guest_details[0]?.is_cancelled, true);

// Confirmed totals: 17 registered primaries plus 13 registered guests.
assert.equal(plan.counts.primariesRegistered, 17);
assert.equal(plan.counts.registeredGuestsUnderRegisteredPrimary, 13);
assert.equal(plan.counts.confirmedAttendees, 30);

// Payload identity keys are unique and never derived from sourceIndex.
const keys = plan.payload.map((r) => r.teledirect_attendee_key);
assert.equal(new Set(keys).size, keys.length);
assert.equal(plan.payload.length, 17); // one payload row per primary; linked cancelled guests stay under their primary

// Waitlist primaries are excluded from confirmed totals. Their guests are not confirmed.
const waitlistRows: TeleDirectPlanRow[] = [
  { sourceIndex: 1, firstName: 'Ann', lastName: 'Lee', phone: '555-1', email: '', rawStatus: 'waitlist' },
  { sourceIndex: 2, firstName: 'Bo', lastName: 'Lee', phone: '', email: '', rawStatus: 'registered' },
];
const waitlistPlan = buildTeleDirectPlan(waitlistRows);
assert.equal(waitlistPlan.counts.primariesWaitlist, 1);
assert.equal(waitlistPlan.counts.confirmedAttendees, 0);
assert.equal(waitlistPlan.payload[0]?.status, 'waitlist');
assert.equal(waitlistPlan.payload[0]?.confirmed, false);

// Unknown and unsupported statuses are never counted as registered, and they block sync.
assert.equal(mapRawStatus(''), 'unknown');
assert.equal(mapRawStatus('pending review'), 'other');
const unknownPlan = buildTeleDirectPlan([
  { sourceIndex: 1, firstName: 'Cy', lastName: 'Doe', phone: '555-2', email: '', rawStatus: '' },
]);
assert.equal(unknownPlan.counts.confirmedAttendees, 0);
assert.ok(unknownPlan.blockers.some((b) => b.code === 'unknown_status'));
const otherPlan = buildTeleDirectPlan([
  { sourceIndex: 1, firstName: 'Di', lastName: 'Doe', phone: '555-3', email: '', rawStatus: 'pending review' },
]);
assert.ok(otherPlan.blockers.some((b) => b.code === 'other_status'));

// Empty feed blocks sync.
assert.ok(buildTeleDirectPlan([]).blockers.some((b) => b.code === 'empty_feed'));

// A contactless active row before any primary blocks sync.
const unresolvedPlan = buildTeleDirectPlan([
  { sourceIndex: 1, firstName: 'Eve', lastName: 'Ng', phone: '', email: '', rawStatus: 'registered' },
  { sourceIndex: 2, firstName: 'Fay', lastName: 'Ng', phone: '555-4', email: '', rawStatus: 'registered' },
]);
assert.ok(unresolvedPlan.blockers.some((b) => b.code === 'unresolved_active'));

// Duplicate identity keys block sync.
const dupPlan = buildTeleDirectPlan([
  { sourceIndex: 1, firstName: 'Gi', lastName: 'Ray', phone: '555-5', email: '', rawStatus: 'registered' },
  { sourceIndex: 2, firstName: 'Gi', lastName: 'Ray', phone: '555-5', email: '', rawStatus: 'registered' },
]);
assert.ok(dupPlan.blockers.some((b) => b.code === 'duplicate_identity_key'));

// Legacy adoption: one matching legacy responder is adopted; ambiguous matches block sync.
const legacyRow: TeleDirectPlanRow = {
  sourceIndex: 1, firstName: 'Hal', lastName: 'Fox', phone: '555-6', email: '', rawStatus: 'registered',
};
const adopted = buildTeleDirectPlan([legacyRow], [
  { id: 'r1', firstName: 'Hal', lastName: 'Fox', phone: '(555) 6', email: '', responseSource: 'call_center', teledirectAttendeeKey: null },
]);
assert.equal(adopted.payload[0]?.responder_id, 'r1');
assert.equal(adopted.counts.adoptedLegacyRows, 1);
assert.equal(adopted.blockers.length, 0);

const ambiguous = buildTeleDirectPlan([legacyRow], [
  { id: 'r1', firstName: 'Hal', lastName: 'Fox', phone: '555-6', email: '', responseSource: 'call_center', teledirectAttendeeKey: null },
  { id: 'r2', firstName: 'Hal', lastName: 'Fox', phone: '555-6', email: '', responseSource: 'call_center', teledirectAttendeeKey: null },
]);
assert.ok(ambiguous.blockers.some((b) => b.code === 'ambiguous_identity_match'));
assert.equal(ambiguous.payload[0]?.responder_id, undefined);

// Manual and CSV responders are never adopted.
const manual = buildTeleDirectPlan([legacyRow], [
  { id: 'm1', firstName: 'Hal', lastName: 'Fox', phone: '555-6', email: '', responseSource: 'manual', teledirectAttendeeKey: null },
]);
assert.equal(manual.payload[0]?.responder_id, undefined);
assert.equal(manual.counts.adoptedLegacyRows, 0);

// Output carries no raw contact values beyond the payload fields the sync needs.
const serializedCounts = JSON.stringify(plan.counts);
assert.ok(!serializedCounts.includes('555-000'));
assert.ok(!serializedCounts.includes('@example.test'));

console.log('teledirect-roster-plan tests passed');
