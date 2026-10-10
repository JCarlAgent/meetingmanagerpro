/**
 * Focused regression tests for the server-side enrichment core.
 * Run: npx tsx api/_lib/demographicEnrichment.test.ts
 *
 * Uses an in-memory fake of the PostgREST query surface. No network or DB access.
 */
import assert from 'node:assert/strict';
import { runDemographicEnrichment } from './demographicEnrichment.js';

const TARGET = 'target-job';
const SOURCE = 'source-job';
const ORG = 'org-1';

type Row = Record<string, any>;

function makeFakeAdmin(opts: {
  jobs?: Row[];
  links?: Row[];
  responders: Row[];
  sourceRows: Row[];
  writes?: Array<{ table: string; patch: Row; filters: Array<[string, any]> }>;
}) {
  const writes = opts.writes ?? [];
  const tableData: Record<string, Row[]> = {
    jobs: opts.jobs ?? [
      { id: TARGET, org_id: ORG },
      { id: SOURCE, org_id: ORG },
    ],
    job_demographic_sources: opts.links ?? [
      { target_job_id: TARGET, source_job_id: SOURCE, org_id: ORG },
    ],
    responders: opts.responders,
    campaign_mailed_list_records: opts.sourceRows,
  };

  function from(table: string) {
    const state: { filters: Array<[string, any, string]>; range?: [number, number]; patch?: Row } = { filters: [] };
    const applyFilters = (rows: Row[]) =>
      rows.filter((r) =>
        state.filters.every(([col, val, kind]) => {
          if (kind === 'in') return (val as any[]).includes(r[col]);
          if (kind === 'is') return r[col] === val;
          return r[col] === val;
        }),
      );
    const builder: any = {
      select(_cols?: string) {
        return builder;
      },
      eq(col: string, val: any) {
        state.filters.push([col, val, 'eq']);
        return builder;
      },
      in(col: string, vals: any[]) {
        state.filters.push([col, vals, 'in']);
        return builder;
      },
      is(col: string, val: any) {
        state.filters.push([col, val, 'is']);
        return builder;
      },
      range(from: number, to: number) {
        state.range = [from, to];
        return builder;
      },
      update(patch: Row) {
        state.patch = patch;
        return builder;
      },
      then(resolve: (v: any) => void, reject: (e: any) => void) {
        try {
          const rows = applyFilters(tableData[table] ?? []);
          if (state.patch) {
            // Writes are recorded and applied only to matching rows, so tests can
            // assert exactly which rows and fields were touched.
            const touched = rows.map((r) => {
              Object.assign(r, state.patch);
              return { id: r.id };
            });
            writes.push({
              table,
              patch: state.patch,
              filters: state.filters.map(([c, v]) => [c, v] as [string, any]),
            });
            resolve({ data: touched, error: null });
            return;
          }
          const out = state.range ? rows.slice(state.range[0], state.range[1] + 1) : rows;
          resolve({ data: out, error: null });
        } catch (e) {
          reject(e);
        }
      },
    };
    return builder;
  }

  return { admin: { from } as any, writes };
}

const strongSource = {
  id: 'src-1',
  campaign_id: SOURCE,
  first_name: 'Ann',
  last_name: 'Smith',
  address: '12 Oak St',
  zip: '02110',
  claritas_ipa: '2',
  age_band: '55-64',
  est_income_code: 'C',
  est_income_range: '75-100K',
};

const strongResponder = {
  id: 'r-1',
  campaign_id: TARGET,
  first_name: 'Ann',
  last_name: 'Smith',
  address: '12 Oak St',
  zip: '02110',
  mail_record_id: null,
  matched_to_mail_list: false,
  age: null,
  ipa: null,
  income: null,
  est_income_code: null,
  est_income_range: null,
  claritas_ipa_raw: null,
  gender_code: null,
  homeowner_flag1: null,
  marital_status: null,
  length_residence: null,
  veh1_make_desc: null,
  veh1_model_desc: null,
  veh2_make_desc: null,
  veh2_model_desc: null,
};

