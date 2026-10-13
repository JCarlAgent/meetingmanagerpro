import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import type { AddressInfo } from 'node:net';

// HTTP-level tests for Update Confirmations: diagnostic, dry run, and synchronization.
// A local Supabase stub runs the real handler end to end. The
// sync_event_responders_from_teledirect RPC is simulated in memory with the same contract:
// key matching, legacy adoption, updates in place, no deletes, and all-or-nothing writes.
// TeleDirect is replaced with a fake https.request serving a synthetic XML feed, so no
// network call is made. Every non-GET request is logged so "no writes" is observable.

const MASTER_TOKEN = 'master-token';
const ADVISOR_TOKEN = 'advisor-token';
const MASTER_ID = 'user-master';
const ADVISOR_ID = 'user-advisor';
const JOB_ID = 'job-kevin';
const EVENT_ID = 'event-oct13';
const STORED_MEETING_ID = '601425';
const RPC_PATH = '/rest/v1/rpc/sync_event_responders_from_teledirect';
const ENRICHMENT_PATH = '/rest/v1/campaign_mailed_list_records';

// Synthetic 31-row feed in API order, shaped like the verified live feed: 17 primaries,
// 14 guests (13 registered, 1 cancelled), 30 active attendees. Names, phones, and emails
// are invented. Tuple: [first, last, A/G, status, hasPhone, hasEmail, parent sourceIndex].
const FEED: Array<[string, string, 'A' | 'G', string, boolean, boolean, number | null]> = [
  ['Sheri', 'Bayles', 'A', 'Registered', true, true, null],
  ['Yan', 'Skell', 'G', 'Registered', false, false, 1],
  ['Wes', 'Ortega', 'A', 'Registered', true, true, null],
  ['Ines', 'Ortega', 'G', 'Registered', false, false, 3],
  ['Cory', 'Ricker', 'A', 'Registered', true, true, null],
  ['Joy', 'Goodall', 'G', 'Registered', false, false, 5],
  ['Kim', 'Alvarez', 'A', 'Registered', true, true, null],
  ['Alan', 'Wallis', 'G', 'Registered', false, false, 7],
  ['Mara', 'Wynn', 'A', 'Registered', true, true, null],
  ['Cora', 'Marsh', 'G', 'Cancelled', false, false, 11],
  ['Don', 'Marsh', 'A', 'Registered', true, false, null],
  ['Pam', 'Young', 'A', 'Registered', true, true, null],
  ['Lisa', 'Young', 'G', 'Registered', false, false, 12],
  ['Jan', 'Mackey', 'A', 'Registered', true, true, null],
  ['James', 'Stanley', 'G', 'Registered', false, false, 14],
  ['Rita', 'Brewer', 'A', 'Registered', true, true, null],
  ['Rob', 'Brewer', 'G', 'Registered', false, false, 16],
  ['Rand', 'Mathis', 'A', 'Registered', true, true, null],
  ['Nan', 'Mathis', 'G', 'Registered', false, false, 18],
  ['Dot', 'Chavez', 'A', 'Registered', true, true, null],
  ['Clem', 'Hodges', 'G', 'Registered', false, false, 20],
  ['Chel', 'Stubbs', 'A', 'Registered', true, true, null],
  ['Jon', 'Stubbs', 'G', 'Registered', false, false, 22],
  ['Mai', 'Thomas', 'A', 'Registered', true, true, null],
  ['Ernie', 'Hawkins', 'A', 'Registered', true, true, null],
  ['Crys', 'Wilber', 'G', 'Registered', false, false, 25],
  ['Nic', 'Vance', 'A', 'Registered', true, true, null],
  ['Sophie', 'Myers', 'G', 'Registered', false, false, 27],
  ['Brit', 'Svenson', 'A', 'Registered', true, true, null],
  ['Kel', 'Anderson', 'A', 'Registered', true, true, null],
  ['Mike', 'Anderson', 'G', 'Registered', false, false, 30],
];

// Personal-data tokens taken from the synthetic feed. None may appear in any response.
const PII_TOKENS = ['Bayles', 'Skell', 'Marsh', 'p1@example.test', '555-0101'];

function attendeeXml(fields: Record<string, string>): string {
  const inner = Object.entries(fields)
    .map(([k, v]) => `<${k}>${v}</${k}>`)
    .join('');
  return `<Attendee>${inner}</Attendee>`;
}

