/**
 * POST /api/integrations/workthelead/match-responders
 *
 * Master-admin only.
 * For each responder in a campaign, attempts to find a matching record
 * in `campaign_mailed_list_records` and enriches the responder with
 * age/income/IPA demographic data.
 *
 * Matching strategy (in order):
 *   1. Exact:  normalize(first_name) + normalize(last_name) + zip
 *   2. Fuzzy:  normalize(last_name) + first word of address (street number)
 *   3. None:   no match found → matched_to_mail_list = false
 *
 * Normalize: lowercase, trim, strip non-alpha (for names); lowercase+trim for zip.
 *
 * Body: { jobId: string }
 * Returns: { ok, matched, fuzzyMatched, unmatched, total, errors[] }
 */

import { requireUserIdFromAuthHeader, getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { decodeIPA, decodeIncome } from '../../_lib/acxiomDecoders.js';

function normName(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().trim().replace(/[^a-z]/g, '');
}

function normZip(s: string | null | undefined): string {
  return (s ?? '').trim().slice(0, 5);
}

function addrKey(s: string | null | undefined): string {
  // First token (street number) of address
  return (s ?? '').trim().split(/\s+/)[0].toLowerCase();
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

    const { jobId, responderId } = req.body as { jobId?: string; responderId?: string };
    if (!jobId) return res.status(400).json({ error: 'jobId is required' });

    // Fetch all mailed list records for this campaign
    const { data: mailRecords, error: mailErr } = await supabaseAdmin
      .from('campaign_mailed_list_records')
      .select('id, first_name, last_name, address, zip, claritas_ipa, age_band, est_income_code, est_income_range')
      .eq('campaign_id', jobId);

    if (mailErr) throw mailErr;
    if (!mailRecords?.length) {
      return res.status(400).json({ error: 'No mailed list records found for this campaign. Import the CSV first.' });
    }

    // Build lookup indices (used for both full-campaign and single-responder modes)
    const exactIndex = new Map<string, typeof mailRecords[number]>();
    const fuzzyIndex = new Map<string, typeof mailRecords[number]>();
    for (const mr of mailRecords) {
      const eKey = `${normName(mr.first_name)}|${normName(mr.last_name)}|${normZip(mr.zip)}`;
      if (!exactIndex.has(eKey)) exactIndex.set(eKey, mr);
      const fKey = `${normName(mr.last_name)}|${addrKey(mr.address)}`;
      if (!fuzzyIndex.has(fKey)) fuzzyIndex.set(fKey, mr);
    }

    // ── Single-responder mode (re-match one responder after edit) ─────────────
    if (responderId) {
      const { data: singleResp, error: singleErr } = await supabaseAdmin
        .from('responders')
        .select('id, first_name, last_name, address, zip')
        .eq('id', responderId)
        .maybeSingle();
      if (singleErr) throw singleErr;
      if (!singleResp) return res.status(200).json({ ok: true, matched: 0, fuzzyMatched: 0, unmatched: 0, total: 0, errors: [] });

      const eKey = `${normName(singleResp.first_name)}|${normName(singleResp.last_name)}|${normZip(singleResp.zip)}`;
      const fKey = `${normName(singleResp.last_name)}|${addrKey(singleResp.address)}`;
      let mr = exactIndex.get(eKey);
      let confidence: 'exact' | 'fuzzy' | 'none' = mr ? 'exact' : 'none';
      if (!mr) { mr = fuzzyIndex.get(fKey); if (mr) confidence = 'fuzzy'; }
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
    // Fetch all responders for this campaign
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

    for (const resp of responders) {
      try {
        const eKey = `${normName(resp.first_name)}|${normName(resp.last_name)}|${normZip(resp.zip)}`;
        const fKey = `${normName(resp.last_name)}|${addrKey(resp.address)}`;

        let mr = exactIndex.get(eKey);
        let confidence: 'exact' | 'fuzzy' | 'none' = mr ? 'exact' : 'none';

        if (!mr) {
          mr = fuzzyIndex.get(fKey);
          if (mr) confidence = 'fuzzy';
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

    return res.status(200).json({
      ok: true,
      matched,
      fuzzyMatched,
      unmatched,
      total: responders.length,
      errors: errors.slice(0, 20),
    });
  } catch (err: any) {
    console.error('[match-responders]', err);
    return res.status(500).json({ error: err?.message ?? 'Internal server error' });
  }
}
