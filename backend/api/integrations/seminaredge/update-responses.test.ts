import assert from 'node:assert/strict';

import { buildOrderPreview, buildTeleDirectFeedDiagnostic, checkStoredMeetingId, validateGuestRelationshipData } from './update-responses.ts';

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

// Order evidence: minute-precision registration timestamps and an ascending attendee ID.
const orderRecords = [
  { AttendeeID: '1', 'A/G': 'A', RegistrationDate: '10/13/2025 9:05 AM', LastName: 'Alpha', Phone: '555-0101' },
  { AttendeeID: '2', 'A/G': 'G', MainAttendeeID: '1', RegistrationDate: '10/13/2025 9:07 AM', LastName: 'Bravo' },
  { AttendeeID: '3', 'A/G': 'A', RegistrationDate: '10/13/2025 10:00 AM', LastName: 'Charlie', Email: 'c@y.test' },
  { AttendeeID: '4', 'A/G': 'A', RegistrationDate: '10/13/2025 9:30 PM', LastName: 'Delta' },
];
const orderDiag = buildTeleDirectFeedDiagnostic(orderRecords, '601426');
const regField = orderDiag.orderEvidence.dateTimeFields.find((f) => f.field === 'RegistrationDate');
assert.ok(regField, 'RegistrationDate is reported as a date/time field');
assert.equal(regField.nonEmpty, 4);
assert.equal(regField.precision.minute, 4);
assert.equal(regField.precision.second, 0);
assert.equal(regField.precision.unparsed, 0);
assert.equal(regField.comparablePairs, 3);
assert.equal(regField.ascendingPairs, 3);
assert.equal(regField.descendingPairs, 0);
assert.equal(orderDiag.orderEvidence.conclusion, 'sequence_ascending_in_record_order');
const idField = orderDiag.orderEvidence.sequenceFields.find((f) => f.field === 'AttendeeID');
assert.ok(idField, 'AttendeeID is reported as a sequence field');
assert.equal(idField.numeric, 4);
assert.equal(idField.unique, 4);
assert.equal(idField.ascendingPairs, 3);

// Second-precision timestamps with a reversed sequence: no sequence evidence, descending timestamps reported.
const reversedDiag = buildTeleDirectFeedDiagnostic(
  [
    { RegistrationDateTime: '2025-10-13 09:05:12', LastName: 'Echo' },
    { RegistrationDateTime: '2025-10-13 09:04:00', LastName: 'Foxtrot' },
    { RegistrationDateTime: 'not a date', LastName: 'Golf' },
  ],
  '601426'
);
const reversedField = reversedDiag.orderEvidence.dateTimeFields.find((f) => f.field === 'RegistrationDateTime');
assert.ok(reversedField);
assert.equal(reversedField.precision.second, 2);
assert.equal(reversedField.precision.unparsed, 1);
assert.equal(reversedField.descendingPairs, 1);
assert.equal(reversedDiag.orderEvidence.conclusion, 'timestamp_nonincreasing_in_record_order');

// Contact pairing: [Smith+phone, Smith no contact, Jones+email, Doe no contact].
const pairDiag = buildTeleDirectFeedDiagnostic(
  [
    { LastName: 'Smith', Phone: '555-0201' },
    { LastName: 'Smith' },
    { LastName: 'Jones', Email: 'j@y.test' },
    { LastName: 'Doe' },
  ],
  '601426'
);
assert.equal(pairDiag.contactPairing.rowsMissingBothPhoneAndEmail, 2);
assert.equal(pairDiag.contactPairing.consecutivePairsSameSurname, 1);
assert.equal(pairDiag.contactPairing.consecutivePairsSecondLacksContact, 2);
assert.equal(pairDiag.contactPairing.consecutivePairsSameSurnameAndSecondLacksContact, 1);
assert.equal(pairDiag.contactPairing.inferredPairs, 1);
assert.equal(pairDiag.contactPairing.unresolvedRows, 2);
assert.equal(pairDiag.orderEvidence.conclusion, 'none');

// Privacy: none of the new sections may echo names, contact details, or dates.
const orderJson = JSON.stringify({ orderDiag, reversedDiag, pairDiag });
for (const secret of ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Smith', 'Jones', 'Doe', 'c@y.test', 'j@y.test', '555-0201', '10/13/2025', '2025-10-13']) {
  assert.equal(orderJson.includes(secret), false, `order diagnostic leaked ${secret}`);
}

// Order preview: source order preserved, cancelled rows kept, contact reduced to booleans.
const previewRecords = [
  { FirstName: ' Kim ', LastName: 'Alston', Phone: '555-0301', Email: '', Status: 'Registered' },
  { FirstName: 'Alvin', LastName: 'Williams', Phone: '', Email: '  ', Status: 'Registered' },
  { FirstName: 'Pat', LastName: 'Ortiz', Phone: '', Email: 'pat@y.test', Status: 'Cancelled' },
  { FirstName: 'Quinn', LastName: 'Moss', Phone: '   ', Email: '', Status: 'Registered' },
];
const preview = buildOrderPreview(previewRecords);
assert.deepEqual(
  preview.map((row) => row.sourceIndex),
  [1, 2, 3, 4],
  'preview keeps one-based source order'
);
assert.deepEqual(
  preview.map((row) => row.lastName),
  ['Alston', 'Williams', 'Ortiz', 'Moss'],
  'preview is not sorted or filtered'
);
assert.equal(preview[0].firstName, 'Kim', 'names are trimmed');
assert.deepEqual(
  preview.map((row) => [row.hasPhone, row.hasEmail]),
  [
    [true, false],
    [false, false],
    [false, true],
    [false, false],
  ],
  'contact booleans use trimmed nonempty values'
);
assert.equal(preview[2].status, 'cancelled', 'cancelled rows stay in the preview');

const previewDiag = buildTeleDirectFeedDiagnostic(previewRecords, '601425', { includeOrderPreview: true });
assert.equal(previewDiag.orderPreview.length, 4);
assert.equal(buildTeleDirectFeedDiagnostic(previewRecords, '601425').orderPreview, undefined, 'preview is opt-in');
const previewJson = JSON.stringify(previewDiag);
for (const secret of ['555-0301', 'pat@y.test']) {
  assert.equal(previewJson.includes(secret), false, `order preview leaked ${secret}`);
}
for (const row of previewDiag.orderPreview) {
  assert.deepEqual(Object.keys(row).sort(), ['firstName', 'hasEmail', 'hasPhone', 'lastName', 'sourceIndex', 'status']);
}

console.log('update-responses regressions: ok');
