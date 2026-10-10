import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// HTTP-level authorization and write-restriction tests for the matcher.
// A local stub stands in for Supabase (auth + PostgREST) so the real handler
// runs end to end without touching production. Every non-GET request is logged
// so "no writes" is directly observable.

type Call = { method: string; path: string; body: string };
const calls: Call[] = [];
// Campaign IDs queried against campaign_mailed_list_records (proves which job was read).
const sourceQueries: string[] = [];

const JOB_TARGET = 'job-target';
const JOB_SOURCE = 'job-source';
const ORG = 'org-1';
const MASTER_TOKEN = 'master-token';
const ADVISOR_TOKEN = 'advisor-token';
const MASTER_ID = 'user-master';
const ADVISOR_ID = 'user-advisor';

const state = {
  masterRows: [{ user_id: MASTER_ID }] as Array<{ user_id: string }>,
  jobs: [
    { id: JOB_TARGET, org_id: ORG },
    { id: JOB_SOURCE, org_id: ORG },
  ] as Array<{ id: string; org_id: string }>,
  links: [] as Array<{ target_job_id: string; source_job_id: string; org_id: string }>,
  responders: [] as any[],
  source: [] as any[],
  failSourceRead: false,
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

    if (path === '/auth/v1/user') {
      const token = String(req.headers.authorization ?? '').replace('Bearer ', '');
      if (token === MASTER_TOKEN) return json(200, { id: MASTER_ID, email: 'm@x.test' });
      if (token === ADVISOR_TOKEN) return json(200, { id: ADVISOR_ID, email: 'a@x.test' });
      return json(401, { message: 'invalid' });
    }

    if (path === '/rest/v1/master_admins') {
      const want = url.searchParams.get('user_id')?.replace('eq.', '');
      return json(200, state.masterRows.filter((r) => r.user_id === want));
    }

    if (path === '/rest/v1/jobs') {
      const ids = (url.searchParams.get('id')?.replace('in.(', '').replace(')', '') ?? '').split(',');
      return json(200, state.jobs.filter((j) => ids.includes(j.id)));
    }

    if (path === '/rest/v1/job_demographic_sources') {
      const target = url.searchParams.get('target_job_id')?.replace('eq.', '');
      return json(200, state.links.filter((l) => l.target_job_id === target));
    }

    if (path === '/rest/v1/responders') {
      const campaign = url.searchParams.get('campaign_id')?.replace('eq.', '');
      return json(200, state.responders.filter((r) => !campaign || r.campaign_id === campaign));
    }

    if (path === '/rest/v1/campaign_mailed_list_records') {
      const campaign = url.searchParams.get('campaign_id')?.replace('eq.', '');
      sourceQueries.push(campaign ?? '');
      if (state.failSourceRead) return json(500, { message: 'simulated database failure' });
      const range = url.searchParams.get('offset') ?? '0';
      const limit = url.searchParams.get('limit');
      const from = Number(range);
      const rows = state.source.filter((r) => r.campaign_id === campaign);
      const page = limit ? rows.slice(from, from + Number(limit)) : rows.slice(from);
      return json(200, page);
    }

    // Anything else (including any write) is recorded above and treated as empty.
    return json(200, []);
  });
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
const { port } = server.address() as AddressInfo;

process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-test';

const { default: handler } = await import('./match-responders.ts');

function invoke(opts: { method?: string; token?: string; body?: unknown }) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const req: any = { method: opts.method ?? 'POST', headers, body: opts.body ?? {} };
  const out: { status: number; json: any } = { status: 0, json: undefined };
  const res: any = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(payload: any) {
      out.json = payload;
      return res;
    },
  };
  return handler(req, res).then(() => out);
}

// 1) Method gate
{
  const r = await invoke({ method: 'GET', token: MASTER_TOKEN });
  assert.equal(r.status, 405, 'non-POST must be rejected');
}

// 2) Unauthenticated: missing token -> 401 (not 500)
{
  const r = await invoke({ token: undefined, body: { jobId: JOB_TARGET, mode: 'preview' } });
  assert.equal(r.status, 401, 'missing bearer token must be 401');
}

