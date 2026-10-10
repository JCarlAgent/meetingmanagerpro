import assert from 'node:assert/strict';
import fs from 'node:fs';
import { groupTeleDirectRosterByPrimary, parseTeleDirectRosterDetailed, parseTeleDirectRosterText } from './teleDirectRoster';

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
const grouped601425 = groupTeleDirectRosterByPrimary(detailed601425.attendees);
assert.equal(grouped601425.length, 13, 'Grouped roster should keep 13 primary records');
assert.equal(grouped601425.reduce((sum, primary) => sum + primary.guests.length, 0), 11, 'Grouped roster should retain all 11 guests');
assert.equal(
  grouped601425.reduce((sum, primary) => sum + primary.guests.filter((guest) => guest.isCancelled).length, 0),
  1,
  'Grouped roster should preserve cancelled guest status'
);

const detailed601426 = parseTeleDirectRosterDetailed(fs.readFileSync('/Users/jack/Downloads/meeting601426.xls', 'utf8'));
const grouped601426 = groupTeleDirectRosterByPrimary(detailed601426.attendees);
assert.equal(grouped601426.length, 6, 'Grouped roster should keep 6 primaries for meeting 601426');
assert.equal(grouped601426.filter((primary) => primary.isCancelled).length, 1, 'Grouped roster should preserve cancelled primary status');

assert.throws(
  () => groupTeleDirectRosterByPrimary([
    {
      rowIndex: 0,
      attendeeType: 'G',
      firstName: 'Orphan',
      lastName: 'Guest',
      fullName: 'Orphan Guest',
      phone: null,
      email: null,
      status: 'registered',
      isCancelled: false,
      primaryRosterIndex: null,
    },
  ]),
  /orphaned/i,
  'Grouping should reject orphan guest rows'
);

// Postal fields: the October exports leave these empty, so use an inline fixture with values.
const postalHeader = ['TimeStamp','Attendee/Guest','FirstName','LastName','PhoneNumber','Email','Address','City','State','ZipCode','MealSelected','Source','PromptedToCall','Question1','Question2','Question3','Status','ConfirmationCall','Notes','AdditionalNotes','CreatedBy'];
const postalRow = (type, first, last, addr, city, state, zip, status) => [
  '2025-10-01 10:00', type, first, last, '5550001111', '', addr, city, state, zip, '', '', '', '', '', '', status, '', '', '', 'test',
].join('\t');
const postalText = [
  postalHeader.join('\t'),
  postalRow('A', 'Ann', 'Smith', '12 Oak St', 'Springfield', 'IL', '62701', 'registered'),
  postalRow('G', 'Ben', 'Smith', '', '', '', '', 'registered'),
  postalRow('A', 'Carl', 'Jones', '', '', '', '', 'registered'),
].join('\r\n');
const postalDetailed = parseTeleDirectRosterDetailed(postalText);
const ann = postalDetailed.attendees.find((row) => row.firstName === 'Ann');
assert.equal(ann?.address, '12 Oak St', 'Attendee address should be extracted');
assert.equal(ann?.city, 'Springfield', 'Attendee city should be extracted');
assert.equal(ann?.state, 'IL', 'Attendee state should be extracted');
assert.equal(ann?.zip, '62701', 'Attendee zip should be extracted');
const postalGrouped = groupTeleDirectRosterByPrimary(postalDetailed.attendees);
assert.equal(postalGrouped[0].zip, '62701', 'Primary zip should carry onto the grouped primary');
assert.equal(postalGrouped[0].guests.length, 1, 'Guest should stay attached to the Ann primary');
assert.equal(postalGrouped[1].zip, null, 'Empty postal columns should yield null, not an empty string');

console.log('teleDirectRoster parser checks: ok');
