import assert from 'node:assert/strict';

import { buildTeleDirectFeedDiagnostic, checkStoredMeetingId, validateGuestRelationshipData } from './update-responses.ts';

const blockedRecords = [
  { AttendeeID: '11', MainAttendeeID: '0' },
  { AttendeeID: '12', MainAttendeeID: '0' },
];

const validGuestRecords = [
  { AttendeeID: '101', MainAttendeeID: '100' },
  { AttendeeID: '100', MainAttendeeID: '0' },
];

const validAgMarkerRecords = [
  { 'A/G': 'A', AttendeeID: '200', FirstName: 'Alice', LastName: 'Primary' },
  { 'A/G': 'G', AttendeeID: '201', MainAttendeeID: '200', FirstName: 'Guest', LastName: 'One' },
];

assert.equal(validateGuestRelationshipData(blockedRecords).ok, false);
assert.equal(validateGuestRelationshipData(validGuestRecords).ok, true);
assert.equal(validateGuestRelationshipData(validAgMarkerRecords).ok, true);

// Stored meeting ID must exist and match the request before any TeleDirect call.
assert.equal(checkStoredMeetingId('601425', '601425').ok, true);
assert.equal(checkStoredMeetingId('601425', '601426').ok, false);
assert.equal(checkStoredMeetingId('601425', '601426').reason, 'meeting_id_mismatch');
assert.equal(checkStoredMeetingId(null, '601425').ok, false);
assert.equal(checkStoredMeetingId('', '601425').reason, 'stored_meeting_id_missing');

// Diagnostic: 15 primary, 13 guests (one cancelled), 27 active attendees, synthetic data.
const diagRecords: Record<string, string>[] = [];
for (let i = 1; i <= 15; i++) {
  diagRecords.push({ 'A/G': 'A', AttendeeID: String(1000 + i), MainAttendeeID: '0', Status: 'Registered', FirstName: 'Secret', LastName: 'Name', Email: 'x@y.test' });
}
for (let i = 1; i <= 13; i++) {
  diagRecords.push({
    'A/G': 'G',
    AttendeeID: String(2000 + i),
    MainAttendeeID: String(1000 + i),
    Status: i === 13 ? 'Cancelled' : 'Registered',
    FirstName: 'Gwendolyn',
    LastName: 'Secret',
    Phone: '555-0100',
  });
}
const diag = buildTeleDirectFeedDiagnostic(diagRecords, '601425');
assert.equal(diag.totalRecords, 28);
assert.equal(diag.mainAttendeeIdGreaterThanZero, 13);
assert.deepEqual(diag.agMarkers, { A: 15, G: 13, missingOrOther: 0 });
assert.equal(diag.classification.primaryRows, 15);
assert.equal(diag.classification.guestRows, 13);
assert.equal(diag.classification.cancelledGuestRows, 1);
assert.equal(diag.classification.activeAttendees, 27);
assert.equal(diag.classification.unresolvedRelationshipRows, 0);
assert.equal(diag.expectation.applicable, true);
assert.equal(diag.expectation.reproduces, true);
assert.ok(diag.relevantFieldNames.includes('MainAttendeeID'));
assert.ok(diag.relevantFieldNames.includes('A/G'));

// Output must contain no personal data or raw values.
const diagJson = JSON.stringify(diag);
for (const secret of ['Secret', 'Gwendolyn', 'x@y.test', '555-0100']) {
  assert.equal(diagJson.includes(secret), false, `diagnostic leaked ${secret}`);
}

// Unresolved guest (main attendee not in roster) is reported, not guessed.
const diagUnresolved = buildTeleDirectFeedDiagnostic(
  [{ 'A/G': 'G', AttendeeID: '9', MainAttendeeID: '777' }],
  '601426'
);
assert.equal(diagUnresolved.classification.unresolvedRelationshipRows, 1);
assert.equal(diagUnresolved.expectation.applicable, false);
assert.equal(diagUnresolved.expectation.reproduces, null);

// Non-target meeting skips the expectation check entirely.
assert.equal(buildTeleDirectFeedDiagnostic(diagRecords, '601426').expectation.applicable, false);

console.log('update-responses regressions: ok');