// 3) Invalid token -> 401
{
  const r = await invoke({ token: 'bogus', body: { jobId: JOB_TARGET, mode: 'preview' } });
  assert.equal(r.status, 401, 'invalid token must be 401');
}

// 4) Authenticated non-master -> 403, regardless of job ids supplied
{
  const r = await invoke({ token: ADVISOR_TOKEN, body: { jobId: JOB_TARGET, mode: 'preview' } });
  assert.equal(r.status, 403, 'non-master must be 403');
  assert.equal(r.json.error, 'Master admin required');
}

// 5) Master without jobId -> 400
{
  const r = await invoke({ token: MASTER_TOKEN, body: { mode: 'preview' } });
  assert.equal(r.status, 400, 'missing jobId must be 400');
}

// 6) Preview: zero writes, returns counts only
{
  calls.length = 0;
  state.responders = [
    {
      id: 'r-1', campaign_id: JOB_TARGET, first_name: 'Ann', last_name: 'Smith',
      address: null, zip: null, mail_record_id: null, matched_to_mail_list: false,
      age: null, ipa: null, income: null, est_income_code: null, est_income_range: null,
    },
  ];
  state.source = [
    {
      id: 'm-1', campaign_id: JOB_SOURCE, first_name: 'Ann', last_name: 'Smith',
      address: '1 Main St', zip: '02101', claritas_ipa: null, age_band: null,
    },
  ];
  state.links = [{ target_job_id: JOB_TARGET, source_job_id: JOB_SOURCE, org_id: ORG }];
  sourceQueries.length = 0;
  const r = await invoke({ token: MASTER_TOKEN, body: { jobId: JOB_TARGET, mode: 'preview' } });
  assert.equal(r.status, 200, 'preview should succeed for master');
  assert.equal(r.json.mode, 'preview');
  assert.equal(r.json.counts.totalPrimaries, 1);
  assert.equal(r.json.sourceJobId, JOB_SOURCE, 'source must be the linked job, not the target');
  assert.ok(sourceQueries.length > 0 && sourceQueries.every((c) => c === JOB_SOURCE),
    'purchased records must be read only from the linked source job');
  assert.equal(calls.length, 0, 'preview must perform ZERO writes');
}

// 6b) Preview with NO link must not fall back to the target job
{
  calls.length = 0;
  sourceQueries.length = 0;
  state.links = [];
  const r = await invoke({ token: MASTER_TOKEN, body: { jobId: JOB_TARGET, mode: 'preview' } });
  assert.equal(r.status, 400, 'preview without a link must be a clear 4xx');
  assert.equal(r.json.reason, 'no_source_link');
  assert.equal(sourceQueries.length, 0, 'preview without a link must never query purchased records');
  assert.equal(calls.length, 0, 'preview without a link must not write');
}

// 6c) Preview with an unlinked explicit sourceJobId -> 403, no purchased-record read
{
  calls.length = 0;
  sourceQueries.length = 0;
  state.links = [{ target_job_id: JOB_TARGET, source_job_id: JOB_SOURCE, org_id: ORG }];
  const r = await invoke({
    token: MASTER_TOKEN,
    body: { jobId: JOB_TARGET, mode: 'preview', sourceJobId: JOB_TARGET },
  });
  assert.equal(r.status, 403, 'preview must reject a sourceJobId that is not the linked source');
  assert.equal(sourceQueries.length, 0, 'unlinked source must never be read');
  assert.equal(calls.length, 0, 'preview must perform ZERO writes');
}

