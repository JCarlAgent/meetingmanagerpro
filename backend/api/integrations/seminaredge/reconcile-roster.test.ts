import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseTeleDirectRosterDetailed } from '../../../src/lib/teleDirectRoster';
import handler, { reconcileRosterReadOnly } from './reconcile-roster.ts';

const roster601425 = parseTeleDirectRosterDetailed(fs.readFileSync('/Users/jack/Downloads/meeting601425-2.xls', 'utf8'));
const roster601426 = parseTeleDirectRosterDetailed(fs.readFileSync('/Users/jack/Downloads/meeting601426.xls', 'utf8'));

assert.equal(roster601425.preview.primaryCount, 13, 'fixture 601425 must parse 13 primaries');
assert.equal(roster601425.preview.guestCount, 11, 'fixture 601425 must parse 11 guests');
assert.equal(roster601426.preview.primaryCount, 6, 'fixture 601426 must parse 6 primaries');
assert.equal(roster601426.preview.guestCount, 4, 'fixture 601426 must parse 4 guests');

const sampleResponders = [
  { id: 'r1', first_name: 'John', last_name: 'Adams', phone: '7025551000', email: 'john@example.com', guests: 1, guest_name: 'Mary Adams', status: 'registered' },
  { id: 'r2', first_name: 'John', last_name: 'Adams', phone: '7025551000', email: 'john.dup@example.com', guests: 0, guest_name: null, status: 'registered' },
  { id: 'r3', first_name: 'Jane', last_name: 'Doe', phone: null, email: 'jane@example.com', guests: 0, guest_name: null, status: 'registered' },
  { id: 'r4', first_name: 'Mary', last_name: 'Adams', phone: null, email: null, guests: 0, guest_name: null, status: 'registered' },
  { id: 'r5', first_name: 'Alex', last_name: 'Stone', phone: null, email: null, guests: 0, guest_name: null, status: 'cancelled' },
];

const sampleRosterRows = [
  { attendeeType: 'A', firstName: 'John', lastName: 'Adams', fullName: 'John Adams', phone: '702-555-1000', email: '', status: 'registered', isCancelled: false, primaryRosterIndex: 0 },
  { attendeeType: 'A', firstName: 'Jane', lastName: 'Doe', fullName: 'Jane Doe', phone: '', email: 'jane@example.com', status: 'registered', isCancelled: false, primaryRosterIndex: 1 },
  { attendeeType: 'A', firstName: 'Alex', lastName: 'Stone', fullName: 'Alex Stone', phone: '', email: '', status: 'cancelled', isCancelled: true, primaryRosterIndex: 2 },
  { attendeeType: 'G', firstName: 'Mary', lastName: 'Adams', fullName: 'Mary Adams', phone: '', email: '', status: 'registered', isCancelled: false, primaryRosterIndex: 0 },
  { attendeeType: 'G', firstName: 'No', lastName: 'Match', fullName: 'No Match', phone: '', email: '', status: 'registered', isCancelled: false, primaryRosterIndex: 1 },
] as any;

const summary = reconcileRosterReadOnly({
  rosterRows: sampleRosterRows,
  responders: sampleResponders as any,
});

assert.equal(summary.readOnly, true, 'reconciliation must be read-only');
assert.equal(summary.rosterSummary.primaryRegistrants, 3, 'expected 3 roster primaries');
assert.equal(summary.rosterSummary.guestRecords, 2, 'expected 2 roster guests');
assert.equal(summary.databaseSummary.excessDuplicateRows, 1, 'expected one excess duplicate row');
assert.equal(summary.databaseSummary.rowsInDuplicateGroups, 2, 'expected two rows in duplicate groups');
assert.equal(summary.databaseSummary.guestAsPrimaryRecords, 1, 'expected one guest-as-primary row');
assert.equal(summary.proposedReconciliation.guestRecordsToAttach, 1, 'expected one guest needing attachment');
assert.equal(summary.proposedReconciliation.expectedCanonicalPrimaryCount, 3, 'canonical primary count should follow roster primaries');

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
