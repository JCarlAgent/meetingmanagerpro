import assert from 'node:assert/strict';
import { classifyAttendees, type AttendeeClassificationInput } from './classify-attendees.ts';

// Observed live-fixture rows, API order. Surnames are replaced with synthetic
// tokens that keep the same equality structure (e.g. Sur09 shared by rows 10-11).
// Contact flags are observed booleans, converted to synthetic strings below.
type FixtureRow = [number, string, boolean, boolean, 'registered' | 'cancelled'];
const observed: FixtureRow[] = [
  [1, 'Sur01', true, true, 'registered'],
  [2, 'Sur02', false, false, 'registered'],
  [3, 'Sur03', true, true, 'registered'],
  [4, 'Sur03', false, false, 'registered'],
  [5, 'Sur04', true, true, 'registered'],
  [6, 'Sur05', false, false, 'registered'],
  [7, 'Sur06', true, true, 'registered'],
  [8, 'Sur07', false, false, 'registered'],
  [9, 'Sur08', true, true, 'registered'],
  [10, 'Sur09', false, false, 'cancelled'],
  [11, 'Sur09', true, false, 'registered'],
  [12, 'Sur10', true, true, 'registered'],
  [13, 'Sur10', false, false, 'registered'],
  [14, 'Sur11', true, true, 'registered'],
  [15, 'Sur12', false, false, 'registered'],
  [16, 'Sur13', true, true, 'registered'],
  [17, 'Sur13', false, false, 'registered'],
  [18, 'Sur14', true, true, 'registered'],
  [19, 'Sur14', false, false, 'registered'],
  [20, 'Sur15', true, true, 'registered'],
  [21, 'Sur16', false, false, 'registered'],
  [22, 'Sur17', true, true, 'registered'],
  [23, 'Sur17', false, false, 'registered'],
  [24, 'Sur18', true, true, 'registered'],
  [25, 'Sur19', true, true, 'registered'],
  [26, 'Sur20', false, false, 'registered'],
  [27, 'Sur21', true, true, 'registered'],
  [28, 'Sur22', false, false, 'registered'],
  [29, 'Sur23', true, true, 'registered'],
  [30, 'Sur24', true, true, 'registered'],
  [31, 'Sur24', false, false, 'registered'],
];

// Expected results, kept separate from classifier input.
// [sourceIndex, role, primarySourceIndex, cancelled, linkBasis]
type Expected = [number, 'primary' | 'guest' | 'unresolved', number | null, boolean, string | null];
const expected: Expected[] = [
  [1, 'primary', null, false, null],
  [2, 'guest', 1, false, 'adjacency'],
  [3, 'primary', null, false, null],
  [4, 'guest', 3, false, 'adjacency'],
  [5, 'primary', null, false, null],
  [6, 'guest', 5, false, 'adjacency'],
  [7, 'primary', null, false, null],
  [8, 'guest', 7, false, 'adjacency'],
  [9, 'primary', null, false, null],
  [10, 'guest', 11, true, 'surname-inference'],
  [11, 'primary', null, false, null],
  [12, 'primary', null, false, null],
  [13, 'guest', 12, false, 'adjacency'],
  [14, 'primary', null, false, null],
  [15, 'guest', 14, false, 'adjacency'],
  [16, 'primary', null, false, null],
  [17, 'guest', 16, false, 'adjacency'],
  [18, 'primary', null, false, null],
  [19, 'guest', 18, false, 'adjacency'],
  [20, 'primary', null, false, null],
  [21, 'guest', 20, false, 'adjacency'],
  [22, 'primary', null, false, null],
  [23, 'guest', 22, false, 'adjacency'],
  [24, 'primary', null, false, null],
  [25, 'primary', null, false, null],
  [26, 'guest', 25, false, 'adjacency'],
  [27, 'primary', null, false, null],
  [28, 'guest', 27, false, 'adjacency'],
  [29, 'primary', null, false, null],
  [30, 'primary', null, false, null],
  [31, 'guest', 30, false, 'adjacency'],
];

function toInput(row: FixtureRow): AttendeeClassificationInput {
  const [sourceIndex, lastName, hasPhone, hasEmail, status] = row;
  return {
    sourceIndex,
    lastName,
    phone: hasPhone ? `synthetic-phone-${sourceIndex}` : '',
    email: hasEmail ? `synthetic-${sourceIndex}@example.invalid` : '',
    status,
  };
}

const fixtureInputs = observed.map(toInput);

// Full 31-row fixture.
{
  const result = classifyAttendees(fixtureInputs);
  const byIndex = new Map(result.attendees.map((a) => [a.sourceIndex, a]));

  for (const [sourceIndex, role, primary, cancelled, basis] of expected) {
    const actual = byIndex.get(sourceIndex);
    assert.ok(actual, `missing attendee ${sourceIndex}`);
    assert.equal(actual.role, role, `role for ${sourceIndex}`);
    assert.equal(actual.primarySourceIndex, primary, `parent for ${sourceIndex}`);
    assert.equal(actual.cancelled, cancelled, `cancelled for ${sourceIndex}`);
    assert.equal(actual.linkBasis, basis, `linkBasis for ${sourceIndex}`);
  }

  assert.deepEqual(result.summary, {
    primaries: 17,
    guests: 14,
    registeredGuests: 13,
    cancelledGuests: 1,
    activeAttendees: 30,
    inferredLinks: 1,
    unresolved: 0,
  });

  // Row 9 (primary) has no guest.
  assert.equal(result.attendees.some((a) => a.primarySourceIndex === 9), false);
  // Row 11 (primary) has the cancelled guest at row 10, inferred by unique surname.
  assert.equal(byIndex.get(10)?.primarySourceIndex, 11);
  assert.equal(byIndex.get(10)?.linkBasis, 'surname-inference');
  // Cancelling a guest never cancels the primary.
  assert.equal(byIndex.get(11)?.cancelled, false);
  // Row 12 (primary, different surname from its guest) has row 13 as a registered guest.
  assert.equal(byIndex.get(13)?.primarySourceIndex, 12);
  assert.equal(byIndex.get(13)?.cancelled, false);
}

