/**
 * POST /api/integrations/workthelead/import-mailed-list
 *
 * Master-admin only. Accepts one chunk of CSV rows at a time.
 * The client splits the full CSV into chunks of ~200 rows and sends them
 * sequentially, keeping each JSON payload ~40–60 KB — well under Vercel limits.
 *
 * Body: {
 *   jobId:       string   — campaign/job ID
 *   csv:         string   — raw CSV rows for this chunk (no header row)
 *   chunkIndex:  number   — 0-based index of this chunk
 *   totalChunks: number   — total number of chunks being sent
 *   isTestRun?:  boolean  — if true, do NOT delete existing records (read-only test)
 * }
 *
 * Chunk 0 + !isTestRun → DELETE existing records for jobId first, then INSERT.
 * All other chunks     → INSERT only.
 *
 * Returns: { ok, step, inserted, skipped, parsed, total, errors[], sampleRow }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUserIdFromAuthHeader } from '../../_lib/supabaseAdmin';
import { createClient } from '@supabase/supabase-js';

// Each chunk is ~200 rows × ~200 bytes ≈ 40 KB raw → ~50 KB JSON-encoded.
// sizeLimit:'1mb' is more than enough; keeping 5mb as a safety margin.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Column mapping (0-indexed) from 11240729_lay.txt ──────────────────────────
const COL_PREFIX_TITLE    = 0;   // layout col  1
const COL_INDIVIDUAL_NAME = 1;   // layout col  2
const COL_FIRST_NAME      = 2;   // layout col  3
const COL_LAST_NAME       = 4;   // layout col  5
const COL_ADDRESS         = 5;   // layout col  6
const COL_CITY            = 7;   // layout col  8
const COL_STATE           = 8;   // layout col  9
const COL_ZIP             = 9;   // layout col 10
const COL_CLARITAS_IPA    = 15;  // layout col 16
const COL_AGE_BAND        = 17;  // layout col 18
const COL_EST_INCOME_CODE = 30;  // layout col 31
const COL_EST_INCOME_RANGE = 32; // layout col 33

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

// 1,000 rows per Supabase call ≈ 12 calls for 11k rows ≈ 2–4 s total
const BATCH_SIZE = 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  let step = 'init';
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, step, error: 'Method not allowed' });
    }

    // ── Auth ──────────────────────────────────────────────────────────────────
    step = 'auth';
    const userId = await requireUserIdFromAuthHeader(req);

    step = 'admin-check';
    const { data: adminRow, error: adminErr } = await supabaseAdmin
      .from('master_admins').select('user_id').eq('user_id', userId).maybeSingle();
    if (adminErr) throw new Error(`Admin check DB error: ${adminErr.message}`);
    if (!adminRow) return res.status(403).json({ ok: false, step, error: 'Master admin required' });

    // ── Parse request ─────────────────────────────────────────────────────────
    step = 'parse-request';
    const body = req.body as {
      jobId?: string;
      csv?: string;
      chunkIndex?: number;
      totalChunks?: number;
      isTestRun?: boolean;
    } | null;

    if (!body || typeof body !== 'object') {
      return res.status(400).json({ ok: false, step,
        error: `Expected JSON body object. Received type: ${typeof body}. ` +
               `Raw value: ${JSON.stringify(body)?.slice(0, 200)}`,
      });
    }

    const jobId = (body.jobId ?? '').trim();
    if (!jobId) return res.status(400).json({ ok: false, step, error: 'jobId is required in request body' });

    const csv = body.csv ?? '';
    if (!csv || csv.trim() === '') {
      return res.status(400).json({ ok: false, step, error: 'csv field is required and must not be empty' });
    }

    const chunkIndex  = typeof body.chunkIndex  === 'number' ? body.chunkIndex  : 0;
    const totalChunks = typeof body.totalChunks === 'number' ? body.totalChunks : 1;
    const isTestRun   = body.isTestRun === true;

    // ── Parse CSV rows ────────────────────────────────────────────────────────
    step = 'parse-csv';
    const allLines = csv.split('\n').map(l => l.replace(/\r$/, ''));

    const records: object[] = [];
    const errors: string[] = [];
    let skipped = 0;

    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i].trim();
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

    // ── Clear existing records (first chunk of a full run only) ──────────────
    // chunkIndex === 0 && !isTestRun: wipe old data before inserting the first chunk.
    // Subsequent chunks (chunkIndex > 0) skip this — data is already cleared.
    if (chunkIndex === 0 && !isTestRun) {
      step = 'clear-existing';
      const { error: delErr } = await supabaseAdmin
        .from('campaign_mailed_list_records').delete().eq('campaign_id', jobId);
      if (delErr) throw new Error(`Failed to clear existing records: ${delErr.message}`);
    }

    // ── Batch insert ──────────────────────────────────────────────────────────
    step = 'insert-batches';
    let inserted = 0;
    const batchCount = Math.ceil(records.length / BATCH_SIZE);
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      step = `insert-batch-${batchNum}-of-${batchCount}`;
      const batch = records.slice(i, i + BATCH_SIZE);
      const { error: insErr } = await supabaseAdmin
        .from('campaign_mailed_list_records').insert(batch);
      if (insErr) {
        errors.push(`Batch ${batchNum}: ${insErr.message}`);
      } else {
        inserted += batch.length;
      }
    }

    step = 'done';
    const firstRow = records[0] as Record<string, unknown> | undefined;
    return res.status(200).json({
      ok: true,
      step,
      inserted,
      skipped,
      parsed: records.length,
      total: allLines.length,
      chunkIndex,
      totalChunks,
      isTestRun,
      errors: errors.slice(0, 20),
      // First parsed row helps verify column mapping
      sampleRow: firstRow ? {
        first_name:   firstRow.first_name,
        last_name:    firstRow.last_name,
        address:      firstRow.address,
        zip:          firstRow.zip,
        age_band:     firstRow.age_band,
        claritas_ipa: firstRow.claritas_ipa,
      } : null,
    });

  } catch (err: any) {
    const message    = err?.message ?? String(err);
    const stackFirst = (err?.stack ?? '').split('\n').find((l: string) => l.trim().startsWith('at')) ?? '';
    console.error(`[import-mailed-list] CRASH at step=${step}:`, err);
    return res.status(500).json({
      ok: false,
      step,
      error: message,
      stackFirstLine: stackFirst,
    });
  }
}

