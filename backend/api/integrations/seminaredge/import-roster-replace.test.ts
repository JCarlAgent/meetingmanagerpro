import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildReplacementRecords,
  executeRosterReplacement,
  validateExpectedCounts,
  default as handler,
} from './import-roster-replace.ts';
import { groupTeleDirectRosterByPrimary, parseTeleDirectRosterDetailed } from '../../../src/lib/teleDirectRoster';

const october13 = parseTeleDirectRosterDetailed(fs.readFileSync('/Users/jack/Downloads/meeting601425-2.xls', 'utf8'));
const october14 = parseTeleDirectRosterDetailed(fs.readFileSync('/Users/jack/Downloads/meeting601426.xls', 'utf8'));

assert.equal(october13.preview.primaryCount, 13, 'October 13 fixture should parse 13 primaries');
assert.equal(october13.preview.guestCount, 11, 'October 13 fixture should parse 11 guests');
assert.equal(october13.preview.cancelledGuestCount, 1, 'October 13 fixture should parse 1 cancelled guest');
assert.equal(october13.preview.totalActiveAttendees, 23, 'October 13 fixture should parse 23 active attendees');
assert.equal(october14.preview.primaryCount, 6, 'October 14 fixture should parse 6 primaries');
assert.equal(october14.preview.guestCount, 4, 'October 14 fixture should parse 4 guests');
assert.equal(october14.preview.cancelledPrimaryCount, 1, 'October 14 fixture should parse 1 cancelled primary');
assert.equal(october14.preview.totalActiveAttendees, 9, 'October 14 fixture should parse 9 active attendees');

const oct13Groups = groupTeleDirectRosterByPrimary(october13.attendees);
const oct13Records = buildReplacementRecords(oct13Groups, '2026-10-13');
assert.equal(oct13Records.length, 13, 'October 13 replacement should write one record per primary');
assert.equal(
  oct13Records.reduce((sum, row) => sum + row.guest_details.length, 0),
  11,
  'October 13 replacement should preserve all guest rows'
);
assert.equal(
  oct13Records.reduce((sum, row) => sum + row.cancelled_guest_count, 0),
  1,
  'October 13 replacement should preserve cancelled guest history'
);
assert.equal(
  oct13Records.reduce((sum, row) => sum + row.guests, 0),
  10,
  'October 13 replacement should count only active guests toward attendance'
);

const oct14Groups = groupTeleDirectRosterByPrimary(october14.attendees);
const oct14Records = buildReplacementRecords(oct14Groups, '2026-10-14');
assert.equal(oct14Records.length, 6, 'October 14 replacement should write one record per primary');
assert.equal(
  oct14Records.filter((row) => row.status === 'cancelled').length,
  1,
  'October 14 replacement should preserve cancelled primary status'
);

validateExpectedCounts({
  eventId: '05cd651c-e005-42a1-a7de-fc1dee6fb624',
  eventMeetingId: '601425',
  preview: october13.preview,
});
validateExpectedCounts({
  eventId: 'cff031aa-6ec1-46ef-b153-16e35237fef1',
  eventMeetingId: '601426',
  preview: october14.preview,
});

assert.throws(
  () => validateExpectedCounts({
    eventId: '05cd651c-e005-42a1-a7de-fc1dee6fb624',
    eventMeetingId: '601425',
    preview: { ...october13.preview, guestCount: 12 },
  }),
  /guest count mismatch/i,
  'Protected initial meeting should reject unexpected roster counts'
);

const rpcCalls: Array<{ method: string; args: any }> = [];
const mockSupabaseAdmin = {
  async rpc(method: string, args: any) {
    rpcCalls.push({ method, args });
    return {
      data: {
        insertedCount: args.p_rows.length,
        deletedCount: 5,
        afterCount: args.p_rows.length,
        activeAttendees: 23,
      },
      error: null,
    };
  },
};
const replacementResult = await executeRosterReplacement({
  supabaseAdmin: mockSupabaseAdmin,
  jobId: 'a37ee672-358a-4c38-9b7b-7a3f98bb98ac',
  eventId: '05cd651c-e005-42a1-a7de-fc1dee6fb624',
  rows: oct13Records,
  actorUserId: '7bb846dd-3f12-4a51-95eb-55c9f7f5e58d',
  requestId: 'unit-test',
});
assert.equal(rpcCalls.length, 1, 'Replacement should execute through one transactional RPC call');
assert.equal(rpcCalls[0].method, 'replace_event_responders_from_teledirect', 'Replacement should use transactional DB function');
assert.equal(replacementResult.insertedCount, oct13Records.length, 'Replacement result should reflect inserted rows');

const mismatchedInsertAdmin = {
  async rpc() {
    return {
      data: { insertedCount: 2 },
      error: null,
    };
  },
};
await assert.rejects(
  executeRosterReplacement({
    supabaseAdmin: mismatchedInsertAdmin,
    jobId: 'a37ee672-358a-4c38-9b7b-7a3f98bb98ac',
    eventId: '05cd651c-e005-42a1-a7de-fc1dee6fb624',
    rows: oct13Records,
    actorUserId: '7bb846dd-3f12-4a51-95eb-55c9f7f5e58d',
    requestId: 'mismatch-test',
  }),
  /inserted 2 rows/i,
  'Replacement should fail if inserted count does not match expected primary rows'
);

const rpcErrorAdmin = {
  async rpc() {
    return {
      data: null,
      error: { message: 'boom' },
    };
  },
};
await assert.rejects(
  executeRosterReplacement({
    supabaseAdmin: rpcErrorAdmin,
    jobId: 'a37ee672-358a-4c38-9b7b-7a3f98bb98ac',
    eventId: '05cd651c-e005-42a1-a7de-fc1dee6fb624',
    rows: oct13Records,
    actorUserId: '7bb846dd-3f12-4a51-95eb-55c9f7f5e58d',
    requestId: 'rpc-error-test',
  }),
  /Roster replacement failed: boom/i,
  'Replacement should surface RPC errors'
);

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

console.log('import-roster-replace regressions: ok');