async function main() {
  // 1. No link: 200 no_source_link, no writes.
  {
    const { admin, writes } = makeFakeAdmin({ links: [], responders: [strongResponder], sourceRows: [strongSource] });
    const out = await runDemographicEnrichment({ supabaseAdmin: admin, targetJobId: TARGET, matcherVersion: 't' });
    assert.equal(out.httpStatus, 200);
    assert.equal(out.body.status, 'no_source_link');
    assert.equal(writes.length, 0);
  }

  // 2. sourceJobId not in links: 403, no writes.
  {
    const { admin, writes } = makeFakeAdmin({ responders: [strongResponder], sourceRows: [strongSource] });
    const out = await runDemographicEnrichment({
      supabaseAdmin: admin, targetJobId: TARGET, matcherVersion: 't', sourceJobId: 'not-linked',
    });
    assert.equal(out.httpStatus, 403);
    assert.equal(writes.length, 0);
  }

  // 3. Cross-org source: rejected before any write.
  {
    const { admin, writes } = makeFakeAdmin({
      jobs: [{ id: TARGET, org_id: ORG }, { id: SOURCE, org_id: 'other-org' }],
      responders: [strongResponder],
      sourceRows: [strongSource],
    });
    const out = await runDemographicEnrichment({ supabaseAdmin: admin, targetJobId: TARGET, matcherVersion: 't' });
    assert.equal(out.httpStatus, 400);
    assert.equal(writes.length, 0);
  }

  // 4. Missing target job: 404, no writes.
  {
    const { admin, writes } = makeFakeAdmin({
      jobs: [{ id: SOURCE, org_id: ORG }],
      responders: [strongResponder],
      sourceRows: [strongSource],
    });
    const out = await runDemographicEnrichment({ supabaseAdmin: admin, targetJobId: TARGET, matcherVersion: 't' });
    assert.equal(out.httpStatus, 404);
    assert.equal(writes.length, 0);
  }

  // 5. Strong match: one write, scoped to the target campaign, guarded by IS NULL,
  //    and only allowed fields. Guests and attendance fields are never in the patch.
  {
    const { admin, writes } = makeFakeAdmin({ responders: [{ ...strongResponder }], sourceRows: [strongSource] });
    const out = await runDemographicEnrichment({ supabaseAdmin: admin, targetJobId: TARGET, matcherVersion: 't' });
    assert.equal(out.httpStatus, 200);
    assert.equal(out.body.status, 'ok');
    assert.equal(out.body.written, 1);
    assert.equal(writes.length, 1);
    const w = writes[0];
    assert.equal(w.table, 'responders');
    assert.ok(w.filters.some(([c, v]) => c === 'campaign_id' && v === TARGET), 'must be scoped to target campaign');
    assert.ok(!('guest_details' in w.patch) && !('guest_count' in w.patch) && !('status' in w.patch));
    assert.ok(!('first_name' in w.patch) && !('email' in w.patch) && !('phone' in w.patch));
    assert.ok(!('address' in w.patch) && !('zip' in w.patch), 'address/zip are never written');
    for (const k of Object.keys(w.patch)) {
      assert.ok(
        ['mail_record_id', 'matched_to_mail_list', 'match_confidence', 'age', 'ipa', 'income',
          'claritas_ipa_raw', 'est_income_code', 'est_income_range', 'gender_code', 'homeowner_flag1',
          'marital_status', 'length_residence', 'veh1_make_desc', 'veh1_model_desc', 'veh2_make_desc',
          'veh2_model_desc'].includes(k),
        `unexpected field written: ${k}`,
      );
    }
  }

  // 6. Existing enrichment is never overwritten. A responder already linked
  //    (mail_record_id set) must produce no writes.
  {
    const enriched = { ...strongResponder, mail_record_id: 'existing-mail', match_confidence: 'exact', age: 61 };
    const { admin, writes } = makeFakeAdmin({ responders: [enriched], sourceRows: [strongSource] });
    const out = await runDemographicEnrichment({ supabaseAdmin: admin, targetJobId: TARGET, matcherVersion: 't' });
    assert.equal(out.httpStatus, 200);
    assert.equal(out.body.written, 0);
    assert.equal(writes.length, 0);
  }

  // 7. Idempotency: a second run after a successful write produces no new writes.
  {
    const responders = [{ ...strongResponder }];
    const { admin, writes } = makeFakeAdmin({ responders, sourceRows: [strongSource] });
    await runDemographicEnrichment({ supabaseAdmin: admin, targetJobId: TARGET, matcherVersion: 't' });
    const firstCount = writes.length;
    const second = await runDemographicEnrichment({ supabaseAdmin: admin, targetJobId: TARGET, matcherVersion: 't' });
    assert.equal(second.body.written, 0);
    assert.equal(writes.length, firstCount, 'second run must not write');
  }

  // 8. Ambiguous (duplicate name, two corroborating rows): no write.
  {
    const dupSource = [strongSource, { ...strongSource, id: 'src-2' }];
    const { admin, writes } = makeFakeAdmin({ responders: [{ ...strongResponder }], sourceRows: dupSource });
    const out = await runDemographicEnrichment({ supabaseAdmin: admin, targetJobId: TARGET, matcherVersion: 't' });
    assert.equal(out.httpStatus, 200);
    assert.equal(out.body.written, 0);
    assert.equal(writes.length, 0, 'ambiguous matches must not be written');
  }

  console.log('demographicEnrichment tests passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
