import assert from 'node:assert/strict';
import {
  buildEnrichmentPatch,
  campaignEstimateFor,
  normalizeLastName,
  normalizeZip5,
  planDemographicMatches,
  planEnrichmentWrites,
  summarizePreview,
  validateSourceLink,
  type PlannerResponder,
  type PlannerSourceRecord,
} from './responderDemographicPlanner.js';

function resp(over: Partial<PlannerResponder> & { id: string }): PlannerResponder {
  return {
    first_name: 'Ann',
    last_name: 'Smith',
    address: null,
    zip: null,
    mail_record_id: null,
    matched_to_mail_list: null,
    ...over,
  };
}

function src(over: Partial<PlannerSourceRecord> & { id: string }): PlannerSourceRecord {
  return {
    first_name: 'Ann',
    last_name: 'Smith',
    address: null,
    zip: null,
    claritas_ipa: null,
    age_band: null,
    est_income_code: null,
    est_income_range: null,
    gender_code: null,
    homeowner_flag1: null,
    marital_status: null,
    length_residence: null,
    veh1_make_desc: null,
    veh1_model_desc: null,
    veh2_make_desc: null,
    veh2_model_desc: null,
    ...over,
  };
}

// Normalization
assert.equal(normalizeLastName('Smith Jr.'), 'smith');
assert.equal(normalizeLastName("O'Brien"), 'obrien');
assert.equal(normalizeZip5('62701-1234'), '62701');
assert.equal(normalizeZip5('627'), null);

// Strong: name plus zip5 corroboration, exactly one candidate
{
  const out = planDemographicMatches(
    [resp({ id: 'r1', zip: '62701' })],
    [src({ id: 's1', zip: '62701-0001' }), src({ id: 's2', first_name: 'Bob', zip: '62701' })],
  );
  assert.equal(out[0].classification, 'strong');
  assert.equal(out[0].sourceRecordId, 's1');
}

// Two same-name rows, only one corroborated by zip: strong for the corroborated row
{
  const out = planDemographicMatches(
    [resp({ id: 'r1', zip: '62701' })],
    [src({ id: 's1', zip: '99999' }), src({ id: 's2', zip: '62701' })],
  );
  assert.equal(out[0].classification, 'strong');
  assert.equal(out[0].sourceRecordId, 's2');
}

// Duplicate names and both corroborated: ambiguous, never first-row-wins
{
  const out = planDemographicMatches(
    [resp({ id: 'r1', zip: '62701' })],
    [src({ id: 's1', zip: '62701' }), src({ id: 's2', zip: '62701' })],
  );
  assert.equal(out[0].classification, 'ambiguous');
  assert.equal(out[0].sourceRecordId, null);
}

// Unique full-name match without postal evidence: probable (populated, labelled)
{
  const out = planDemographicMatches([resp({ id: 'r1' })], [src({ id: 's1', zip: '11111' })]);
  assert.equal(out[0].classification, 'probable');
  assert.equal(out[0].sourceRecordId, 's1');
}

// Initial + last name only: candidate for review, never populated
{
  const out = planDemographicMatches(
    [resp({ id: 'r1', first_name: 'Anna', last_name: 'Smith' })],
    [src({ id: 's1', first_name: 'Ann', last_name: 'Smith' })],
  );
  assert.equal(out[0].classification, 'name_only');
  assert.equal(out[0].sourceRecordId, 's1');
  assert.equal(planEnrichmentWrites([resp({ id: 'r1', first_name: 'Anna' })], out, [src({ id: 's1', first_name: 'Ann' })]).length, 0);
}


// Name-only, multiple same-name candidates: ambiguous
{
  const out = planDemographicMatches(
    [resp({ id: 'r1' })],
    [src({ id: 's1' }), src({ id: 's2' })],
  );
  assert.equal(out[0].classification, 'ambiguous');
}

// Unmatched when no name matches
{
  const out = planDemographicMatches([resp({ id: 'r1', last_name: 'Nobody' })], [src({ id: 's1' })]);
  assert.equal(out[0].classification, 'unmatched');
}

// Shared source row claimed by two responders demotes both to ambiguous
{
  const out = planDemographicMatches(
    [resp({ id: 'r1' }), resp({ id: 'r2' })],
    [src({ id: 's1' })],
  );
  assert.equal(out[0].classification, 'ambiguous');
  assert.equal(out[1].classification, 'ambiguous');
  assert.equal(out[0].sourceRecordId, null);
}

// Already enriched is reported and counted separately
{
  const responders = [resp({ id: 'r1', mail_record_id: 'm9', matched_to_mail_list: true })];
  const out = planDemographicMatches(responders, [src({ id: 's1' })]);
  assert.equal(out[0].alreadyEnriched, true);
  const counts = summarizePreview(out);
  assert.equal(counts.alreadyEnriched, 1);
  assert.equal(counts.totalPrimaries, 1);
}

// Preview counts reconcile to total
{
  const out = planDemographicMatches(
    [resp({ id: 'a', zip: '62701' }), resp({ id: 'b', last_name: 'Nobody' }), resp({ id: 'c', first_name: 'Carl', last_name: 'Jones' })],
    [src({ id: 's1', zip: '62701' }), src({ id: 's2', first_name: 'Carl', last_name: 'Jones' })],
  );
  const c = summarizePreview(out);
  assert.equal(c.totalPrimaries, 3);
  assert.equal(c.strong + c.probable + c.nameOnlyCandidates + c.ambiguous + c.unmatched, 3);
  assert.equal(c.strong, 1);
  assert.equal(c.probable, 1);
  assert.equal(c.unmatched, 1);
  assert.equal(c.nameOnlyCandidates, 0);
}

