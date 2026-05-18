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
 *   T4 Name-only:      normFirst + normLast — only when unique on mail list, normLast ≥ 4 chars
 *   T5 Last+zip-unique: normLast + zip5     — only when exactly one candidate on mail list
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
  }

  return { t1, t2, t3, t4, t4Count, t5, t5Count };
}

type Indices = ReturnType<typeof buildIndices>;

function findMatch(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  zip: string | null | undefined,
  address: string | null | undefined,
  idx: Indices,
): { mr: MailRecord | undefined; confidence: 'exact' | 'fuzzy' | 'none'; tier: string } {
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
  // Guard: last name ≥ 4 chars and exactly one candidate with this first+last
  if (nf && nl.length >= 4) {
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

  return { mr: undefined, confidence: 'none', tier: 'none' };
}

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

    // ── debugNames mode: raw data inspection, NO writes ──────────────────────
    // Returns everything needed to understand why specific names fail to match.
    if (debugNames) {
      const TARGET_LAST_NAMES = ['nelson', 'lee', 'hart', 'french'];

      // Count of ALL purchased records for this campaign
      const { count: mailCount } = await supabaseAdmin
        .from('campaign_mailed_list_records')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', jobId);

      // Fetch purchased records for the 4 target last names only
      const { data: purchasedRows, error: pErr } = await supabaseAdmin
        .from('campaign_mailed_list_records')
        .select('id, first_name, last_name, individual_name, address, city, state, zip, age_band, est_income_code, est_income_range, claritas_ipa')
        .eq('campaign_id', jobId)
        .or(TARGET_LAST_NAMES.map(n => `last_name.ilike.${n}`).join(','));
      if (pErr) throw pErr;

      // Fetch responder records for the 4 target last names
      const { data: responderRows, error: rErr } = await supabaseAdmin
        .from('responders')
        .select('id, first_name, last_name, address, zip, matched_to_mail_list, match_confidence, mail_record_id, age, income, ipa')
        .eq('campaign_id', jobId)
        .or(TARGET_LAST_NAMES.map(n => `last_name.ilike.${n}`).join(','));
      if (rErr) throw rErr;

      // Build per-last-name comparison
      const report = TARGET_LAST_NAMES.map(targetNL => {
        const purchased = (purchasedRows ?? []).filter(p => normLast(p.last_name) === targetNL);
        const responders = (responderRows ?? []).filter(r => normLast(r.last_name) === targetNL);

        const purchasedKeyed = purchased.map(p => ({
          raw: { first: p.first_name, last: p.last_name, individual: p.individual_name, zip: p.zip, addr: p.address, city: p.city, state: p.state, age: p.age_band, income: p.est_income_code, ipa: p.claritas_ipa },
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
          const keysGenerated = {
            T1: `${nf}|${nl}|${z}`,
            T2: nl && sn ? `${nl}|${sn}` : '(skipped: no streetnum)',
            T3: nf && z ? `${nf.charAt(0)}|${nl}|${z}` : '(skipped: no first or zip)',
            T4: nl.length >= 4 ? `${nf}|${nl}` : '(skipped: last<4chars)',
            T5: nl && z ? `${nl}|${z}` : '(skipped: no zip)',
          };
          // Check which purchased records would match at each tier
          const tierMatches = purchasedKeyed.map(pk => {
            const matchAt: string[] = [];
            if (pk.keys.T1 === keysGenerated.T1) matchAt.push('T1');
            if (!keysGenerated.T2.startsWith('(') && pk.keys.T2 === keysGenerated.T2) matchAt.push('T2');
            if (!keysGenerated.T3.startsWith('(') && pk.keys.T3 === keysGenerated.T3) matchAt.push('T3');
            if (!keysGenerated.T4.startsWith('(') && pk.keys.T4 === keysGenerated.T4) matchAt.push('T4_candidate');
            if (!keysGenerated.T5.startsWith('(') && pk.keys.T5 === keysGenerated.T5) matchAt.push('T5_candidate');
            return { purchasedFirst: pk.raw.first, purchasedZip: pk.raw.zip, matchAt };
          });
          return {
            raw: { id: r.id, first: r.first_name, last: r.last_name, zip: r.zip, addr: r.address },
            currentState: { matched_to_mail_list: r.matched_to_mail_list, match_confidence: r.match_confidence, age: r.age, income: r.income, ipa: r.ipa },
            keysGenerated,
            tierMatches,
            diagnosis: tierMatches.some(t => t.matchAt.length > 0)
              ? `Would match: ${tierMatches.filter(t => t.matchAt.length > 0).map(t => `${t.purchasedFirst} at ${t.matchAt.join('/')}`).join(', ')}`
              : `NO MATCH — zip=${z||'(blank)'}, first=${nf||'(blank)'}, purchasedCandidates=${purchased.length}`,
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

      return res.status(200).json({
        ok: true,
        campaignId: jobId,
        mailListTotalForCampaign: mailCount ?? 0,
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
      return res.status(200).json({ ok: true, matched: 0, fuzzyMatched: 0, unmatched: 0, total: 0, errors: [] });
    }

    let matched = 0;
    let fuzzyMatched = 0;
    let unmatched = 0;
    const errors: string[] = [];
    const diagnostics: object[] = [];

    // Names to generate detailed diagnostics for (temporarily — remove after confirming match accuracy)
    const DIAG_NAMES = new Set(['donald nelson', 'lisa lee', 'michael hart', 'catherine french']);

    for (const resp of responders) {
      try {
        const { mr, confidence, tier } = findMatch(resp.first_name, resp.last_name, resp.zip, resp.address, idx);

        // Diagnostic output for specific responders
        if (debug) {
          const fullName = `${(resp.first_name ?? '').toLowerCase()} ${(resp.last_name ?? '').toLowerCase()}`.trim();
          const wantDiag = DIAG_NAMES.has(fullName) || confidence === 'none';
          if (wantDiag) {
            const nl = normLast(resp.last_name);
            const nf = normFirst(resp.first_name);
            const z  = normZip(resp.zip);
            // Candidates with same last name on the mail list
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

        const update: Record<string, unknown> = {
          matched_to_mail_list: mr != null,
          match_confidence:     confidence,
          mail_record_id:       mr?.id ?? null,
          age:                  mr?.age_band ?? null,
          income:               decodeIncome(mr?.est_income_code) ?? mr?.est_income_range ?? null,
          ipa:                  decodeIPA(mr?.claritas_ipa) ?? null,
        };

        const { error: updErr } = await supabaseAdmin
          .from('responders')
          .update(update)
          .eq('id', resp.id);

        if (updErr) {
          errors.push(`Responder ${resp.id}: ${updErr.message}`);
        } else if (confidence === 'exact') {
          matched++;
        } else if (confidence === 'fuzzy') {
          fuzzyMatched++;
        } else {
          unmatched++;
        }
      } catch (e: any) {
        errors.push(`Responder ${resp.id}: ${e?.message ?? String(e)}`);
      }
    }

    const result: Record<string, unknown> = {
      ok: true,
      matched,
      fuzzyMatched,
      unmatched,
      total: responders.length,
      errors: errors.slice(0, 20),
    };
    if (debug && diagnostics.length) result.diagnostics = diagnostics;

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[match-responders]', err);
    return res.status(500).json({ error: err?.message ?? 'Internal server error' });
  }
}
