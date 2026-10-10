/**
 * Pure, side-effect-free planning for responder demographic matching.
 *
 * No database access happens here. Callers load rows, call these functions,
 * and decide what (if anything) to write. Used by the read-only preview in
 * workthelead/match-responders.ts and by tests.
 *
 * Classification per primary responder (first matching rule wins):
 *   strong          exactly one source row with the same first+last AND
 *                   postal evidence (zip5, or street number with same last name)
 *   probable        exactly one source row with the same first+last and no postal
 *                   evidence. Demographics are populated but labelled probable,
 *                   never verified.
 *   name_only       exactly one source row matching first initial + last name only.
 *                   Candidate for review; demographics are NOT populated.
 *   ambiguous       several source rows share the name, or several corroborated rows,
 *                   or the matched source row is claimed by more than one responder
 *   unmatched       no source row with the same name (or missing name)
 *
 * Only `strong` and `probable` results produce enrichment writes. Writes never
 * overwrite a non-null responder field and never touch registration data.
 */

import { decodeIPA, decodeIncome } from './acxiomDecoders.js';

export type MatchClass = 'strong' | 'probable' | 'name_only' | 'ambiguous' | 'unmatched';

/** Confidence values written to responders.match_confidence for enriched rows. */
export type EnrichmentConfidence = 'exact' | 'probable';

export interface PlannerResponder {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address: string | null;
  zip: string | null;
  mail_record_id: string | null;
  matched_to_mail_list: boolean | null;
  [field: string]: unknown;
}

export interface PlannerSourceRecord {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address: string | null;
  zip: string | null;
  claritas_ipa: string | null;
  age_band: string | null;
  est_income_code: string | null;
  est_income_range: string | null;
  gender_code: string | null;
  homeowner_flag1: string | null;
  marital_status: string | null;
  length_residence: string | null;
  veh1_make_desc: string | null;
  veh1_model_desc: string | null;
  veh2_make_desc: string | null;
  veh2_model_desc: string | null;
}

export interface PlannerResult {
  responderId: string;
  classification: MatchClass;
  alreadyEnriched: boolean;
  sourceRecordId: string | null;
  candidateCount: number;
  reason: string;
}

export interface PreviewCounts {
  totalPrimaries: number;
  alreadyEnriched: number;
  strong: number;
  probable: number;
  nameOnlyCandidates: number;
  ambiguous: number;
  unmatched: number;
}

/** Documented campaign targeting ranges. Never copied into responder fields. */
export interface CampaignTargetingRanges {
  [field: string]: string;
}

export type CampaignEstimate =
  | { kind: 'unavailable' }
  | { kind: 'campaign_estimate'; ranges: CampaignTargetingRanges };

/** Link between a target job and the master source job it may draw from. */
export interface DemographicSourceLink {
  target_job_id: string;
  source_job_id: string;
  org_id: string;
}

export interface JobOrgRef {
  id: string;
  org_id: string;
}

export interface EnrichmentWrite {
  responderId: string;
  classification: 'strong' | 'probable';
  sourceRecordId: string;
  patch: Record<string, string | boolean>;
}

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);

/** First word only, lowercase, letters only. */
export function normalizeFirstName(value: string | null | undefined): string {
  const first = String(value ?? '').trim().split(/\s+/)[0] ?? '';
  return first.toLowerCase().replace(/[^a-z]/g, '');
}

/** Lowercase, letters only, with generational suffixes removed. */
export function normalizeLastName(value: string | null | undefined): string {
  const parts = String(value ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((p) => p.replace(/[^a-z]/g, ''))
    .filter((p) => p.length > 0 && !SUFFIXES.has(p));
  return parts.join('');
}

/** First five digits of a zip. Returns null when fewer than five digits exist. */
export function normalizeZip5(value: string | null | undefined): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 5 ? digits.slice(0, 5) : null;
}

/** Leading house number of an address, or null. */
export function streetNumber(value: string | null | undefined): string | null {
  const m = String(value ?? '').trim().match(/^(\d+)/);
  return m ? m[1] : null;
}

/** A responder is already enriched when a mail record is linked or a match is recorded. */
export function isAlreadyEnriched(r: PlannerResponder): boolean {
  return r.mail_record_id != null || r.matched_to_mail_list === true;
}

interface Indexed {
  row: PlannerSourceRecord;
  first: string;
  last: string;
  zip5: string | null;
  num: string | null;
}

function indexSource(records: PlannerSourceRecord[]): Indexed[] {
  return records.map((row) => ({
    row,
    first: normalizeFirstName(row.first_name),
    last: normalizeLastName(row.last_name),
    zip5: normalizeZip5(row.zip),
    num: streetNumber(row.address),
  }));
}