function buildFeedXml(statusOverrides: Record<number, string> = {}): string {
  const rows = FEED.map(([first, last, role, status, hasPhone, hasEmail, parent], i) => {
    const sourceIndex = i + 1;
    return attendeeXml({
      AG: role,
      AttendeeID: String(1000 + sourceIndex),
      MainAttendeeID: parent === null ? '0' : String(1000 + parent),
      Status: statusOverrides[sourceIndex] ?? status,
      FirstName: first,
      LastName: last,
      ...(hasEmail ? { Email: `p${sourceIndex}@example.test` } : {}),
      ...(hasPhone ? { Phone: `555-01${String(sourceIndex).padStart(2, '0')}` } : {}),
    });
  });
  return `<?xml version="1.0"?><Attendees>${rows.join('')}</Attendees>`;
}

const DEFAULT_FEED_XML = buildFeedXml();

// Fake TeleDirect calls, so tests can prove whether the handler called out.
let teleDirectCalls = 0;
let teleDirectXml = DEFAULT_FEED_XML;

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
const requestLog: string[] = [];
const rpcPayloads: any[] = [];
const flags = { rpcFailNext: false, enrichmentFail: false };

const KNOWN_PATHS = new Set([
  '/auth/v1/user',
  '/rest/v1/master_admins',
  '/rest/v1/jobs',
  '/rest/v1/job_meetings',
  '/rest/v1/user_seminaredge_credentials',
  '/rest/v1/responders',
  RPC_PATH,
]);

// Paths outside the handler's own reads and the RPC are treated as demographic enrichment.
const nonKnownPaths = () => requestLog.filter((p) => !KNOWN_PATHS.has(p));

const state = {
  masterRows: [{ user_id: MASTER_ID }] as Array<{ user_id: string }>,
  jobs: [{ id: JOB_ID, org_id: 'org-1', created_by_user_id: MASTER_ID }] as Array<any>,
  events: [{ id: EVENT_ID, job_id: JOB_ID, teledirect_meeting_id: STORED_MEETING_ID }] as Array<any>,
  creds: null as any,
  responders: [] as Array<Record<string, any>>,
};

const SEED_RESPONDERS = (): Array<Record<string, any>> => [
  // Legacy row matching the feed's first primary by name and phone, with no identity key yet.
  {
    id: 'legacy-sheri',
    campaign_id: JOB_ID,
    event_id: EVENT_ID,
    first_name: 'Sheri',
    last_name: 'Bayles',
    phone: '555-0101',
    email: '',
    response_source: 'call_center',
    teledirect_attendee_key: null,
    city: 'Keepcity',
    state: 'KC',
    zip: '00001',
    attended: false,
  },
  // Manual responder: must survive every sync untouched.
  {
    id: 'manual-1',
    campaign_id: JOB_ID,
    event_id: EVENT_ID,
    first_name: 'Walk',
    last_name: 'In',
    phone: '',
    email: '',
    response_source: 'manual',
    teledirect_attendee_key: null,
    city: 'Manualtown',
    attended: false,
  },
];