// Cancelled rows are excluded from the adjacency pass: a contactless active row
// after a cancelled contact row attaches to the preceding active primary.
{
  const result = classifyAttendees([
    { sourceIndex: 1, lastName: 'Alpha', phone: 'p', email: '', status: 'registered' },
    { sourceIndex: 2, lastName: 'Beta', phone: 'p', email: 'e', status: 'cancelled' },
    { sourceIndex: 3, lastName: 'Gamma', phone: '', email: '', status: 'registered' },
  ]);
  assert.equal(result.attendees[2].primarySourceIndex, 1);
  assert.equal(result.attendees[2].linkBasis, 'adjacency');
  assert.equal(result.attendees[1].role, 'primary');
  assert.equal(result.attendees[1].cancelled, true);
}

// Contact values are trimmed; whitespace-only counts as no contact.
{
  const result = classifyAttendees([
    { sourceIndex: 1, lastName: 'A', phone: '   ', email: '\t', status: 'registered' },
    { sourceIndex: 2, lastName: 'A', phone: ' x ', email: '', status: 'registered' },
  ]);
  assert.equal(result.attendees[0].role, 'unresolved');
  assert.equal(result.attendees[1].role, 'primary');
}

// Active contactless row before any primary stays unresolved.
{
  const result = classifyAttendees([
    { sourceIndex: 1, lastName: 'Orphan', phone: '', email: '', status: 'registered' },
    { sourceIndex: 2, lastName: 'Lead', phone: 'p', email: '', status: 'registered' },
  ]);
  assert.equal(result.attendees[0].role, 'unresolved');
  assert.equal(result.summary.unresolved, 1);
}

// Cancelled contactless guest with two matching-surname primaries stays unresolved.
{
  const result = classifyAttendees([
    { sourceIndex: 1, lastName: 'Shared', phone: 'p', email: '', status: 'registered' },
    { sourceIndex: 2, lastName: 'Shared', phone: 'p', email: '', status: 'registered' },
    { sourceIndex: 3, lastName: 'Shared', phone: '', email: '', status: 'cancelled' },
  ]);
  assert.equal(result.attendees[2].role, 'unresolved');
  assert.equal(result.attendees[2].primarySourceIndex, null);
  assert.equal(result.attendees[2].cancelled, true);
  assert.equal(result.attendees[0].cancelled, false);
  assert.equal(result.attendees[1].cancelled, false);
}

// Cancelled contactless guest with no matching-surname primary stays unresolved.
{
  const result = classifyAttendees([
    { sourceIndex: 1, lastName: 'Other', phone: 'p', email: '', status: 'registered' },
    { sourceIndex: 2, lastName: 'Lonely', phone: '', email: '', status: 'cancelled' },
  ]);
  assert.equal(result.attendees[1].role, 'unresolved');
  assert.equal(result.attendees[1].cancelled, true);
  assert.equal(result.summary.inferredLinks, 0);
}

// Existing verified link is preserved over surname inference.
{
  const result = classifyAttendees([
    { sourceIndex: 1, lastName: 'Same', phone: 'p', email: '', status: 'registered' },
    { sourceIndex: 2, lastName: 'Same', phone: 'p', email: '', status: 'registered' },
    { sourceIndex: 3, lastName: 'Same', phone: '', email: '', status: 'cancelled', verifiedPrimarySourceIndex: 2 },
  ]);
  assert.equal(result.attendees[2].primarySourceIndex, 2);
  assert.equal(result.attendees[2].linkBasis, 'verified');
  assert.equal(result.attendees[2].role, 'guest');
  assert.equal(result.summary.inferredLinks, 0);
}

// Surname matching ignores case and extra whitespace.
{
  const result = classifyAttendees([
    { sourceIndex: 1, lastName: '  Van  Dyke ', phone: 'p', email: '', status: 'registered' },
    { sourceIndex: 2, lastName: 'van dyke', phone: '', email: '', status: 'cancelled' },
  ]);
  assert.equal(result.attendees[1].primarySourceIndex, 1);
  assert.equal(result.attendees[1].linkBasis, 'surname-inference');
}

// Duplicate sourceIndex is rejected.
{
  assert.throws(() => classifyAttendees([
    { sourceIndex: 1, lastName: 'A', phone: 'p', email: '', status: 'registered' },
    { sourceIndex: 1, lastName: 'B', phone: 'p', email: '', status: 'registered' },
  ]), /Duplicate sourceIndex 1/);
}

// Input is not mutated and output preserves API order.
{
  const inputs = fixtureInputs.map((row) => ({ ...row }));
  const snapshot = JSON.stringify(inputs);
  const result = classifyAttendees(inputs);
  assert.equal(JSON.stringify(inputs), snapshot);
  assert.deepEqual(result.attendees.map((a) => a.sourceIndex), observed.map((row) => row[0]));
}

console.log('classify-attendees tests passed');
