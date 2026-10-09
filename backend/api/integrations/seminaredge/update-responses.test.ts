import assert from 'node:assert/strict';

import { validateGuestRelationshipData } from './update-responses.ts';

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

console.log('update-responses regressions: ok');