// Simulates the RPC contract: all-or-nothing, key-based updates, adoption by responder_id,
// inserts only for unmatched rows, and no deletes.
function applySync(p: any) {
  if (!Array.isArray(p.p_rows) || p.p_rows.length === 0) throw new Error('p_rows must be a non-empty array');
  const draft = state.responders.map((r) => ({ ...r }));
  const inEvent = (r: any) => r.campaign_id === p.p_job_id && r.event_id === p.p_event_id;
  const keys = new Set<string>();
  let inserted = 0;
  let updated = 0;
  let adopted = 0;
  for (const row of p.p_rows) {
    if (keys.has(row.teledirect_attendee_key)) throw new Error('duplicate teledirect_attendee_key in payload');
    keys.add(row.teledirect_attendee_key);
    let target: any;
    if (row.responder_id) {
      target = draft.find((r) => r.id === row.responder_id && inEvent(r));
      if (!target) throw new Error('adoption target not found in event');
      adopted++;
    } else {
      target = draft.find((r) => inEvent(r) && r.teledirect_attendee_key === row.teledirect_attendee_key);
      if (target) updated++;
    }
    if (!target) {
      target = {
        id: `resp-${draft.length + 1}`,
        campaign_id: p.p_job_id,
        event_id: p.p_event_id,
        response_source: 'call_center',
        attended: false,
        city: null,
        state: null,
        zip: null,
      };
      draft.push(target);
      inserted++;
    }
    Object.assign(target, {
      teledirect_attendee_key: row.teledirect_attendee_key,
      first_name: row.first_name,
      last_name: row.last_name,
      phone: row.phone,
      email: row.email,
      status: row.status,
      confirmed: row.confirmed,
      guests: row.guests,
      guest_name: row.guest_name,
      guest_details: row.guest_details,
      cancelled_guest_count: row.cancelled_guest_count,
    });
  }
  const retainedAbsent = draft.filter(
    (r) => inEvent(r) && r.teledirect_attendee_key && !keys.has(r.teledirect_attendee_key)
  ).length;
  state.responders = draft;
  return {
    jobId: p.p_job_id,
    eventId: p.p_event_id,
    requestId: p.p_request_id,
    actorUserId: p.p_actor_user_id,
    payloadCount: p.p_rows.length,
    inserted,
    updated,
    adopted,
    retainedAbsent,
    eventResponderCount: draft.filter(inEvent).length,
  };
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const url = new URL(req.url ?? '/', 'http://stub');
    const path = url.pathname;
    requestLog.push(path);
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
    if (path === '/rest/v1/responders' && req.method === 'GET') {
      const rows = state.responders.filter((r) => r.campaign_id === eq('campaign_id') && r.event_id === eq('event_id'));
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? rows.length);
      return json(200, rows.slice(offset, offset + limit));
    }
    if (path === RPC_PATH) {
      const payload = JSON.parse(body || '{}');
      rpcPayloads.push(payload);
      if (flags.rpcFailNext) {
        flags.rpcFailNext = false;
        return json(500, { message: 'simulated atomic failure' });
      }
      try {
        return json(200, applySync(payload));
      } catch (error: any) {
        return json(400, { message: error.message });
      }
    }
    if (path === ENRICHMENT_PATH && flags.enrichmentFail) {
      return json(500, { message: 'simulated enrichment failure' });
    }

    // Any other table is an empty result. Writes were logged above.
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

