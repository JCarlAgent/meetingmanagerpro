import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseTeleDirectRosterText } from './teleDirectRoster';

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

console.log('teleDirectRoster parser checks: ok');
