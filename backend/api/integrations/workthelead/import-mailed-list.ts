/**
 * POST /api/integrations/workthelead/import-mailed-list?jobId=<id>
 *
 * Master-admin only.
 * Accepts the raw CSV as a text/plain body (no headers).
 * jobId is passed as a query-string parameter so the body can be raw text.
 *
 * Body reading strategy (in order):
 *   1. req.body is already a Buffer   → decode UTF-8
 *   2. req.body is already a string   → use directly
 *   3. req.body is an object          → should not happen, but stringify
 *   4. Stream fallback via req.on()   → for runtimes that don't pre-buffer
 *
 * Returns: { ok, step, inserted, skipped, errors[], total }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUserIdFromAuthHeader } from '../../_lib/supabaseAdmin';
import { createClient } from '@supabase/supabase-js';

// bodyParser:false tells Vercel NOT to JSON-parse the body.
// In Vercel's Lambda runtime the body is pre-buffered; req.body will be a
// Buffer when bodyParser is disabled. The stream fallback is kept for safety.
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

/**
 * Read the request body as a UTF-8 string.
 * Handles all three scenarios present in Vercel's Lambda runtime:
 *   - req.body = Buffer  (bodyParser:false, most common in Lambda)
 *   - req.body = string  (text/plain parsed by some runtimes)
 *   - streaming fallback (edge cases / local dev)
 */
function readBody(req: VercelRequest): Promise<string> {
  // Fast path: Vercel Lambda pre-buffers the body
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) {
      return Promise.resolve((req.body as Buffer).toString('utf8'));
    }
    if (typeof req.body === 'string') {
      return Promise.resolve(req.body as string);
    }
    // Unexpected parse (e.g. auto-parsed JSON despite bodyParser:false)
    if (typeof req.body === 'object') {
      return Promise.reject(
        new Error(
          `Body was unexpectedly pre-parsed as an object. ` +
          `Keys: ${Object.keys(req.body as object).slice(0, 5).join(', ')}. ` +
          `This means bodyParser:false is not taking effect. ` +
          `Try removing the config export.`
        )
      );
    }
  }

  // Stream fallback — for runtimes that don't pre-buffer
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const onData = (chunk: unknown) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    };
    const onEnd  = () => resolve(Buffer.concat(chunks).toString('utf8'));
    const onErr  = (err: Error) => reject(err);
    req.on('data', onData);
    req.on('end',  onEnd);
    req.on('error', onErr);
    // Safety timeout — if the stream never resolves, reject after 25s
    setTimeout(() => {
      req.off('data', onData);
      req.off('end',  onEnd);
      req.off('error', onErr);
      if (chunks.length === 0) {
        reject(new Error('Body stream timed out with no data received. req.body was undefined/null.'));
      } else {
        resolve(Buffer.concat(chunks).toString('utf8'));
      }
    }, 25_000);
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

const BATCH_SIZE = 200; // Smaller batches to stay within Supabase payload limits

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Always return JSON — never let Vercel produce FUNCTION_INVOCATION_FAILED
  let step = 'init';
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, step, error: 'Method not allowed' });
    }

    step = 'auth';
    const userId = await requireUserIdFromAuthHeader(req);

    step = 'admin-check';
    const { data: adminRow, error: adminErr } = await supabaseAdmin
      .from('master_admins').select('user_id').eq('user_id', userId).maybeSingle();
    if (adminErr) throw new Error(`Admin check DB error: ${adminErr.message}`);
    if (!adminRow) return res.status(403).json({ ok: false, step, error: 'Master admin required' });

    step = 'read-jobId';
    const jobId = (req.query?.jobId as string | undefined)?.trim();
    if (!jobId) return res.status(400).json({ ok: false, step, error: 'jobId query parameter is required' });

    step = 'read-body';
    const csv = await readBody(req);
    if (!csv || csv.trim() === '') {
      return res.status(400).json({ ok: false, step, error: 'Request body (CSV) is empty' });
    }

    step = 'parse-csv';
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

    step = 'clear-existing';
    const { error: delErr } = await supabaseAdmin
      .from('campaign_mailed_list_records').delete().eq('campaign_id', jobId);
    if (delErr) throw new Error(`Failed to clear existing records: ${delErr.message}`);

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
    return res.status(200).json({
      ok: true,
      step,
      inserted,
      skipped,
      total: lines.length,
      parsed: records.length,
      errors: errors.slice(0, 20),
    });

  } catch (err: any) {
    const message = err?.message ?? String(err);
    const stack   = (err?.stack ?? '').split('\n')[1]?.trim() ?? '';
    console.error(`[import-mailed-list] CRASH at step=${step}:`, err);
    return res.status(500).json({
      ok: false,
      step,
      error: message,
      stackFirstLine: stack,
    });
  }
}