function reset(opts: { seed?: boolean } = {}) {
  calls.length = 0;
  requestLog.length = 0;
  rpcPayloads.length = 0;
  teleDirectCalls = 0;
  teleDirectXml = DEFAULT_FEED_XML;
  flags.rpcFailNext = false;
  flags.enrichmentFail = false;
  state.responders = opts.seed === false ? [] : SEED_RESPONDERS();
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const baseBody = { jobId: JOB_ID, eventId: EVENT_ID, meetingId: STORED_MEETING_ID };
const syncedRows = () => state.responders.filter((r) => r.teledirect_attendee_key);

// 1. Non-master users are rejected before any TeleDirect call or write, in every mode.
reset();
{
  const diag = await invoke({ token: ADVISOR_TOKEN, body: { ...baseBody, diagnostic: true } });
  assert.equal(diag.status, 403);
  const sync = await invoke({ token: ADVISOR_TOKEN, body: baseBody });
  assert.equal(sync.status, 403);
  assert.equal(teleDirectCalls, 0, 'advisor must not trigger a TeleDirect call');
  assert.equal(rpcPayloads.length, 0, 'advisor must not trigger a synchronization');
  assert.equal(calls.length, 0, 'advisor must not trigger any write');
}

// 2. A meeting ID that differs from the stored event meeting is rejected before any TeleDirect call.
reset();
{
  const out = await invoke({ token: MASTER_TOKEN, body: { ...baseBody, meetingId: '999999', diagnostic: true } });
  assert.equal(out.status, 409);
  const sync = await invoke({ token: MASTER_TOKEN, body: { ...baseBody, meetingId: '999999' } });
  assert.equal(sync.status, 409);
  assert.equal(teleDirectCalls, 0, 'mismatched meeting must not reach TeleDirect');
  assert.equal(rpcPayloads.length, 0);
  assert.equal(calls.length, 0);
}

// 3. replaceExisting is no longer accepted by Update Confirmations and performs no writes.
reset();
{
  const out = await invoke({ token: MASTER_TOKEN, body: { ...baseBody, replaceExisting: true } });
  assert.equal(out.status, 400);
  assert.equal(rpcPayloads.length, 0);
  assert.equal(calls.length, 0);
}

// 4. Diagnostic: one read-only TeleDirect call, aggregate output, no writes, no enrichment.
reset();
{
  const out = await invoke({ token: MASTER_TOKEN, body: { ...baseBody, diagnostic: true } });
  assert.equal(out.status, 200, `expected 200, got ${out.status}: ${out.raw.slice(0, 200)}`);
  assert.equal(teleDirectCalls, 1, 'diagnostic makes exactly one TeleDirect request');
  assert.equal(calls.length, 0, 'diagnostic performs zero Supabase writes');
  assert.equal(rpcPayloads.length, 0, 'diagnostic never calls the sync RPC');
  assert.equal(nonKnownPaths().length, 0, 'diagnostic never runs enrichment');
  assert.equal('expectation' in out.json, false, 'no fixed-count expectation is returned');

  assert.equal(out.json.totalRecords, 31);
  assert.deepEqual(out.json.agMarkers, { A: 17, G: 14, missingOrOther: 0 });
  assert.equal(out.json.statusCounts.cancelled, 1);
  assert.equal(out.json.contactPairing.rowsMissingBothPhoneAndEmail, 14);

  assert.equal(out.json.plan.counts.primaries, 17);
  assert.equal(out.json.plan.counts.guests, 14);
  assert.equal(out.json.plan.counts.cancelledGuests, 1);
  assert.equal(out.json.plan.counts.activeRows, 30);
  assert.equal(out.json.plan.counts.confirmedAttendees, 30);
  assert.deepEqual(out.json.plan.blockers, []);

  for (const token of PII_TOKENS) {
    assert.ok(!out.raw.includes(token), `diagnostic response must not contain personal data (${token})`);
  }
  assert.ok(!out.raw.includes('<Attendee'), 'diagnostic response must not contain raw XML');
}

// 4b. Ordered preview requires BOTH diagnostic and orderPreview; source order preserved, no writes.
reset();
{
  const alone = await invoke({ token: MASTER_TOKEN, body: { ...baseBody, dryRun: true, orderPreview: true } });
  assert.equal(alone.status, 200, `expected 200, got ${alone.status}: ${alone.raw.slice(0, 200)}`);
  assert.equal(alone.json.orderPreview, undefined, 'orderPreview alone must not enable the preview');
  assert.equal(alone.json.expectation, undefined, 'orderPreview alone must not return diagnostic output');
  assert.equal(calls.length, 0, 'orderPreview with dryRun performs zero Supabase writes');
}
reset();
{
  const out = await invoke({ token: MASTER_TOKEN, body: { ...baseBody, diagnostic: true, orderPreview: true } });
  assert.equal(out.status, 200, `expected 200, got ${out.status}: ${out.raw.slice(0, 200)}`);
  assert.equal(teleDirectCalls, 1, 'order preview makes exactly one TeleDirect request');
  assert.equal(calls.length, 0, 'order preview performs zero Supabase writes');
  assert.equal(out.json.orderPreview.length, 31);
  assert.deepEqual(
    out.json.orderPreview.map((row: { sourceIndex: number }) => row.sourceIndex),
    Array.from({ length: 31 }, (_, i) => i + 1),
    'preview is one-based and in API source order'
  );
  assert.equal(out.json.orderPreview[9].status, 'cancelled', 'cancelled row stays at its source position');
  assert.equal(out.json.orderPreview[10].hasEmail, false, 'phone-only primary reports no email');
  assert.equal(out.json.orderPreview[10].hasPhone, true, 'phone-only primary reports a phone');
  for (const token of ['p1@example.test', '555-0101']) {
    assert.ok(!out.raw.includes(token), `order preview must not contain contact data (${token})`);
  }
  assert.ok(!out.raw.includes('<Attendee'), 'order preview must not contain raw XML');
}

// 5. Dry run uses the same plan as sync and performs no writes or enrichment.
reset();
{
  const out = await invoke({ token: MASTER_TOKEN, body: { ...baseBody, dryRun: true } });
  assert.equal(out.status, 200, `expected 200, got ${out.status}: ${out.raw.slice(0, 200)}`);
  assert.equal(teleDirectCalls, 1, 'dry run calls TeleDirect once');
  assert.equal(calls.length, 0, 'dry run performs zero Supabase writes');
  assert.equal(rpcPayloads.length, 0, 'dry run never calls the sync RPC');
  assert.equal(nonKnownPaths().length, 0, 'dry run never runs enrichment');
  assert.equal(out.json.expectation, undefined, 'normal path must not return diagnostic fields');
  assert.equal(out.json.totalRecords, undefined, 'normal path must not return diagnostic fields');
  assert.equal(out.json.primaryCount, 17);
  assert.equal(out.json.guestCount, 14);
  assert.equal(out.json.registeredPrimaryCount, 17);
  assert.equal(out.json.cancelledPrimaryCount, 0);
  assert.equal(out.json.attendeeEquivalentTotal, 30);
}

// 6. Registered totals exclude waitlisted rows: a waitlisted guest drops out of confirmed attendees.
reset();
{
  teleDirectXml = buildFeedXml({ 13: 'Waitlist' });
  const out = await invoke({ token: MASTER_TOKEN, body: { ...baseBody, dryRun: true } });
  assert.equal(out.status, 200, `expected 200, got ${out.status}: ${out.raw.slice(0, 200)}`);
  assert.equal(out.json.attendeeEquivalentTotal, 29, 'waitlisted guest is not a confirmed attendee');
  assert.equal(rpcPayloads.length, 0);
}

// 7. A valid attendee feed may contain auth-like words in free-text fields.
//    This must not be treated as a login failure when attendee rows are present.
reset();
{
  teleDirectXml = DEFAULT_FEED_XML.replace(
    '</Attendee>',
    '<Notes>Guest requested invalid password reset help.</Notes></Attendee>'
  );
  const out = await invoke({ token: MASTER_TOKEN, body: { ...baseBody, dryRun: true } });
  assert.equal(out.status, 200, `expected 200, got ${out.status}: ${out.raw.slice(0, 200)}`);
  assert.equal(out.json.primaryCount, 17);
  assert.equal(out.json.attendeeEquivalentTotal, 30);
  assert.equal(rpcPayloads.length, 0, 'dry run remains read-only');
}

// 8. Explicit XML error payloads remain fatal even on HTTP 200.
reset();
{
  teleDirectXml = '<?xml version=\"1.0\"?><Error>Invalid Password</Error>';
  const out = await invoke({ token: MASTER_TOKEN, body: { ...baseBody, dryRun: true } });
  assert.equal(out.status, 502, `expected 502, got ${out.status}: ${out.raw.slice(0, 200)}`);
  assert.equal(out.json.bodyHasError, true);
  assert.equal(out.json.parsedRecordCount, 0);
  assert.equal(rpcPayloads.length, 0, 'failed fetch validation must not reach RPC');
  assert.equal(nonKnownPaths().length, 0, 'failed fetch validation must not run enrichment');
}

// 9. An unknown status blocks synchronization before any write. Nothing is guessed as registered.
reset();
{
  teleDirectXml = buildFeedXml({ 5: 'Pending' });
  const before = clone(state.responders);
  const out = await invoke({ token: MASTER_TOKEN, body: baseBody });
  assert.equal(out.status, 422, `expected 422, got ${out.status}: ${out.raw.slice(0, 200)}`);
  assert.ok(Array.isArray(out.json.blockers) && out.json.blockers.length > 0, 'blocker explains the refusal');
  assert.equal(rpcPayloads.length, 0, 'blocked sync never calls the RPC');
  assert.equal(nonKnownPaths().length, 0, 'blocked sync never runs enrichment');
  assert.deepEqual(state.responders, before, 'blocked sync leaves the roster intact');
}

// 10. First synchronization: RPC receives the full feed, legacy row is adopted in place,
//    manual rows and existing demographics survive, enrichment runs after success.
reset();
{
  const before = clone(state.responders);
  const out = await invoke({ token: MASTER_TOKEN, body: baseBody });
  assert.equal(out.status, 200, `expected 200, got ${out.status}: ${out.raw.slice(0, 200)}`);
  assert.equal(teleDirectCalls, 1);

  assert.equal(rpcPayloads.length, 1, 'exactly one atomic RPC call');
  const rpc = rpcPayloads[0];
  assert.equal(rpc.p_job_id, JOB_ID);
  assert.equal(rpc.p_event_id, EVENT_ID);
  assert.equal(rpc.p_actor_user_id, MASTER_ID);
  assert.equal(typeof rpc.p_request_id, 'string');
  // One payload row per primary; guests are carried on their primary's row.
  assert.equal(rpc.p_rows.length, 17, 'one payload row per primary, sent in one payload');
  assert.equal(rpc.p_rows.filter((r: any) => r.status === 'registered').length, 17);
  assert.equal(rpc.p_rows.filter((r: any) => r.status === 'cancelled').length, 0);
  assert.equal(rpc.p_rows.reduce((sum: number, r: any) => sum + r.guests, 0), 13, '13 confirmed guests');

  const donald = rpc.p_rows.find((r: any) => r.first_name === 'Don');
  assert.equal(donald.status, 'registered', 'a cancelled guest does not cancel its primary');
  assert.equal(donald.cancelled_guest_count, 1, 'cancelled guest is linked by unique surname');
  const pam = rpc.p_rows.find((r: any) => r.first_name === 'Pam');
  assert.equal(pam.guests, 1, 'different-surname registered guest is linked to its primary');
  const mara = rpc.p_rows.find((r: any) => r.first_name === 'Mara');
  assert.equal(mara.guests, 0, 'primary with no guest keeps zero guests');

  assert.equal(out.json.totalA, 17);
  assert.equal(out.json.totalG, 14);
  assert.equal(out.json.activeAttendees, 30);
  assert.equal(out.json.confirmedAttendees, 30);
  assert.equal(out.json.adopted, 1, 'legacy row adopted once');
  assert.equal(out.json.inserted, 16, '17 primaries minus the adopted legacy row');
  assert.equal(out.json.updated, 1);
  assert.equal(typeof out.json.demographicEnrichment, 'object', 'enrichment outcome is reported');

  const legacy = state.responders.find((r) => r.id === 'legacy-sheri');
  assert.ok(legacy, 'legacy row keeps its id, so no duplicate is created');
  assert.equal(legacy.teledirect_attendee_key !== null && legacy.teledirect_attendee_key !== undefined, true);
  assert.equal(legacy.city, 'Keepcity', 'existing demographics survive the sync');
  assert.equal(legacy.state, 'KC');
  assert.equal(legacy.zip, '00001');
  assert.deepEqual(
    state.responders.find((r) => r.id === 'manual-1'),
    before.find((r) => r.id === 'manual-1'),
    'manual responder is untouched'
  );
  assert.equal(state.responders.filter((r) => r.event_id === EVENT_ID).length, 18, '17 primary rows plus 1 manual row');

  const rpcIndex = requestLog.indexOf(RPC_PATH);
  assert.ok(rpcIndex >= 0);
  assert.ok(
    requestLog.slice(rpcIndex + 1).some((p) => !KNOWN_PATHS.has(p)),
    'enrichment runs only after the RPC'
  );

  for (const token of PII_TOKENS) {
    assert.ok(!out.raw.includes(token), `sync response must not contain personal data (${token})`);
  }
}

// 11. Repeated synchronization creates no duplicates and reports every row as updated.
{
  const out = await invoke({ token: MASTER_TOKEN, body: baseBody });
  assert.equal(out.status, 200, `expected 200, got ${out.status}: ${out.raw.slice(0, 200)}`);
  assert.equal(out.json.inserted, 0, 'second run inserts nothing');
  assert.equal(out.json.adopted, 0, 'second run adopts nothing');
  assert.equal(out.json.updated, 17, 'second run updates every keyed primary row in place');
  assert.equal(state.responders.filter((r) => r.event_id === EVENT_ID).length, 18, 'no duplicate responders');
  const keys = syncedRows().map((r) => r.teledirect_attendee_key);
  assert.equal(new Set(keys).size, keys.length, 'each identity key is stored once');
}

// 12. An atomic failure leaves the roster exactly as it was and runs no enrichment.
reset();
{
  flags.rpcFailNext = true;
  const before = clone(state.responders);
  const out = await invoke({ token: MASTER_TOKEN, body: baseBody });
  assert.equal(out.status, 500, `expected 500, got ${out.status}: ${out.raw.slice(0, 200)}`);
  assert.equal(out.json.message, 'simulated atomic failure');
  assert.ok(out.json.requestId, 'failure response carries a request ID');
  assert.deepEqual(state.responders, before, 'failed sync leaves the roster intact');
  const rpcIndex = requestLog.indexOf(RPC_PATH);
  assert.equal(requestLog.slice(rpcIndex + 1).some((p) => !KNOWN_PATHS.has(p)), false, 'no enrichment after failure');
}

// 13. Enrichment failure is reported separately; the completed sync is kept.
reset();
{
  flags.enrichmentFail = true;
  const out = await invoke({ token: MASTER_TOKEN, body: baseBody });
  assert.equal(out.status, 200, `expected 200, got ${out.status}: ${out.raw.slice(0, 200)}`);
  assert.equal(out.json.adopted, 1);
  assert.equal(state.responders.filter((r) => r.event_id === EVENT_ID).length, 18, 'sync is kept');
  assert.equal(typeof out.json.demographicEnrichment, 'object', 'enrichment outcome is reported separately');
}

server.close();
console.log('update-responses http sync and diagnostic tests: ok');
