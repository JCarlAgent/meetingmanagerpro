import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import type { AddressInfo } from 'node:net';

// HTTP-level tests for the Update Confirmations diagnostic mode.
// A local Supabase stub runs the real handler end to end. TeleDirect is replaced
// with a fake https.request that serves a synthetic XML fixture, so no network
// call is made. Every non-GET Supabase request is logged so "no writes" is observable.

const MASTER_TOKEN = 'master-token';
const ADVISOR_TOKEN = 'advisor-token';
const MASTER_ID = 'user-master';
const ADVISOR_ID = 'user-advisor';
const JOB_ID = 'job-kevin';
const EVENT_ID = 'event-oct13';
const STORED_MEETING_ID = '601425';

// Synthetic fixture: 15 primary (A), 13 guests (G, one cancelled), 28 rows total.
// Names, emails, and phones are fake and must never appear in any response.
const PII_TOKENS = ['Zanzibar', 'Quentin', 'zz@example.test', '555-0199'];

function attendeeXml(fields: Record<string, string>): string {
  const inner = Object.entries(fields)
    .map(([k, v]) => `<${k}>${v}</${k}>`)
    .join('');
  return `<Attendee>${inner}</Attendee>`;
}

const fixtureRows: string[] = [];
for (let i = 1; i <= 15; i++) {
  fixtureRows.push(
    attendeeXml({
      AG: 'A',
      AttendeeID: String(1000 + i),
      MainAttendeeID: '0',
      Status: 'Registered',
      FirstName: 'Zanzibar',
      LastName: 'Quentin',
      Email: 'zz@example.test',
      Phone: '555-0199',
    })
  );
}
for (let i = 1; i <= 13; i++) {
  fixtureRows.push(
    attendeeXml({
      AG: 'G',
      AttendeeID: String(2000 + i),
      MainAttendeeID: String(1000 + i),
      Status: i === 13 ? 'Cancelled' : 'Registered',
      FirstName: 'Zanzibar',
      LastName: 'Quentin',
      Email: 'zz@example.test',
      Phone: '555-0199',
    })
  );
}
const FIXTURE_XML = `<?xml version="1.0"?><Attendees>${fixtureRows.join('')}</Attendees>`;

// Fake TeleDirect calls: count them so tests can prove whether the handler called out.
let teleDirectCalls = 0;
let teleDirectXml = FIXTURE_XML;

// Replace https.request before the handler is imported. The handler calls it at request time.
(https as any).request = (_url: string, _opts: any, cb: (res: any) => void) => {
  teleDirectCalls++;
  const req: any = new EventEmitter();
  req.write = () => true;
  req.end = () => {
    const res: any = new EventEmitter();
    res.statusCode = 200;
    res.headers = { 'content-type': 'text/xml' };
    cb(res);
    setImmediate(() => {
      res.emit('data', Buffer.from(teleDirectXml, 'utf8'));
      res.emit('end');
    });
  };
  return req;
};

type Call = { method: string; path: string; body: string };
const calls: Call[] = [];

