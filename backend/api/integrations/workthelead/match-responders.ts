/**
 * POST /api/integrations/workthelead/match-responders
 *
 * Master-admin only.
 * For each responder in a campaign, attempts to find a matching record
 * in `campaign_mailed_list_records` and enriches the responder with
 * age/income/IPA demographic data.
 *
 * Matching strategy (applied in order, first match wins):
 *   T1 Exact:          normFirst + normLast + zip5
 *   T2 Addr-fuzzy:     normLast  + streetNum(address)
 *   T3 Initial+last+zip: firstChar(normFirst) + normLast + zip5
 *   T4 Name-only:      normFirst + normLast — only when unique on mail list, normLast ≥ 3 chars
 *   T5 Last+zip-unique: normLast + zip5     — only when exactly one candidate on mail list
 *   T6 Initial+last-unique: firstChar(normFirst) + normLast — unique on mail list, normLast ≥ 4 chars
 *      (handles zip mismatch when name initial is sufficient to disambiguate)
 *
 * normFirst strips middle initials (takes first word only), lowercases, alpha-only.
 * normLast lowercases, alpha-only.
 * normZip takes first 5 chars (handles zip+4 and 9-digit zips).
 *
 * Body: { jobId: string, responderId?: string, debug?: boolean }
 * Returns: { ok, matched, fuzzyMatched, unmatched, total, errors[], diagnostics? }
 */

