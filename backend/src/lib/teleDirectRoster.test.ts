import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseTeleDirectRosterDetailed, parseTeleDirectRosterText } from './teleDirectRoster';

const meeting601425 = parseTeleDirectRosterText(fs.readFileSync('/Users/jack/Downloads/meeting601425-2.xls', 'utf8'));
assert.equal(meeting601425.primaryCount, 13, 'Meeting 601425 primary count should be 13');
assert.equal(meeting601425.guestCount, 11, 'Meeting 601425 guest count should be 11');
assert.equal(meeting601425.cancelledGuestCount, 1, 'Meeting 601425 cancelled guest count should be 1');
assert.equal(meeting601425.cancelledPrimaryCount, 0, 'Meeting 601425 cancelled primary count should be 0');

const meeting601426 = parseTeleDirectRosterText(fs.readFileSync('/Users/jack/Downloads/meeting601426.xls', 'utf8'));
assert.equal(meeting601426.primaryCount, 6, 'Meeting 601426 primary count should be 6');
assert.equal(meeting601426.guestCount, 4, 'Meeting 601426 guest count should be 4');
assert.equal(meeting601426.cancelledPrimaryCount, 1, 'Meeting 601426 cancelled primary count should be 1');
assert.equal(meeting601426.cancelledGuestCount, 0, 'Meeting 601426 cancelled guest count should be 0');

const detailed601425 = parseTeleDirectRosterDetailed(fs.readFileSync('/Users/jack/Downloads/meeting601425-2.xls', 'utf8'));
assert.equal(detailed601425.attendees.filter((row) => row.attendeeType === 'A').length, 13, 'Detailed rows should keep 13 primaries');
assert.equal(detailed601425.attendees.filter((row) => row.attendeeType === 'G').length, 11, 'Detailed rows should keep 11 guests');
assert.equal(
  detailed601425.attendees.filter((row) => row.attendeeType === 'G' && row.primaryRosterIndex !== null).length,
  11,
  'Every guest row should remain attached to a preceding primary row'
);

console.log('teleDirectRoster parser checks: ok');