function corroborated(
  responder: { zip5: string | null; num: string | null; last: string },
  candidate: Indexed,
): boolean {
  if (responder.zip5 && candidate.zip5 && responder.zip5 === candidate.zip5) return true;
  if (responder.num && candidate.num && responder.num === candidate.num && responder.last === candidate.last) {
    return true;
  }
  return false;
}

/**
 * Classify each responder against the source records.
 * Deterministic: output order follows input responder order; no first-row-wins.
 */
export function planDemographicMatches(
  responders: PlannerResponder[],
  sourceRecords: PlannerSourceRecord[],
): PlannerResult[] {
  const sources = indexSource(sourceRecords);

  const byFullName = new Map<string, Indexed[]>();
  const byLastInitial = new Map<string, Indexed[]>();
  for (const s of sources) {
    if (!s.first || !s.last) continue;
    const full = `${s.first}|${s.last}`;
    if (!byFullName.has(full)) byFullName.set(full, []);
    byFullName.get(full)!.push(s);
    const initial = `${s.first[0]}|${s.last}`;
    if (!byLastInitial.has(initial)) byLastInitial.set(initial, []);
    byLastInitial.get(initial)!.push(s);
  }

  const provisional: PlannerResult[] = responders.map((r) => {
    const first = normalizeFirstName(r.first_name);
    const last = normalizeLastName(r.last_name);
    const enriched = isAlreadyEnriched(r);
    const base = { responderId: r.id, alreadyEnriched: enriched };

    if (!first || !last) {
      return { ...base, classification: 'unmatched', sourceRecordId: null, candidateCount: 0, reason: 'missing_name' };
    }

    const rr = { zip5: normalizeZip5(r.zip), num: streetNumber(r.address), last };
    let pool = byFullName.get(`${first}|${last}`) ?? [];
    let fullNamePool = true;
    if (pool.length === 0) {
      pool = byLastInitial.get(`${first[0]}|${last}`) ?? [];
      fullNamePool = false;
    }
    if (pool.length === 0) {
      return { ...base, classification: 'unmatched', sourceRecordId: null, candidateCount: 0, reason: 'no_name_match' };
    }

    const corr = pool.filter((c) => corroborated(rr, c));
    if (fullNamePool && corr.length === 1) {
      return { ...base, classification: 'strong', sourceRecordId: corr[0].row.id, candidateCount: pool.length, reason: 'name_and_postal' };
    }
    if (corr.length > 1) {
      return { ...base, classification: 'ambiguous', sourceRecordId: null, candidateCount: corr.length, reason: 'multiple_postal_matches' };
    }
    if (pool.length === 1 && fullNamePool) {
      return {
        ...base,
        classification: 'probable',
        sourceRecordId: pool[0].row.id,
        candidateCount: 1,
        reason: 'unique_name_unverified',
      };
    }
    if (pool.length === 1) {
      return {
        ...base,
        classification: 'name_only',
        sourceRecordId: pool[0].row.id,
        candidateCount: 1,
        reason: 'initial_last_only_unverified',
      };
    }
    return { ...base, classification: 'ambiguous', sourceRecordId: null, candidateCount: pool.length, reason: 'multiple_name_matches' };
  });

  // Several responders claiming the same source row cannot all be verified.
  const claims = new Map<string, number>();
  for (const p of provisional) {
    if (p.sourceRecordId && (p.classification === 'strong' || p.classification === 'probable' || p.classification === 'name_only')) {
      claims.set(p.sourceRecordId, (claims.get(p.sourceRecordId) ?? 0) + 1);
    }
  }
  return provisional.map((p) => {
    if (p.sourceRecordId && (claims.get(p.sourceRecordId) ?? 0) > 1) {
      return { ...p, classification: 'ambiguous' as MatchClass, sourceRecordId: null, reason: 'shared_source_record' };
    }
    return p;
  });
}

/** Summarise planner output for the read-only preview. Counts only; no names. */
export function summarizePreview(results: PlannerResult[]): PreviewCounts {
  const counts: PreviewCounts = {
    totalPrimaries: results.length,
    alreadyEnriched: 0,
    strong: 0,
    probable: 0,
    nameOnlyCandidates: 0,
    ambiguous: 0,
    unmatched: 0,
  };
  for (const r of results) {
    if (r.alreadyEnriched) counts.alreadyEnriched++;
    if (r.classification === 'strong') counts.strong++;
    else if (r.classification === 'probable') counts.probable++;
    else if (r.classification === 'name_only') counts.nameOnlyCandidates++;
    else if (r.classification === 'ambiguous') counts.ambiguous++;
    else counts.unmatched++;
  }
  return counts;
}

