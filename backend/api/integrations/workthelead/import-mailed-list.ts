/**
 * POST /api/integrations/workthelead/import-mailed-list
 *
 * Master-admin only.
 * Accepts a raw CSV string (no headers) from the client's mailed/purchased list.
 * Parses using the fixed column layout (11240729_lay.txt) and bulk-inserts
 * into `campaign_mailed_list_records`.
 *
 * Body: { jobId: string; csv: string }
 * Returns: { ok, inserted, skipped, errors[], total }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUserIdFromAuthHeader } from '../../_lib/supabaseAdmin';
import { createClient } from '@supabase/supabase-js';

// Increase body size limit — default 1 MB is too small for 10k+ row CSVs
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Column mapping (0-indexed) from 11240729_lay.txt ──────────────────────────
const COL_PREFIX_TITLE    = 0;   // 1  Prefixtitle
const COL_INDIVIDUAL_NAME = 1;   // 2  Individualname
const COL_FIRST_NAME      = 2;   // 3  Firstname
// col 4 = col 4 in 0-indexed (layout col 5 = Lastname)
const COL_LAST_NAME       = 4;   // 5  Lastname
const COL_ADDRESS         = 5;   // 6  Address
// col 6 = col 6 (layout 7, unused)
const COL_CITY            = 7;   // 8  City
const COL_STATE           = 8;   // 9  State
const COL_ZIP             = 9;   // 10 Zip
const COL_CLARITAS_IPA    = 15;  // 16 CLARITAS_IPA
const COL_AGE_BAND        = 17;  // 18 AGE_BAND
const COL_EST_INCOME_CODE = 30;  // 31 EST_INCOME_CODE
const COL_EST_INCOME_RANGE = 32; // 33 EST_INCOME_NARROW_RANGE

/** Minimal quoted-CSV parser — handles commas inside double-quoted fields. */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function col(fields: string[], idx: number): string | null {
  const v = fields[idx];
  if (v === undefined || v === '') return null;
  return v;
}

const BATCH_SIZE = 500;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const userId = await requireUserIdFromAuthHeader(req);

    // Master admin check
    const { data: adminRow } = await supabaseAdmin
      .from('master_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!adminRow) return res.status(403).json({ error: 'Master admin required' });

    const { jobId, csv } = req.body as { jobId?: string; csv?: string };
    if (!jobId) return res.status(400).json({ error: 'jobId is required' });
    if (!csv || typeof csv !== 'string' || csv.trim() === '')
      return res.status(400).json({ error: 'csv is required' });

    // Clear any existing records for this campaign before re-import
    await supabaseAdmin
      .from('campaign_mailed_list_records')
      .delete()
      .eq('campaign_id', jobId);

    const lines = csv.split('\n').map(l => l.replace(/\r$/, ''));
    const records: object[] = [];
    const errors: string[] = [];
    let skipped = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) { skipped++; continue; }
      try {
        const fields = parseCsvLine(line);
        const lastName = col(fields, COL_LAST_NAME);
        const firstName = col(fields, COL_FIRST_NAME);
        if (!lastName && !firstName) { skipped++; continue; }
        records.push({
          campaign_id:      jobId,
          prefix_title:     col(fields, COL_PREFIX_TITLE),
          individual_name:  col(fields, COL_INDIVIDUAL_NAME),
          first_name:       firstName,
          last_name:        lastName,
          address:          col(fields, COL_ADDRESS),
          city:             col(fields, COL_CITY),
          state:            col(fields, COL_STATE),
          zip:              col(fields, COL_ZIP),
          claritas_ipa:     col(fields, COL_CLARITAS_IPA),
          age_band:         col(fields, COL_AGE_BAND),
          est_income_code:  col(fields, COL_EST_INCOME_CODE),
          est_income_range: col(fields, COL_EST_INCOME_RANGE),
        });
      } catch (e: any) {
        errors.push(`Line ${i + 1}: ${e?.message ?? String(e)}`);
      }
    }

    // Batch insert
    let inserted = 0;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const { error } = await supabaseAdmin
        .from('campaign_mailed_list_records')
        .insert(batch);
      if (error) {
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1} error: ${error.message}`);
      } else {
        inserted += batch.length;
      }
    }

    return res.status(200).json({
      ok: true,
      inserted,
      skipped,
      total: lines.length,
      errors: errors.slice(0, 20),
    });
  } catch (err: any) {
    console.error('[import-mailed-list]', err);
    return res.status(500).json({ error: err?.message ?? 'Internal server error' });
  }
}