// Patch: no overwrite of non-null enrichment; link fields only when unlinked
{
  const source = src({ id: 's1', age_band: '55-64', gender_code: 'F', homeowner_flag1: 'Y' });
  const patch = buildEnrichmentPatch(resp({ id: 'r1', age: '70' }), source);
  assert.equal(patch.age, undefined, 'existing age must not be overwritten');
  assert.equal(patch.gender_code, 'F');
  assert.equal(patch.mail_record_id, 's1');
  assert.equal(patch.matched_to_mail_list, true);
  assert.equal(patch.match_confidence, 'exact');
  assert.equal('name' in patch || 'first_name' in patch, false, 'identity fields never written');
  assert.equal('address' in patch || 'zip' in patch, false, 'registration postal never written');
  assert.equal('guests' in patch || 'guest_details' in patch || 'status' in patch || 'notes' in patch, false);
}

// Patch: probable classification is recorded as probable, not exact
{
  const patch = buildEnrichmentPatch(resp({ id: 'r1' }), src({ id: 's1', gender_code: 'F' }), 'probable');
  assert.equal(patch.match_confidence, 'probable');
  assert.equal(patch.mail_record_id, 's1');
}

// Patch: already linked responder keeps its link
{
  const patch = buildEnrichmentPatch(resp({ id: 'r1', mail_record_id: 'm9' }), src({ id: 's1', gender_code: 'M' }));
  assert.equal(patch.mail_record_id, undefined);
  assert.equal(patch.matched_to_mail_list, undefined);
  assert.equal(patch.match_confidence, undefined);
  assert.equal(patch.gender_code, 'M');
}

// Patch: legacy fuzzy match (matched_to_mail_list true, no mail_record_id) keeps its confidence
{
  const patch = buildEnrichmentPatch(resp({ id: 'r1', matched_to_mail_list: true }), src({ id: 's1', gender_code: 'M' }));
  assert.equal(patch.match_confidence, undefined, 'legacy confidence must not be overwritten');
  assert.equal(patch.mail_record_id, undefined);
}

// Writes: planned for strong and probable only; idempotent on re-run
{
  const responders = [
    resp({ id: 'r1', zip: '62701' }),
    resp({ id: 'r2', first_name: 'Carl', last_name: 'Jones' }),
    resp({ id: 'r3', last_name: 'Nobody' }),
  ];
  const sources = [
    src({ id: 's1', zip: '62701', gender_code: 'F' }),
    src({ id: 's2', first_name: 'Carl', last_name: 'Jones', gender_code: 'M' }),
  ];
  const results = planDemographicMatches(responders, sources);
  const writes = planEnrichmentWrites(responders, results, sources);
  assert.deepEqual(writes.map((w) => w.responderId).sort(), ['r1', 'r2']);
  assert.equal(writes.find((w) => w.responderId === 'r2')!.patch.match_confidence, 'probable');

  // Re-run after applying writes: responders now linked, so no further writes
  const applied = responders.map((r) => {
    const w = writes.find((x) => x.responderId === r.id);
    return w ? { ...r, ...w.patch } : r;
  });
  const rerun = planEnrichmentWrites(applied, planDemographicMatches(applied, sources), sources);
  assert.equal(rerun.length, 0, 're-running enrichment must be a no-op');
}

// Writes: ambiguous never written; guests/attendance/identity untouched
{
  const responders = [resp({ id: 'r1', zip: '62701' })];
  const sources = [src({ id: 's1', zip: '62701' }), src({ id: 's2', zip: '62701' })];
  const writes = planEnrichmentWrites(responders, planDemographicMatches(responders, sources), sources);
  assert.equal(writes.length, 0);
}

// Source-link validation: same org, explicit link, distinct jobs
{
  const target = { id: 't', org_id: 'o1' };
  const source = { id: 's', org_id: 'o1' };
  const link = { target_job_id: 't', source_job_id: 's', org_id: 'o1' };
  assert.equal(validateSourceLink(target, source, link), null);
  assert.equal(validateSourceLink(target, source, null), 'no_source_link');
  assert.equal(validateSourceLink(target, { id: 's', org_id: 'o2' }, { ...link, org_id: 'o2' }), 'cross_org_link');
  assert.equal(validateSourceLink(target, source, { ...link, target_job_id: 'other' }), 'link_mismatch');
  assert.equal(validateSourceLink(target, { id: 't', org_id: 'o1' }, { ...link, source_job_id: 't' }), 'source_equals_target');
  assert.equal(validateSourceLink(null, source, link), 'target_job_not_found');
  assert.equal(validateSourceLink(target, null, link), 'source_job_not_found');
}

// Campaign-level fallback: never fabricates ranges
{
  assert.deepEqual(campaignEstimateFor(null), { kind: 'unavailable' });
  assert.deepEqual(campaignEstimateFor({}), { kind: 'unavailable' });
  assert.deepEqual(campaignEstimateFor({ ipa: '  ' }), { kind: 'unavailable' });
  assert.deepEqual(campaignEstimateFor({ ipa: '$250K-$500K', age: '' }), {
    kind: 'campaign_estimate',
    ranges: { ipa: '$250K-$500K' },
  });
}

console.log('responderDemographicPlanner checks: ok');

