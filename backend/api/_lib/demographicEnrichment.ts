/**
 * Server-side demographic enrichment core. Shared by the match-responders
 * endpoint (manual admin trigger) and the roster import endpoint (automatic,
 * post-import). Authorization is the caller's responsibility: callers must
 * verify the requester before invoking runDemographicEnrichment.
 *
 * Source demographics are read only from an explicit job_demographic_sources
 * link. A link is never inferred from names, counts, or shared identifiers.
 */
import {
  DemographicSourceLink,
  JobOrgRef,
  planDemographicMatches,
  planEnrichmentWrites,
  summarizePreview,
  validateSourceLink,
} from './responderDemographicPlanner.js';
import type { getSupabaseAdmin } from './supabaseAdmin.js';

/**
 * Loads every row for a campaign. PostgREST caps results at 1000 rows per
 * request, so paging is required for 11k+ row purchased lists.
 */
export async function fetchAllMailRecords(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  campaignId: string,
  selectCols: string,
): Promise<{ data: any[]; error: any }> {
  const PAGE_SIZE = 1000;
  const all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('campaign_mailed_list_records')
      .select(selectCols)
      .eq('campaign_id', campaignId)
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { data: all, error };
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break; // last page
    from += PAGE_SIZE;
  }
  return { data: all, error: null };
}

/** Responder columns needed for planning. Demographics must be loaded so the planner never overwrites them. */
export const RESPONDER_PLAN_COLS = [
  'id', 'first_name', 'last_name', 'address', 'zip', 'mail_record_id', 'matched_to_mail_list',
  'age', 'ipa', 'income', 'claritas_ipa_raw', 'est_income_code', 'est_income_range',
  'gender_code', 'homeowner_flag1', 'marital_status', 'length_residence',
  'veh1_make_desc', 'veh1_model_desc', 'veh2_make_desc', 'veh2_model_desc',
].join(', ');

/** Only these responder fields may ever be written by enrichment. */
export const ENRICH_ALLOWED_FIELDS = new Set([
  'mail_record_id', 'matched_to_mail_list', 'match_confidence',
  'age', 'ipa', 'income', 'claritas_ipa_raw', 'est_income_code', 'est_income_range',
  'gender_code', 'homeowner_flag1', 'marital_status', 'length_residence',
  'veh1_make_desc', 'veh1_model_desc', 'veh2_make_desc', 'veh2_model_desc',
]);
export const LINK_FIELDS = new Set(['mail_record_id', 'matched_to_mail_list', 'match_confidence']);

export type PlanOutcome =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      targetJob: JobOrgRef;
      sourceJob: JobOrgRef;
      responders: any[];
      results: ReturnType<typeof planDemographicMatches>;
      sourceRecords: any[];
    };

/**
 * Shared, read-only planning step for preview and enrich. Verifies both jobs
 * exist and share an org, then loads responders and source records.
 * The caller decides whether the source link is authorized.
 */
export async function planForJob(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  jobId: string,
  sourceJobId: string,
): Promise<PlanOutcome> {
  const { data: jobRows, error: jobErr } = await supabaseAdmin
    .from('jobs')
    .select('id, org_id')
    .in('id', Array.from(new Set([jobId, sourceJobId])));
  if (jobErr) throw jobErr;
  const targetJob = (jobRows ?? []).find((j: any) => j.id === jobId) as JobOrgRef | undefined;
  const sourceJob = (jobRows ?? []).find((j: any) => j.id === sourceJobId) as JobOrgRef | undefined;
  if (!targetJob) return { ok: false, status: 404, error: 'Target job not found' };
  if (!sourceJob) return { ok: false, status: 404, error: 'Source job not found' };
  if (!targetJob.org_id || targetJob.org_id !== sourceJob.org_id) {
    return { ok: false, status: 400, error: 'Source job must belong to the same organization as the target job' };
  }

  const { data: responderRows, error: respErr } = await supabaseAdmin
    .from('responders')
    .select(RESPONDER_PLAN_COLS)
    .eq('campaign_id', jobId);
  if (respErr) throw respErr;

  const { data: sourceRows, error: srcErr } = await fetchAllMailRecords(
    supabaseAdmin, sourceJobId,
    'id, first_name, last_name, address, zip, claritas_ipa, age_band, est_income_code, est_income_range, gender_code, homeowner_flag1, marital_status, length_residence, veh1_make_desc, veh1_model_desc, veh2_make_desc, veh2_model_desc',
  );
  if (srcErr) throw srcErr;
  if (!sourceRows?.length) {
    return { ok: false, status: 400, error: 'No purchased records found for the source job.' };
  }

  const responders = (responderRows ?? []) as any[];
  const results = planDemographicMatches(responders, sourceRows as any[]);
  return { ok: true, targetJob, sourceJob, responders, results, sourceRecords: sourceRows as any[] };
}