/**
 * Build the patch for one enrichable match.
 * Writes only fields that are null/undefined on the responder. Address and zip
 * are never written here (they are registration data). The link group
 * (mail_record_id, matched_to_mail_list, match_confidence) is written only when
 * the responder is not already enriched, so a prior link is never replaced.
 */
export function buildEnrichmentPatch(
  responder: PlannerResponder,
  source: PlannerSourceRecord,
  classification: 'strong' | 'probable' = 'strong',
): Record<string, string | boolean> {
  const patch: Record<string, string | boolean> = {};
  if (!isAlreadyEnriched(responder)) {
    const confidence: EnrichmentConfidence = classification === 'probable' ? 'probable' : 'exact';
    patch.mail_record_id = source.id;
    patch.matched_to_mail_list = true;
    patch.match_confidence = confidence;
  }

  const desired: Record<string, string | null> = {
    age: source.age_band,
    income: decodeIncome(source.est_income_code) ?? source.est_income_range ?? null,
    ipa: decodeIPA(source.claritas_ipa) ?? null,
    claritas_ipa_raw: source.claritas_ipa,
    est_income_code: source.est_income_code,
    est_income_range: source.est_income_range,
    gender_code: source.gender_code,
    homeowner_flag1: source.homeowner_flag1,
    marital_status: source.marital_status,
    length_residence: source.length_residence,
    veh1_make_desc: source.veh1_make_desc,
    veh1_model_desc: source.veh1_model_desc,
    veh2_make_desc: source.veh2_make_desc,
    veh2_model_desc: source.veh2_model_desc,
  };

  for (const [field, value] of Object.entries(desired)) {
    if (value == null || value === '') continue;
    if (responder[field] != null) continue; // never overwrite existing enrichment
    patch[field] = value;
  }
  return patch;
}

/**
 * Plan the writes for a full run. Only strong and probable results with a
 * non-empty patch produce a write. Running this again on the output of a
 * completed run yields no writes (idempotent).
 */
export function planEnrichmentWrites(
  responders: PlannerResponder[],
  results: PlannerResult[],
  sourceRecords: PlannerSourceRecord[],
): EnrichmentWrite[] {
  const sourceById = new Map(sourceRecords.map((s) => [s.id, s]));
  const responderById = new Map(responders.map((r) => [r.id, r]));
  const writes: EnrichmentWrite[] = [];
  for (const result of results) {
    if (result.classification !== 'strong' && result.classification !== 'probable') continue;
    if (!result.sourceRecordId) continue;
    const responder = responderById.get(result.responderId);
    const source = sourceById.get(result.sourceRecordId);
    if (!responder || !source) continue;
    // Already-linked responders keep their existing source. Never mix sources.
    if (isAlreadyEnriched(responder)) continue;
    const patch = buildEnrichmentPatch(responder, source, result.classification);
    if (Object.keys(patch).length === 0) continue;
    writes.push({
      responderId: responder.id,
      classification: result.classification,
      sourceRecordId: source.id,
      patch,
    });
  }
  return writes;
}

/**
 * Validate that a target job may draw demographics from a source job.
 * Requires an explicit link row, identical org on both jobs and the link, and
 * distinct jobs. Returns a reason string on failure, or null when valid.
 */
export function validateSourceLink(
  target: JobOrgRef | null,
  source: JobOrgRef | null,
  link: DemographicSourceLink | null,
): string | null {
  if (!target) return 'target_job_not_found';
  if (!source) return 'source_job_not_found';
  if (!link) return 'no_source_link';
  if (target.id === source.id) return 'source_equals_target';
  if (link.target_job_id !== target.id || link.source_job_id !== source.id) return 'link_mismatch';
  if (target.org_id !== source.org_id || link.org_id !== target.org_id) return 'cross_org_link';
  return null;
}

/**
 * Campaign-level fallback. Returns the documented ranges only when they exist.
 * Never fabricates ranges. The result must not be written to responder fields.
 */
export function campaignEstimateFor(ranges: CampaignTargetingRanges | null | undefined): CampaignEstimate {
  if (!ranges) return { kind: 'unavailable' };
  const entries = Object.entries(ranges).filter(([, v]) => typeof v === 'string' && v.trim() !== '');
  if (entries.length === 0) return { kind: 'unavailable' };
  return { kind: 'campaign_estimate', ranges: Object.fromEntries(entries) };
}