// 6d) Preview cross-org link -> rejected before reading purchased records
{
  calls.length = 0;
  sourceQueries.length = 0;
  state.jobs = [
    { id: JOB_TARGET, org_id: ORG },
    { id: JOB_SOURCE, org_id: 'org-OTHER' },
  ];
  state.links = [{ target_job_id: JOB_TARGET, source_job_id: JOB_SOURCE, org_id: ORG }];
  const r = await invoke({ token: MASTER_TOKEN, body: { jobId: JOB_TARGET, mode: 'preview' } });
  assert.equal(r.status, 400, 'cross-org preview must be rejected');
  assert.equal(sourceQueries.length, 0, 'cross-org source must not be read');
  assert.equal(calls.length, 0, 'preview must perform ZERO writes');
  state.jobs = [
    { id: JOB_TARGET, org_id: ORG },
    { id: JOB_SOURCE, org_id: ORG },
  ];
}

// 6e) Pagination: source list larger than one page is read completely
{
  calls.length = 0;
  sourceQueries.length = 0;
  state.links = [{ target_job_id: JOB_TARGET, source_job_id: JOB_SOURCE, org_id: ORG }];
  state.source = Array.from({ length: 2500 }, (_, i) => ({
    id: `m-${i}`, campaign_id: JOB_SOURCE, first_name: `F${i}`, last_name: `L${i}`,
    address: null, zip: null, claritas_ipa: null, age_band: null,
  }));
  const r = await invoke({ token: MASTER_TOKEN, body: { jobId: JOB_TARGET, mode: 'preview' } });
  assert.equal(r.status, 200, 'multi-page source must preview');
  assert.ok(sourceQueries.length >= 3, 'source must be read across all pages (2500 rows -> 3 pages)');
  assert.equal(calls.length, 0, 'preview must perform ZERO writes');
  state.source = [];
}

// 6f) Database error on the purchased-record read is an error, not an empty source
{
  calls.length = 0;
  state.links = [{ target_job_id: JOB_TARGET, source_job_id: JOB_SOURCE, org_id: ORG }];
  state.failSourceRead = true;
  const r = await invoke({ token: MASTER_TOKEN, body: { jobId: JOB_TARGET, mode: 'preview' } });
  state.failSourceRead = false;
  assert.equal(r.status, 500, 'a database error must surface as 500, not an empty-source 400');
  assert.notEqual(r.json.error, 'No purchased records found for the source job.',
    'a database error must not be disguised as an empty source');
  assert.equal(calls.length, 0, 'preview must perform ZERO writes');
}


// 7) Enrich with no source link -> reported, nothing written
{
  calls.length = 0;
  state.links = [];
  const r = await invoke({ token: MASTER_TOKEN, body: { jobId: JOB_TARGET, mode: 'enrich' } });
  assert.equal(r.status, 200, 'missing link is a reported outcome, not a server error');
  assert.equal(r.json.status, 'no_source_link');
  assert.equal(r.json.written, 0);
  assert.equal(calls.length, 0, 'enrich without a link must not write');
}

// 8) Enrich with an unauthorized explicit sourceJobId -> 403, no writes
{
  calls.length = 0;
  state.links = [{ target_job_id: JOB_TARGET, source_job_id: JOB_SOURCE, org_id: ORG }];
  const r = await invoke({
    token: MASTER_TOKEN,
    body: { jobId: JOB_TARGET, mode: 'enrich', sourceJobId: 'job-not-linked' },
  });
  assert.equal(r.status, 403, 'unlinked sourceJobId must be rejected');
  assert.equal(calls.length, 0, 'unauthorized source must not write');
}

// 9) Cross-org link -> rejected before any write
{
  calls.length = 0;
  state.jobs = [
    { id: JOB_TARGET, org_id: ORG },
    { id: JOB_SOURCE, org_id: 'org-OTHER' },
  ];
  state.links = [{ target_job_id: JOB_TARGET, source_job_id: JOB_SOURCE, org_id: ORG }];
  const r = await invoke({ token: MASTER_TOKEN, body: { jobId: JOB_TARGET, mode: 'enrich' } });
  assert.equal(r.status, 400, 'cross-org source must be rejected');
  assert.equal(calls.length, 0, 'cross-org source must not write');
  state.jobs = [
    { id: JOB_TARGET, org_id: ORG },
    { id: JOB_SOURCE, org_id: ORG },
  ];
}

server.close();
console.log('match-responders HTTP regressions: ok');