const state = {
  masterRows: [{ user_id: MASTER_ID }] as Array<{ user_id: string }>,
  jobs: [{ id: JOB_ID, org_id: 'org-1', created_by_user_id: MASTER_ID }] as Array<any>,
  events: [{ id: EVENT_ID, job_id: JOB_ID, teledirect_meeting_id: STORED_MEETING_ID }] as Array<any>,
  creds: null as any,
};

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const url = new URL(req.url ?? '/', 'http://stub');
    const path = url.pathname;
    if (req.method !== 'GET') calls.push({ method: req.method ?? '', path, body });

    const json = (status: number, payload: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    // supabase-js sends Accept: application/vnd.pgrst.object+json for .maybeSingle().
    const wantsObject = String(req.headers.accept ?? '').includes('pgrst.object');
    const respond = (rows: any[]) => {
      if (!wantsObject) return json(200, rows);
      if (rows.length === 1) return json(200, rows[0]);
      return json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
    };
    const eq = (name: string) => url.searchParams.get(name)?.replace(/^eq\./, '');

    if (path === '/auth/v1/user') {
      const token = String(req.headers.authorization ?? '').replace('Bearer ', '');
      if (token === MASTER_TOKEN) return json(200, { id: MASTER_ID, email: 'm@x.test' });
      if (token === ADVISOR_TOKEN) return json(200, { id: ADVISOR_ID, email: 'a@x.test' });
      return json(401, { message: 'invalid' });
    }
    if (path === '/rest/v1/master_admins') {
      return respond(state.masterRows.filter((r) => r.user_id === eq('user_id')));
    }
    if (path === '/rest/v1/jobs') {
      return respond(state.jobs.filter((j) => j.id === eq('id')));
    }
    if (path === '/rest/v1/job_meetings') {
      return respond(state.events.filter((e) => e.id === eq('id') && e.job_id === eq('job_id')));
    }
    if (path === '/rest/v1/user_seminaredge_credentials') {
      return respond(state.creds ? [state.creds] : []);
    }

    // Any unexpected table is an empty result, and any write was logged above.
    return respond([]);
  });
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
const { port } = server.address() as AddressInfo;

process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-test';
process.env.INTEGRATIONS_ENCRYPTION_SECRET = 'test-secret-for-update-responses-http';

const { encryptString } = await import('../../_lib/crypto.ts');
state.creds = {
  user_id: MASTER_ID,
  username_enc: encryptString('test-user'),
  password_enc: encryptString('test-pass'),
};

const { default: handler } = await import('./update-responses.ts');

function invoke(opts: { token?: string; body?: unknown }) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const req: any = { method: 'POST', headers, body: opts.body ?? {} };
  const out: { status: number; json: any; raw: string } = { status: 0, json: undefined, raw: '' };
  const res: any = {
    statusCode: 200,
    setHeader() {},
    end(payload?: string) {
      out.status = res.statusCode;
      out.raw = payload ?? '';
      try {
        out.json = out.raw ? JSON.parse(out.raw) : undefined;
      } catch {
        out.json = undefined;
      }
    },
  };
  return handler(req, res).then(() => out);
}

function resetCounters() {
  calls.length = 0;
  teleDirectCalls = 0;
  teleDirectXml = FIXTURE_XML;
}

const baseBody = { jobId: JOB_ID, eventId: EVENT_ID, meetingId: STORED_MEETING_ID };

// 1. Non-master users are rejected before any TeleDirect call or write.
resetCounters();
{
  const out = await invoke({ token: ADVISOR_TOKEN, body: { ...baseBody, diagnostic: true } });
  assert.equal(out.status, 403);
  assert.equal(teleDirectCalls, 0, 'advisor must not trigger a TeleDirect call');
  assert.equal(calls.length, 0, 'advisor must not trigger any write');
}

// 2. A meeting ID that differs from the stored event meeting is rejected before any TeleDirect call.
resetCounters();
{
  const out = await invoke({ token: MASTER_TOKEN, body: { ...baseBody, meetingId: '999999', diagnostic: true } });
  assert.equal(out.status, 409);
  assert.equal(teleDirectCalls, 0, 'mismatched meeting must not reach TeleDirect');
  assert.equal(calls.length, 0);
}