import { requireUserIdFromAuthHeader, getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { decodeIPA, decodeIncome } from '../../_lib/acxiomDecoders.js';

/** Normalize first name — takes first word only (strips middle initial/name). */
function normFirst(s: string | null | undefined): string {
  const word = (s ?? '').trim().split(/\s+/)[0] ?? '';
  return word.toLowerCase().replace(/[^a-z]/g, '');
}

/** Normalize last name — lowercase, alpha-only. */
function normLast(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().trim().replace(/[^a-z]/g, '');
}

function normZip(s: string | null | undefined): string {
  return (s ?? '').trim().replace(/[^0-9]/g, '').slice(0, 5);
}

/** Street number = first word of address (e.g. "123 Main St" → "123"). */
function streetNum(s: string | null | undefined): string {
  return (s ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

type MailRecord = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address: string | null;
  zip: string | null;
  claritas_ipa: string | null;
  age_band: string | null;
  est_income_code: string | null;
  est_income_range: string | null;
};

function buildIndices(mailRecords: MailRecord[]) {
  // T1: normFirst|normLast|zip5
  const t1 = new Map<string, MailRecord>();
  // T2: normLast|streetNum
  const t2 = new Map<string, MailRecord>();
  // T3: firstChar(normFirst)|normLast|zip5
  const t3 = new Map<string, MailRecord>();
  // T4: normFirst|normLast — unique check via count
  const t4 = new Map<string, MailRecord>();
  const t4Count = new Map<string, number>();
  // T5: normLast|zip5 — unique check via count
  const t5 = new Map<string, MailRecord>();
  const t5Count = new Map<string, number>();
  // T6: firstChar(normFirst)|normLast — unique check via count (zip-free fallback)
  const t6 = new Map<string, MailRecord>();
  const t6Count = new Map<string, number>();
  // lastOnly: normLast → all records (for fail diagnostics)
  const lastOnly = new Map<string, MailRecord[]>();

  for (const mr of mailRecords) {
    const nf = normFirst(mr.first_name);
    const nl = normLast(mr.last_name);
    const z  = normZip(mr.zip);
    const sn = streetNum(mr.address);

    const k1 = `${nf}|${nl}|${z}`;
    if (!t1.has(k1)) t1.set(k1, mr);

    const k2 = `${nl}|${sn}`;
    if (sn && !t2.has(k2)) t2.set(k2, mr);

    const k3 = `${nf.charAt(0)}|${nl}|${z}`;
    if (nf && z && !t3.has(k3)) t3.set(k3, mr);

    const k4 = `${nf}|${nl}`;
    if (nf && nl) {
      if (!t4.has(k4)) t4.set(k4, mr);
      t4Count.set(k4, (t4Count.get(k4) ?? 0) + 1);
    }

    const k5 = `${nl}|${z}`;
    if (nl && z) {
      if (!t5.has(k5)) t5.set(k5, mr);
      t5Count.set(k5, (t5Count.get(k5) ?? 0) + 1);
    }

    const k6 = `${nf.charAt(0)}|${nl}`;
    if (nf && nl) {
      if (!t6.has(k6)) t6.set(k6, mr);
      t6Count.set(k6, (t6Count.get(k6) ?? 0) + 1);
    }

    if (nl) {
      const existing = lastOnly.get(nl) ?? [];
      existing.push(mr);
      lastOnly.set(nl, existing);
    }
  }

  return { t1, t2, t3, t4, t4Count, t5, t5Count, t6, t6Count, lastOnly };
}

type Indices = ReturnType<typeof buildIndices>;

function findMatch(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  zip: string | null | undefined,
  address: string | null | undefined,
  idx: Indices,
): { mr: MailRecord | undefined; confidence: 'exact' | 'fuzzy' | 'none'; tier: string; failReason?: string } {
  const nf = normFirst(firstName);
  const nl = normLast(lastName);
  const z  = normZip(zip);
  const sn = streetNum(address);

  // T1 — exact: first + last + zip
  let mr: MailRecord | undefined = idx.t1.get(`${nf}|${nl}|${z}`);
  if (mr) return { mr, confidence: 'exact', tier: 'T1:first+last+zip' };

  // T2 — addr-fuzzy: last + street number (skips if no street number)
  if (sn) {
    mr = idx.t2.get(`${nl}|${sn}`);
    if (mr) return { mr, confidence: 'fuzzy', tier: 'T2:last+streetnum' };
  }

  // T3 — initial+last+zip (handles name abbreviations like Don/Donald, Mike/Michael)
  if (nf && z) {
    mr = idx.t3.get(`${nf.charAt(0)}|${nl}|${z}`);
    if (mr) return { mr, confidence: 'fuzzy', tier: 'T3:initial+last+zip' };
  }

  // T4 — name-only, unique match (handles missing/wrong zip)
  // Guard: last name ≥ 3 chars and exactly one candidate with this first+last
  if (nf && nl.length >= 3) {
    const k4 = `${nf}|${nl}`;
    if ((idx.t4Count.get(k4) ?? 0) === 1) {
      mr = idx.t4.get(k4);
      if (mr) return { mr, confidence: 'fuzzy', tier: 'T4:name-only-unique' };
    }
  }

  // T5 — last+zip, unique match (handles first-name variation when zip is correct)
  if (nl && z) {
    const k5 = `${nl}|${z}`;
    if ((idx.t5Count.get(k5) ?? 0) === 1) {
      mr = idx.t5.get(k5);
      if (mr) return { mr, confidence: 'fuzzy', tier: 'T5:last+zip-unique' };
    }
  }

  // T6 — initial+last, unique match (handles both zip mismatch AND name abbreviation)
  // Guard: last name ≥ 4 chars and exactly one candidate with this initial+last combo
  if (nf && nl.length >= 4) {
    const k6 = `${nf.charAt(0)}|${nl}`;
    if ((idx.t6Count.get(k6) ?? 0) === 1) {
      mr = idx.t6.get(k6);
      if (mr) return { mr, confidence: 'fuzzy', tier: 'T6:initial+last-unique' };
    }
  }

  // Build a concise fail reason for diagnostics
  const lastCandidates = idx.lastOnly.get(nl) ?? [];
  const failParts: string[] = [];
  if (!nl) failParts.push('last_name_empty');
  else if (lastCandidates.length === 0) failParts.push(`last='${nl}':NOT_IN_LIST`);
  else {
    failParts.push(`last='${nl}':${lastCandidates.length}_candidates`);
    const sample = lastCandidates.slice(0, 3).map(c => `${normFirst(c.first_name)}/${normZip(c.zip)}`).join(',');
    failParts.push(`sample=[${sample}]`);
    if (!z) failParts.push('responder_zip_empty:T1/T3/T5_skipped');
    else failParts.push(`responder_zip=${z}`);
    const t4k = `${nf}|${nl}`;
    const t4c = idx.t4Count.get(t4k) ?? 0;
    if (t4c > 1) failParts.push(`T4_blocked:count=${t4c}`);
    const t5k = `${nl}|${z}`;
    const t5c = idx.t5Count.get(t5k) ?? 0;
    if (z && t5c > 1) failParts.push(`T5_blocked:count=${t5c}`);
    const t6k = `${nf.charAt(0)}|${nl}`;
    const t6c = idx.t6Count.get(t6k) ?? 0;
    if (t6c > 1) failParts.push(`T6_blocked:count=${t6c}`);
  }
  const failReason = failParts.join(' | ');

  return { mr: undefined, confidence: 'none', tier: 'none', failReason };
}

const MATCHER_VERSION = 'match-debug-live-2026-05-18';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const userId = await requireUserIdFromAuthHeader(req);

    const { data: adminRow } = await supabaseAdmin
      .from('master_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!adminRow) return res.status(403).json({ error: 'Master admin required' });

    const { jobId, responderId, debug, debugNames } = req.body as {
      jobId?: string;
      responderId?: string;
      debug?: boolean;
      debugNames?: boolean;
    };
    if (!jobId) return res.status(400).json({ error: 'jobId is required' });

    // ── debugNames mode: raw data inspection + actual findMatch(), NO writes ──
    // Fetches ALL purchased records, builds real indices, runs the same findMatch()
    // that the real match path uses, then compares to key-based prediction.
    // Any divergence (key-compare says match but findMatch() says none) is flagged.
    if (debugNames) {
      const TARGET_LAST_NAMES = ['nelson', 'lee', 'hart', 'french'];

      // Fetch ALL mail records for this campaign — same query as real match path.
      const { data: allMailRecords, error: allMailErr } = await supabaseAdmin
        .from('campaign_mailed_list_records')
        .select('id, first_name, last_name, address, zip, claritas_ipa, age_band, est_income_code, est_income_range')
        .eq('campaign_id', jobId);
      if (allMailErr) throw allMailErr;

      const allMailCount = allMailRecords?.length ?? 0;

      // Also fetch display columns for the target names
      const { data: purchasedRows, error: pErr } = await supabaseAdmin
        .from('campaign_mailed_list_records')
        .select('id, first_name, last_name, individual_name, address, city, state, zip, age_band, est_income_code, est_income_range, claritas_ipa')
        .eq('campaign_id', jobId)
        .or(TARGET_LAST_NAMES.map(n => `last_name.ilike.${n}`).join(','));
      if (pErr) throw pErr;

      // Build REAL indices from the full list — identical to real match path
      const realIdx = allMailCount > 0
        ? buildIndices(allMailRecords as MailRecord[])
        : null;

      // T4/T5 uniqueness counts for the target names (from full list)
      const t4UniqueInfo: Record<string, number> = {};
      const t5UniqueInfo: Record<string, number> = {};
      if (realIdx) {
        for (const [k, v] of realIdx.t4Count) t4UniqueInfo[k] = v;
        for (const [k, v] of realIdx.t5Count) t5UniqueInfo[k] = v;
      }

      // Fetch responder records for the 4 target last names
      const { data: responderRows, error: rErr } = await supabaseAdmin
        .from('responders')
        .select('id, first_name, last_name, address, zip, phone, matched_to_mail_list, match_confidence, mail_record_id, age, income, ipa')
        .eq('campaign_id', jobId)
        .or(TARGET_LAST_NAMES.map(n => `last_name.ilike.${n}`).join(','));
      if (rErr) throw rErr;

      // Build per-last-name report
      const report = TARGET_LAST_NAMES.map(targetNL => {
        const purchased = (purchasedRows ?? []).filter(p => normLast(p.last_name) === targetNL);
        const responders = (responderRows ?? []).filter(r => normLast(r.last_name) === targetNL);

        const purchasedKeyed = purchased.slice(0, 10).map(p => ({
          raw: { first: p.first_name, last: p.last_name, individual: p.individual_name, zip: p.zip, addr: p.address, city: p.city, state: p.state, age: p.age_band, income: p.est_income_code, ipa: p.claritas_ipa, decodedIncome: decodeIncome(p.est_income_code) ?? p.est_income_range ?? null, decodedIpa: decodeIPA(p.claritas_ipa) ?? null },
          normalized: { normFirst: normFirst(p.first_name), normLast: normLast(p.last_name), normFullName: `${normFirst(p.first_name)} ${normLast(p.last_name)}`.trim(), normZip: normZip(p.zip) },
          keys: {
            T1: `${normFirst(p.first_name)}|${normLast(p.last_name)}|${normZip(p.zip)}`,
            T2: `${normLast(p.last_name)}|${streetNum(p.address)}`,
            T3: `${normFirst(p.first_name).charAt(0)}|${normLast(p.last_name)}|${normZip(p.zip)}`,
            T4: `${normFirst(p.first_name)}|${normLast(p.last_name)}`,
            T5: `${normLast(p.last_name)}|${normZip(p.zip)}`,
          },
        }));

        const responderAnalysis = responders.map(r => {
          const nf = normFirst(r.first_name);
          const nl = normLast(r.last_name);
          const z  = normZip(r.zip);
          const sn = streetNum(r.address);

          // ── Key-based prediction (what the old debug showed) ───────────────
          const keysGenerated = {
            T1: `${nf}|${nl}|${z}`,
            T2: nl && sn ? `${nl}|${sn}` : '(skipped: no streetnum)',
            T3: nf && z ? `${nf.charAt(0)}|${nl}|${z}` : '(skipped: no first or zip)',
            T4: nl.length >= 4 ? `${nf}|${nl}` : '(skipped: last<4chars)',
            T5: nl && z ? `${nl}|${z}` : '(skipped: no zip)',
          };
          const t4Key = `${nf}|${nl}`;
          const t5Key = `${nl}|${z}`;
          const keyPrediction = purchasedKeyed.map(pk => {
            const matchAt: string[] = [];
            if (pk.keys.T1 === keysGenerated.T1) matchAt.push('T1');
            if (!keysGenerated.T2.startsWith('(') && pk.keys.T2 === keysGenerated.T2) matchAt.push('T2');
            if (!keysGenerated.T3.startsWith('(') && pk.keys.T3 === keysGenerated.T3) matchAt.push('T3');
            // T4/T5: flag as candidate only — uniqueness against FULL list not checked here
            if (!keysGenerated.T4.startsWith('(') && pk.keys.T4 === keysGenerated.T4)
              matchAt.push(`T4_candidate(fullListCount=${t4UniqueInfo[t4Key] ?? 0})`);
            if (!keysGenerated.T5.startsWith('(') && pk.keys.T5 === keysGenerated.T5)
              matchAt.push(`T5_candidate(fullListCount=${t5UniqueInfo[t5Key] ?? 0})`);
            return { purchasedFirst: pk.raw.first, purchasedZip: pk.raw.zip, matchAt };
          });
          const keyDiagnosis = keyPrediction.some(t => t.matchAt.length > 0)
            ? `KEY-COMPARE would match: ${keyPrediction.filter(t => t.matchAt.length > 0).map(t => `${t.purchasedFirst} at ${t.matchAt.join('/')}`).join(', ')}`
            : `KEY-COMPARE: no match — zip=${z||'(blank)'}, first=${nf||'(blank)'}, purchased=${purchased.length}`;

          // ── Actual findMatch() result using REAL full-list indices ─────────
          const actualResult = realIdx
            ? findMatch(r.first_name, r.last_name, r.zip, r.address, realIdx)
            : { mr: undefined as MailRecord | undefined, confidence: 'none' as const, tier: 'no-index' };

          const actualDiagnosis = actualResult.mr
            ? `REAL findMatch(): ${actualResult.tier} → ${actualResult.mr.first_name} ${actualResult.mr.last_name} zip=${actualResult.mr.zip}`
            : `REAL findMatch(): NO MATCH (confidence=none)`;

          // ── Divergence flag ───────────────────────────────────────────────
          const keyWouldMatch = keyPrediction.some(t =>
            t.matchAt.some(m => m.startsWith('T1') || m.startsWith('T2') || m.startsWith('T3'))
          );
          const realMatches = actualResult.mr !== undefined;
          const diverged = keyWouldMatch !== realMatches;

          const purchasedCountByFirstLast = purchased.filter(
            p => normFirst(p.first_name) === nf && normLast(p.last_name) === nl
          ).length;

          return {
            raw: { id: r.id, first: r.first_name, last: r.last_name, zip: r.zip, addr: r.address, phone: (r as any).phone ?? null },
            normFullName: `${nf} ${nl}`.trim(),
            purchasedCountByLastName: purchased.length,
            purchasedCountByFirstLast,
            currentDbState: { matched_to_mail_list: r.matched_to_mail_list, match_confidence: r.match_confidence, age: r.age, income: r.income, ipa: r.ipa },
            keysGenerated,
            keyPrediction,
            keyDiagnosis,
            actualFindMatch: {
              tier: actualResult.tier,
              confidence: actualResult.confidence,
              matchedRecord: actualResult.mr
                ? { first: actualResult.mr.first_name, last: actualResult.mr.last_name, zip: actualResult.mr.zip, addr: actualResult.mr.address }
                : null,
            },
            actualDiagnosis,
            DIVERGED: diverged,
            divergenceExplanation: diverged
              ? (keyWouldMatch
                  ? `KEY-COMPARE predicted match but findMatch() returns none. Likely cause: T4/T5 uniqueness guard fired (full-list count for T4 key "${t4Key}" = ${t4UniqueInfo[t4Key] ?? 0}, T5 key "${t5Key}" = ${t5UniqueInfo[t5Key] ?? 0}). T1/T2/T3 keys did not hit the index — check normalized key values above.`
                  : `findMatch() found a match but KEY-COMPARE predicted none. Check key comparison logic.`)
              : 'no divergence',
          };
        });

        return {
          lastName: targetNL,
          purchasedCount: purchased.length,
          responderCount: responders.length,
          purchased: purchasedKeyed,
          responders: responderAnalysis,
        };
      });

      const anyDiverged = report.some(r => r.responders.some((a: any) => a.DIVERGED));

      return res.status(200).json({
        ok: true,
        matcherVersion: MATCHER_VERSION,
        campaignId: jobId,
        mailListTotalForCampaign: allMailCount,
        DIVERGENCE_DETECTED: anyDiverged,
        note: anyDiverged
          ? 'DIVERGENCE: key-compare prediction and real findMatch() disagree for ≥1 responder. See DIVERGED + divergenceExplanation fields.'
          : 'No divergence — key-compare and findMatch() agree for all target responders.',
        report,
      });
    }

    // Fetch all mailed list records for this campaign
    const { data: mailRecords, error: mailErr } = await supabaseAdmin
      .from('campaign_mailed_list_records')
      .select('id, first_name, last_name, address, zip, claritas_ipa, age_band, est_income_code, est_income_range')
      .eq('campaign_id', jobId);

    if (mailErr) throw mailErr;
    if (!mailRecords?.length) {
      return res.status(400).json({ error: 'No mailed list records found for this campaign. Import the CSV first.' });
    }

    const idx = buildIndices(mailRecords as MailRecord[]);

    // ── Single-responder mode ─────────────────────────────────────────────────
    if (responderId) {
      const { data: singleResp, error: singleErr } = await supabaseAdmin
        .from('responders')
        .select('id, first_name, last_name, address, zip')
        .eq('id', responderId)
        .maybeSingle();
      if (singleErr) throw singleErr;
      if (!singleResp) return res.status(200).json({ ok: true, matched: 0, fuzzyMatched: 0, unmatched: 0, total: 0, errors: [] });

      const { mr, confidence } = findMatch(singleResp.first_name, singleResp.last_name, singleResp.zip, singleResp.address, idx);
      const update = {
        matched_to_mail_list: mr != null,
        match_confidence:     confidence,
        mail_record_id:       mr?.id ?? null,
        age:                  mr?.age_band ?? null,
        income:               decodeIncome(mr?.est_income_code) ?? mr?.est_income_range ?? null,
        ipa:                  decodeIPA(mr?.claritas_ipa) ?? null,
      };
      const { error: updErr } = await supabaseAdmin.from('responders').update(update).eq('id', responderId);
      if (updErr) return res.status(500).json({ ok: false, error: updErr.message });
      return res.status(200).json({
        ok: true,
        matcherVersion: MATCHER_VERSION,
        matched:      confidence === 'exact' ? 1 : 0,
        fuzzyMatched: confidence === 'fuzzy' ? 1 : 0,
        unmatched:    confidence === 'none'  ? 1 : 0,
        total: 1, errors: [],
      });
    }

    // ── Full campaign mode ────────────────────────────────────────────────────
    const { data: responders, error: respErr } = await supabaseAdmin
      .from('responders')
      .select('id, first_name, last_name, address, zip')
      .eq('campaign_id', jobId);
    if (respErr) throw respErr;
    if (!responders?.length) {
      return res.status(200).json({ ok: true, matched: 0, fuzzyMatched: 0, unmatched: 0, total: 0, errors: [], nameResults: [] });
    }

    // ── Step 1: compute all matches synchronously (zero IO) ───────────────────
    type UpdateRow = {
      id: string;
      matched_to_mail_list: boolean;
      match_confidence: string;
      mail_record_id: string | null;
      age: string | null;
      income: string | null;
      ipa: string | null;
    };

    type NameResult = {
      id: string;
      name: string;
      responderFirst: string | null;
      responderLast: string | null;
      responderZip: string | null;
      tier: string;
      confidence: string;
      matchedPurchasedName: string | null;
      matchedPurchasedZip: string | null;
      failReason: string | null;
      writeOk: boolean;
      writeError: string | null;
    };

    let matched = 0;
    let fuzzyMatched = 0;
    let unmatched = 0;
    const updateRows: UpdateRow[] = [];
    const nameResults: NameResult[] = [];
    const diagnostics: object[] = [];

    // Names to generate detailed diagnostics for (debug mode only)
    const DIAG_NAMES = new Set(['donald nelson', 'lisa lee', 'michael hart', 'catherine french']);

    for (const resp of responders) {
      const { mr, confidence, tier, failReason } = findMatch(resp.first_name, resp.last_name, resp.zip, resp.address, idx);

      // Diagnostic output for specific responders (debug mode)
      if (debug) {
        const fullName = `${(resp.first_name ?? '').toLowerCase()} ${(resp.last_name ?? '').toLowerCase()}`.trim();
        const wantDiag = DIAG_NAMES.has(fullName) || confidence === 'none';
        if (wantDiag) {
          const nl = normLast(resp.last_name);
          const nf = normFirst(resp.first_name);
          const z  = normZip(resp.zip);
          const lastNameCandidates = (mailRecords as MailRecord[])
            .filter(m => normLast(m.last_name) === nl)
            .slice(0, 5)
            .map(m => ({ first: m.first_name, last: m.last_name, zip: m.zip, addr: m.address }));
          const lastZipCandidates = (mailRecords as MailRecord[])
            .filter(m => normLast(m.last_name) === nl && normZip(m.zip) === z)
            .slice(0, 5)
            .map(m => ({ first: m.first_name, last: m.last_name, zip: m.zip, addr: m.address }));
          diagnostics.push({
            responder: { first: resp.first_name, last: resp.last_name, zip: resp.zip, addr: resp.address },
            normalized: { nf, nl, z, sn: streetNum(resp.address) },
            keysTriedT1: `${nf}|${nl}|${z}`,
            keysTriedT2: `${nl}|${streetNum(resp.address)}`,
            keysTriedT3: `${nf.charAt(0)}|${nl}|${z}`,
            keysTriedT4: nl.length >= 4 ? `${nf}|${nl}` : '(skipped: last<4)',
            keysTriedT5: `${nl}|${z}`,
            confidence,
            tier,
            lastNameCandidates,
            lastZipCandidates,
          });
        }
      }

      if (confidence === 'exact') matched++;
      else if (confidence === 'fuzzy') fuzzyMatched++;
      else unmatched++;

      updateRows.push({
        id:                   resp.id,
        matched_to_mail_list: mr !== undefined,
        match_confidence:     confidence,
        mail_record_id:       mr?.id ?? null,
        age:                  mr?.age_band ?? null,
        income:               decodeIncome(mr?.est_income_code) ?? mr?.est_income_range ?? null,
        ipa:                  decodeIPA(mr?.claritas_ipa) ?? null,
      });

      nameResults.push({
        id:                    resp.id,
        name:                  `${resp.first_name ?? ''} ${resp.last_name ?? ''}`.trim(),
        responderFirst:        resp.first_name ?? null,
        responderLast:         resp.last_name  ?? null,
        responderZip:          resp.zip        ?? null,
        tier,
        confidence,
        matchedPurchasedName:  mr ? `${mr.first_name ?? ''} ${mr.last_name ?? ''}`.trim() : null,
        matchedPurchasedZip:   mr?.zip ?? null,
        failReason:            confidence === 'none' ? (failReason ?? null) : null,
        writeOk:               false, // will be updated after writes
        writeError:            null,
      });
    }

    // ── Step 2: parallel updates in batches of 50 ─────────────────────────────
    // Using update().eq('id') instead of upsert() — upsert requires all NOT NULL
    // columns (first_name, last_name, campaign_id, etc.) even when the row exists,
    // because PostgreSQL validates the INSERT tuple before conflict detection.
    // update() only touches the columns specified, no INSERT path, no constraint risk.
    const PARALLEL_SIZE = 50;
    const errors: string[] = [];

    for (let i = 0; i < updateRows.length; i += PARALLEL_SIZE) {
      const batch = updateRows.slice(i, i + PARALLEL_SIZE);

      const results = await Promise.allSettled(
        batch.map(row => {
          const { id, ...fields } = row;
          return supabaseAdmin.from('responders').update(fields).eq('id', id);
        })
      );

      results.forEach((result, j) => {
        const row = batch[j];
        const nameIdx = i + j;
        if (result.status === 'rejected') {
          const msg = `${row.id} (${nameResults[nameIdx]?.name}): ${String(result.reason)}`;
          errors.push(msg);
          nameResults[nameIdx].writeOk = false;
          nameResults[nameIdx].writeError = String(result.reason);
        } else if (result.value.error) {
          const e = result.value.error as any;
          const detail = [e.code, e.message, e.details, e.hint].filter(Boolean).join(' | ');
          const msg = `${row.id} (${nameResults[nameIdx]?.name}): ${detail}`;
          errors.push(msg);
          nameResults[nameIdx].writeOk = false;
          nameResults[nameIdx].writeError = detail;
        } else {
          nameResults[nameIdx].writeOk = true;
        }
      });
    }

    const writeFailCount = nameResults.filter(r => !r.writeOk).length;

    // ── Target-name spotlight: French, Lee, Hart, Nelson in the real result ──
    const SPOTLIGHT_LAST = new Set(['french', 'lee', 'hart', 'nelson']);
    const spotlight = nameResults.filter(r =>
      SPOTLIGHT_LAST.has(normLast(r.name.split(' ').slice(-1)[0] ?? ''))
    );

    const result: Record<string, unknown> = {
      ok: true,
      matcherVersion: MATCHER_VERSION,
      matched,
      fuzzyMatched,
      unmatched,
      total: responders.length,
      writeFailCount,
      errors: errors.slice(0, 20),
      nameResults,
      spotlight,
    };
    if (debug && diagnostics.length) result.diagnostics = diagnostics;

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[match-responders]', err);
    return res.status(500).json({ error: err?.message ?? 'Internal server error' });
  }
}
