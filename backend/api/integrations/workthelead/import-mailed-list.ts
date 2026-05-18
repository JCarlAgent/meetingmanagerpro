/**
 * POST /api/integrations/workthelead/import-mailed-list
 *
 * Master-admin only. Accepts one chunk of CSV rows at a time.
 * The client splits the full CSV into chunks of ~200 rows and sends them
 * sequentially, keeping each JSON payload ~40–60 KB — well under Vercel limits.
 *
 * Body: {
 *   jobId:        string   — campaign/job ID
 *   csv:          string   — raw CSV rows for this chunk (no header row)
 *   chunkIndex:   number   — 0-based index of this chunk
 *   totalChunks:  number   — total number of chunks being sent
 *   isTestRun?:   boolean  — if true, do NOT delete existing records (read-only test)
 *   validateOnly?: boolean — if true, parse first row and return preview — NO insert
 * }
 *
 * Chunk 0 + !isTestRun + !validateOnly → DELETE existing records for jobId first, then INSERT.
 * All other chunks                     → INSERT only.
 * validateOnly                         → parse first row, return column mapping preview, no DB write.
 *
 * Returns: { ok, step, inserted, skipped, parsed, total, errors[], sampleRow }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUserIdFromAuthHeader, getSupabaseAdmin } from '../../_lib/supabaseAdmin';

// Each chunk is ~200 rows × ~200 bytes ≈ 40 KB raw → ~50 KB JSON-encoded.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

// ── Column mapping (0-indexed) from AccuLeads / 11240729_lay.txt ─────────────
//
//  Index  Layout col  Field
//  ─────  ──────────  ─────
//    0        1       Prefixtitle       → prefix_title
//    1        2       Individualname    → individual_name
//    2        3       Firstname         → first_name
//    3        4       Middle initial    (skipped)
//    4        5       Lastname          → last_name
//    5        6       Address           → address
//    6        7       (secondary addr)  (skipped)
//    7        8       City              → city
//    8        9       State             → state
//    9       10       Zip               → zip
//   15       16       CLARITAS_IPA      → claritas_ipa
//   17       18       AGE_BAND          → age_band
//   30       31       EST_INCOME_CODE   → est_income_code
//   32       33       EST_INCOME_RANGE  → est_income_range

const COL_PREFIX_TITLE     = 0;
const COL_INDIVIDUAL_NAME  = 1;
const COL_FIRST_NAME       = 2;
const COL_LAST_NAME        = 4;
const COL_ADDRESS          = 5;
const COL_CITY             = 7;
const COL_STATE            = 8;
const COL_ZIP              = 9;
const COL_CLARITAS_IPA     = 15;
const COL_AGE_BAND         = 17;
const COL_EST_INCOME_CODE  = 30;
const COL_EST_INCOME_RANGE = 32;

/**
 * RFC-4180-compatible CSV line parser.
 * Handles: quoted fields, escaped double-quotes (""), commas inside quotes.
 * Example input: "MS.","GRACIELA L VELAZCO","GRACIELA","L","VELAZCO",...
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped double-quote inside a quoted field
        current += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
    i++;
  }
  result.push(current.trim());
  return result;
}

/** Return column value or null if missing/empty. */
function col(fields: string[], idx: number): string | null {
  const v = fields[idx];
  return (v === undefined || v === '' || v === null) ? null : v;
}

/** Map a parsed fields array to a DB insert row. */
function mapRow(fields: string[], jobId: string): Record<string, string | null> {
  return {
    campaign_id:      jobId,
    prefix_title:     col(fields, COL_PREFIX_TITLE),
    individual_name:  col(fields, COL_INDIVIDUAL_NAME),
    first_name:       col(fields, COL_FIRST_NAME),
    last_name:        col(fields, COL_LAST_NAME),
    address:          col(fields, COL_ADDRESS),
    city:             col(fields, COL_CITY),
    state:            col(fields, COL_STATE),
    zip:              col(fields, COL_ZIP),
    claritas_ipa:     col(fields, COL_CLARITAS_IPA),
    age_band:         col(fields, COL_AGE_BAND),
    est_income_code:  col(fields, COL_EST_INCOME_CODE),
    est_income_range: col(fields, COL_EST_INCOME_RANGE),
  };
}