export type EnrichmentOutcome = {
  httpStatus: number;
  body: Record<string, unknown>;
};

/**
 * Enrich responders on targetJobId from the explicitly linked source job.
 * Only strong and probable matches are written, and only into null fields.
 * Each update is guarded so that a concurrent edit or prior run is never
 * overwritten. Repeated runs produce no additional writes (idempotent).
 * Guests, attendance, names, contact data, and mailing history are never touched.
 */
export async function runDemographicEnrichment(args: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  targetJobId: string;
  matcherVersion: string;
  sourceJobId?: string;
}): Promise<EnrichmentOutcome> {
  const { supabaseAdmin, targetJobId, matcherVersion, sourceJobId } = args;

  const { data: linkRows, error: linkErr } = await supabaseAdmin
    .from('job_demographic_sources')
    .select('target_job_id, source_job_id, org_id')
    .eq('target_job_id', targetJobId);
  if (linkErr) throw linkErr;

  if (!linkRows?.length) {
    return { httpStatus: 200, body: { mode: 'enrich', matcherVersion, status: 'no_source_link', written: 0 } };
  }
  let link = linkRows[0] as DemographicSourceLink;
  if (sourceJobId) {
    const match = linkRows.find((l: any) => l.source_job_id === sourceJobId);
    if (!match) return { httpStatus: 403, body: { error: 'Source job is not linked to this job' } };
    link = match as DemographicSourceLink;
  } else if (linkRows.length > 1) {
    return { httpStatus: 400, body: { error: 'sourceJobId is required when multiple sources are linked' } };
  }

  const plan = await planForJob(supabaseAdmin, targetJobId, link.source_job_id);
  if (!plan.ok) return { httpStatus: plan.status, body: { error: plan.error } };

  const reason = validateSourceLink(plan.targetJob, plan.sourceJob, link);
  if (reason) return { httpStatus: 400, body: { error: 'Invalid source link', reason } };

  const writes = planEnrichmentWrites(plan.responders as any[], plan.results, plan.sourceRecords as any[]);
  let written = 0;
  let skippedConcurrent = 0;
  const failures: string[] = [];

  for (const w of writes) {
    const patch: Record<string, string | boolean> = {};
    for (const [k, v] of Object.entries(w.patch)) {
      if (ENRICH_ALLOWED_FIELDS.has(k)) patch[k] = v;
    }
    if (Object.keys(patch).length === 0) continue;

    let q = supabaseAdmin.from('responders').update(patch).eq('id', w.responderId).eq('campaign_id', targetJobId);
    // Guard against concurrent writes: the link group only if still unlinked,
    // each demographic field only if still null.
    if (Object.keys(patch).some((k) => LINK_FIELDS.has(k))) q = q.is('mail_record_id', null);
    for (const k of Object.keys(patch)) {
      if (!LINK_FIELDS.has(k)) q = q.is(k, null);
    }
    const { data: updated, error: upErr } = await q.select('id');
    if (upErr) {
      failures.push(w.responderId);
    } else if (!updated?.length) {
      skippedConcurrent += 1;
    } else {
      written += 1;
    }
  }

  return {
    httpStatus: 200,
    body: {
      mode: 'enrich',
      matcherVersion,
      targetJobId,
      sourceJobId: link.source_job_id,
      status: failures.length ? 'partial' : 'ok',
      written,
      skippedConcurrent,
      failed: failures.length,
      counts: summarizePreview(plan.results),
    },
  };
}