// 3. Master-admin diagnostic: one read-only TeleDirect call, aggregate counts only, no writes.
resetCounters();
{
  const out = await invoke({ token: MASTER_TOKEN, body: { ...baseBody, diagnostic: true } });
  assert.equal(out.status, 200, `expected 200, got ${out.status}: ${out.raw.slice(0, 200)}`);
  assert.equal(teleDirectCalls, 1, 'diagnostic makes exactly one TeleDirect request');
  assert.equal(calls.length, 0, 'diagnostic performs zero Supabase writes');

  assert.equal(out.json.totalRecords, 28);
  assert.equal(out.json.mainAttendeeIdGreaterThanZero, 13);
  assert.deepEqual(out.json.agMarkers, { A: 15, G: 13, missingOrOther: 0 });
  assert.equal(out.json.statusCounts.cancelled, 1);
  assert.equal(out.json.classification.primaryRows, 15);
  assert.equal(out.json.classification.guestRows, 13);
  assert.equal(out.json.classification.cancelledGuestRows, 1);
  assert.equal(out.json.classification.activeAttendees, 27);
  assert.equal(out.json.expectation.reproduces, true);
  assert.equal(out.json.orderEvidence.conclusion, 'sequence_ascending_in_record_order');
  assert.equal(out.json.orderEvidence.sequenceFields[0].field, 'AttendeeID');
  assert.equal(out.json.contactPairing.rowsMissingBothPhoneAndEmail, 0);
  assert.equal(out.json.contactPairing.unresolvedRows, 28);

  for (const token of PII_TOKENS) {
    assert.ok(!out.raw.includes(token), `diagnostic response must not contain personal data (${token})`);
  }
  assert.ok(!out.raw.includes('<Attendee'), 'diagnostic response must not contain raw XML');
}

// 3b. Ordered preview requires BOTH diagnostic and orderPreview; source order preserved, no writes.
resetCounters();
{
  const out = await invoke({ token: MASTER_TOKEN, body: { ...baseBody, dryRun: true, orderPreview: true } });
  assert.equal(out.status, 200, `expected 200, got ${out.status}: ${out.raw.slice(0, 200)}`);
  assert.equal(out.json.orderPreview, undefined, 'orderPreview alone must not enable the preview');
  assert.equal(out.json.expectation, undefined, 'orderPreview alone must not return diagnostic output');
  assert.equal(calls.length, 0, 'orderPreview with dryRun performs zero Supabase writes');
}
resetCounters();
{
  const out = await invoke({ token: MASTER_TOKEN, body: { ...baseBody, diagnostic: true, orderPreview: true } });
  assert.equal(out.status, 200, `expected 200, got ${out.status}: ${out.raw.slice(0, 200)}`);
  assert.equal(teleDirectCalls, 1, 'order preview makes exactly one TeleDirect request');
  assert.equal(calls.length, 0, 'order preview performs zero Supabase writes');
  assert.equal(out.json.orderPreview.length, 28);
  assert.deepEqual(
    out.json.orderPreview.map((row: { sourceIndex: number }) => row.sourceIndex),
    Array.from({ length: 28 }, (_, i) => i + 1),
    'preview is one-based and in API source order'
  );
  assert.equal(out.json.orderPreview[27].status, 'cancelled', 'cancelled row stays at its source position');
  assert.equal(out.json.orderPreview.every((row: { hasPhone: boolean }) => row.hasPhone === true), true);
  assert.equal(out.json.orderPreview.every((row: { hasEmail: boolean }) => row.hasEmail === true), true);
  for (const token of ['zz@example.test', '555-0199']) {
    assert.ok(!out.raw.includes(token), `order preview must not contain contact data (${token})`);
  }
  assert.ok(!out.raw.includes('<Attendee'), 'order preview must not contain raw XML');
}

// 4. Normal path (dryRun, no diagnostic flag) still runs and does not return diagnostic output.
resetCounters();
{
  const out = await invoke({ token: MASTER_TOKEN, body: { ...baseBody, dryRun: true } });
  assert.equal(out.status, 200, `expected 200, got ${out.status}: ${out.raw.slice(0, 200)}`);
  assert.equal(teleDirectCalls, 1, 'normal dry run still calls TeleDirect once');
  assert.equal(calls.length, 0, 'dry run performs zero Supabase writes');
  assert.equal(out.json.expectation, undefined, 'normal path must not return diagnostic fields');
  assert.equal(out.json.totalRecords, undefined, 'normal path must not return diagnostic fields');
}

server.close();
console.log('update-responses http diagnostic tests: ok');