// 200 rows per Supabase call — keeps each RPC response small and well within timeouts.
const BATCH_SIZE = 200;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // NOTE: supabaseAdmin is created INSIDE the handler (not at module level) so
  // any missing env-var error is caught by the try/catch and returned as JSON
  // rather than crashing the module at cold-start (FUNCTION_INVOCATION_FAILED).
  let step = 'init';
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, step, error: 'Method not allowed' });
    }

    // ── Initialise Supabase admin client (lazy — inside handler) ─────────────
    step = 'init-supabase';
    const supabaseAdmin = getSupabaseAdmin();

    // ── Auth ──────────────────────────────────────────────────────────────────
    step = 'auth';
    const userId = await requireUserIdFromAuthHeader(req);

    step = 'admin-check';
    const { data: adminRow, error: adminErr } = await supabaseAdmin
      .from('master_admins').select('user_id').eq('user_id', userId).maybeSingle();
    if (adminErr) {
      return res.status(500).json({ ok: false, step, error: `Admin check DB error: ${adminErr.message}`, supabaseCode: adminErr.code });
    }
    if (!adminRow) return res.status(403).json({ ok: false, step, error: 'Master admin required' });

    // ── Parse request body ────────────────────────────────────────────────────
    step = 'parse-request';
    const body = req.body as {
      jobId?: string;
      csv?: string;
      chunkIndex?: number;
      totalChunks?: number;
      isTestRun?: boolean;
      validateOnly?: boolean;
    } | null;

    if (!body || typeof body !== 'object') {
      return res.status(400).json({
        ok: false, step,
        error: `Expected JSON body. Received: ${typeof body} — ${JSON.stringify(body)?.slice(0, 200)}`,
      });
    }

    const jobId = (body.jobId ?? '').trim();
    if (!jobId) return res.status(400).json({ ok: false, step, error: 'jobId is required' });

    const csv = (body.csv ?? '').trim();
    if (!csv) return res.status(400).json({ ok: false, step, error: 'csv field is required and must not be empty' });

    const chunkIndex   = typeof body.chunkIndex  === 'number' ? body.chunkIndex  : 0;
    const totalChunks  = typeof body.totalChunks === 'number' ? body.totalChunks : 1;
    const isTestRun    = body.isTestRun    === true;
    const validateOnly = body.validateOnly === true;

    // ── Parse CSV rows ────────────────────────────────────────────────────────
    step = 'parse-csv';
    const allLines = csv.split('\n').map(l => l.replace(/\r$/, ''));
    const records: Record<string, string | null>[] = [];
    const parseErrors: string[] = [];
    let skipped = 0;

    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i].trim();
      if (!line) { skipped++; continue; }
      try {
        const fields = parseCsvLine(line);
        const row = mapRow(fields, jobId);
        if (!row.last_name && !row.first_name) { skipped++; continue; }
        records.push(row);
      } catch (e: any) {
        parseErrors.push(`Line ${i + 1}: ${e?.message ?? String(e)}`);
      }
    }

    // ── Validate-only mode: return first row preview, no DB write ─────────────
    if (validateOnly) {
      const firstRow = records[0] ?? null;
      const rawFirstLine = allLines.find(l => l.trim()) ?? '';
      const rawFields = rawFirstLine ? parseCsvLine(rawFirstLine) : [];
      return res.status(200).json({
        ok: true,
        step: 'validate-only',
        parsed: records.length,
        skipped,
        rawFieldCount: rawFields.length,
        firstRowMapped: firstRow,
        rawFirstLine: rawFirstLine.slice(0, 300),
        parseErrors: parseErrors.slice(0, 5),
      });
    }

    // ── Clear existing records (first chunk of a full run only) ──────────────
    if (chunkIndex === 0 && !isTestRun) {
      step = 'clear-existing';
      const { error: delErr } = await supabaseAdmin
        .from('campaign_mailed_list_records').delete().eq('campaign_id', jobId);
      if (delErr) {
        return res.status(500).json({
          ok: false, step,
          error: `Failed to clear existing records: ${delErr.message}`,
          supabaseCode: delErr.code,
          hint: delErr.hint,
        });
      }
    }

    // ── Batch insert ──────────────────────────────────────────────────────────
    step = 'insert-batches';
    let inserted = 0;
    const batchErrors: string[] = [];
    const batchCount = Math.ceil(records.length / BATCH_SIZE);

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      step = `insert-batch-${batchNum}-of-${batchCount}`;
      const batch = records.slice(i, i + BATCH_SIZE);
      const { error: insErr } = await supabaseAdmin
        .from('campaign_mailed_list_records').insert(batch);
      if (insErr) {
        // Return immediately on first insert error with full diagnostics
        const firstRow = batch[0];
        return res.status(500).json({
          ok: false,
          step,
          error: `Insert batch ${batchNum} failed: ${insErr.message}`,
          supabaseCode: insErr.code,
          hint: insErr.hint ?? null,
          detail: insErr.details ?? null,
          firstRowKeys: firstRow ? Object.keys(firstRow) : [],
          firstRowPreview: firstRow ? {
            campaign_id:  firstRow.campaign_id,
            first_name:   firstRow.first_name,
            last_name:    firstRow.last_name,
            address:      firstRow.address,
            zip:          firstRow.zip,
            age_band:     firstRow.age_band,
            claritas_ipa: firstRow.claritas_ipa,
            est_income_range: firstRow.est_income_range,
          } : null,
        });
      }
      inserted += batch.length;
    }

    // ── Done ──────────────────────────────────────────────────────────────────
    step = 'done';
    const allErrors = [...parseErrors, ...batchErrors];
    const firstRow = records[0] ?? null;
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
      errors: allErrors.slice(0, 20),
      sampleRow: firstRow ? {
        first_name:      firstRow.first_name,
        last_name:       firstRow.last_name,
        address:         firstRow.address,
        zip:             firstRow.zip,
        age_band:        firstRow.age_band,
        claritas_ipa:    firstRow.claritas_ipa,
        est_income_range: firstRow.est_income_range,
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

