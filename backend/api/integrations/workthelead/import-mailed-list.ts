/**
 * POST /api/integrations/workthelead/import-mailed-list?jobId=<id>
 *
 * Master-admin only.
 * Accepts the raw CSV as a text/plain body (no headers).
 * jobId is passed as a query-string parameter to avoid JSON body size limits.
 *
 * NOTE: bodyParser is disabled so we can receive large files (>1 MB) as a
 * raw stream. The @vercel/node bodyParser config shim only works in Next.js;
 * for plain Vercel functions we must stream manually.
 *
 * Returns: { ok, inserted, skipped, errors[], total }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUserIdFromAuthHeader } from '../../_lib/supabaseAdmin';
import { createClient } from '@supabase/supabase-js';

// Disable built-in body parser so we can stream the raw text body ourselves.
export const config = {
  api: {
    bodyParser: false,
  },
};

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Column mapping (0-indexed) from 11240729_lay.txt ──────────────────────────
const COL_PREFIX_TITLE    = 0;
const COL_INDIVIDUAL_NAME = 1;
const COL_FIRST_NAME      = 2;
const COL_LAST_NAME       = 4;
const COL_ADDRESS         = 5;
const COL_CITY            = 7;
const COL_STATE           = 8;
const COL_ZIP             = 9;
const COL_CLARITAS_IPA    = 15;
const COL_AGE_BAND        = 17;
const COL_EST_INCOME_CODE = 30;
const COL_EST_INCOME_RANGE = 32;

/** Read the full request body as a UTF-8 string. */
function readBody(req: VercelRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Minimal quoted-CSV parser — handles commas inside double-quoted fields. */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim()); current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function col(fields: string[], idx: number): string | null {
  const v = fields[idx];
  return (v === undefined || v === '') ? null : v;
}

const BATCH_SIZE = 500;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const userId = await requireUserIdFromAuthHeader(req);

    const { data: adminRow } = await supabaseAdmin
      .from('master_admins').select('user_id').eq('user_id', userId).maybeSingle();
    if (!adminRow) return res.status(403).json({ error: 'Master admin required' });

    // jobId comes from query string; CSV body arrives as plain text
    const jobId = (req.query?.jobId as string | undefined)?.trim();
    if (!jobId) return res.status(400).json({ error: 'jobId query parameter is required' });

    const csv = await readBody(req);
    if (!csv || csv.trim() === '')
      return res.status(400).json({ error: 'Request body (CSV) is empty' });

    // Clear existing records before re-import (idempotent)
    await supabaseAdmin
      .from('campaign_mailed_list_records').delete().eq('campaign_id', jobId);

    const lines = csv.split('\n').map(l => l.replace(/\r$/, ''));
    const records: object[] = [];
    const errors: string[] = [];
    let skipped = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) { skipped++; continue; }
      try {
        const fields = parseCsvLine(line);
        const lastName  = col(fields, COL_LAST_NAME);
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

    let inserted = 0;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const { error } = await supabaseAdmin
        .from('campaign_mailed_list_records').insert(batch);
      if (error) {
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
      } else {
        inserted += batch.length;
      }
    }

    return res.status(200).json({ ok: true, inserted, skipped, total: lines.length, errors: errors.slice(0, 20) });
  } catch (err: any) {
    console.error('[import-mailed-list]', err);
    return res.status(500).json({ error: err?.message ?? 'Internal server error' });
  }
}

