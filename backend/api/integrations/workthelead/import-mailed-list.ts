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

import { requireUserIdFromAuthHeader, getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';

// Each chunk is ~200 rows × ~200 bytes ≈ 40 KB raw → ~50 KB JSON-encoded.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

// ── Column mapping (0-indexed) from AccuLeads / 11240729_lay.txt ─────────────
// Used as the legacy POSITION-BASED fallback when no header row is detected.
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

// ── Header-based column mapping (cleaned CSV with explicit headers) ───────────
// Maps normalized header name → DB column name.
// Normalized: lowercase, all non-alphanumeric chars (except _) stripped.
const HEADER_TO_COL: Record<string, string> = {
  // Name fields
  full_name:               'full_name',
  fullname:                'full_name',
  firstname:               'first_name',
  first_name:              'first_name',
  lastname:                'last_name',
  last_name:               'last_name',
  // Address fields
  address:                 'address',
  address2line:            'address2',
  address2:                'address2',
  city:                    'city',
  state:                   'state',
  zip:                     'zip',
  zip5:                    'zip',
  zip4:                    'zip4',
  // Demographics
  claritas_ipa:            'claritas_ipa',
  claritas_ipa_code:       'claritas_ipa',    // actual header in cleaned CSV
  est_income_code:         'est_income_code',
  est_income_narrow_range: 'est_income_range',
  est_income_range:        'est_income_range',
  gender_code:             'gender_code',
  homeowner_flag1:         'homeowner_flag1',
  length_residence:        'length_residence',
  length_residence_years:  'length_residence', // actual header in cleaned CSV
  marital_status:          'marital_status',
  veh1_make_desc:          'veh1_make_desc',
  veh1_model_desc:         'veh1_model_desc',
  veh2_make_desc:          'veh2_make_desc',
  veh2_model_desc:         'veh2_model_desc',
};

/**
 * Parse a header CSV line into an ordered list of DB column names.
 * Returns null for unrecognized columns (they are skipped during insert).
 */
function parseHeaderRow(headerLine: string): (string | null)[] {
  return parseCsvLine(headerLine).map(h => {
    const norm = h.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
    return HEADER_TO_COL[norm] ?? null;
  });
}

/**
 * Detect whether a CSV line is a header row.
 * A line is considered a header if its parsed fields — when normalized —
 * contain BOTH a first-name token AND a last-name token AND a zip token.
 * This is field-order-independent (full_name may precede firstname, etc.).
 */
function isHeaderRow(line: string): boolean {
  const fields = parseCsvLine(line).map(f => f.toLowerCase().trim().replace(/[^a-z0-9_]/g, ''));
  const hasFirst = fields.some(f => f === 'firstname' || f === 'first_name');
  const hasLast  = fields.some(f => f === 'lastname'  || f === 'last_name');
  const hasZip   = fields.some(f => f === 'zip' || f === 'zip5');
  return hasFirst && hasLast && hasZip;
}

/**
 * Map a data row to a DB insert row using header-derived column positions.
 * Normalizes zip to 5 digits. Computes full_name.
 */
function mapRowFromHeaders(
  fields: string[],
  colNames: (string | null)[],
  jobId: string,
): Record<string, string | null> {
  const row: Record<string, string | null> = { campaign_id: jobId };
  for (let i = 0; i < colNames.length; i++) {
    const dbCol = colNames[i];
    if (!dbCol) continue;
    const v = fields[i];
    row[dbCol] = (v === undefined || v.trim() === '') ? null : v.trim();
  }
  // Normalize zip to 5 digits (strip non-digits, take first 5)
  if (row.zip) {
    const digits = row.zip.replace(/\D/g, '');
    row.zip = digits.slice(0, 5) || row.zip.slice(0, 5) || null;
  }
  // Compute full_name from first_name + last_name
  row.full_name = [row.first_name ?? '', row.last_name ?? ''].filter(Boolean).join(' ') || null;
  return row;
}

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

/** Map a parsed fields array to a DB insert row (legacy position-based). */
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

export default async function handler(req: any, res: any) {
  // ?health=1 — no auth, no Supabase, confirms the function loads and env vars are present
  if (req.query?.health === '1') {
    return res.status(200).json({
      ok: true,
      route: 'import-mailed-list',
      env: {
        hasSupabaseUrl:    !!process.env.SUPABASE_URL,
        hasServiceRole:    !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
  }

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
      headerRow?: string;   // optional: first CSV line with column headers
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

    // Resolve headerRow: prefer the explicitly-passed value, then auto-detect
    // from the first non-empty line of the csv payload using isHeaderRow().
    // isHeaderRow() is field-order-independent: it scans ALL fields for
    // firstname + lastname + zip tokens, so it works even when full_name is col 0.
    let headerRowRaw = typeof body.headerRow === 'string' ? body.headerRow.trim() : null;
    let autoDetected = false;
    if (!headerRowRaw) {
      const firstLine = csv.split('\n').find(l => l.trim());
      if (firstLine && isHeaderRow(firstLine)) {
        headerRowRaw = firstLine.trim();
        autoDetected = true;
      }
    }

    // If a header row was resolved, parse its column positions once.
    // All data rows in this chunk will be mapped by those positions.
    const colNames: (string | null)[] | null = headerRowRaw ? parseHeaderRow(headerRowRaw) : null;
    const importMode = colNames ? 'header-based' : 'position-based';

    // Build debug info for the validateOnly response
    const headerDebug = headerRowRaw ? {
      headerRowRaw,
      autoDetected,
      parsedHeaders: parseCsvLine(headerRowRaw).map(h => h.trim()),
      normalizedHeaders: parseCsvLine(headerRowRaw).map(h => h.toLowerCase().trim().replace(/[^a-z0-9_]/g, '')),
      colNames: colNames?.map((c, i) => ({ pos: i, dbCol: c ?? '(unmapped)' })),
    } : {
      headerRowRaw: null,
      autoDetected: false,
      reason: 'isHeaderRow() returned false — row does not contain firstname+lastname+zip tokens',
      firstLineNormalized: csv.split('\n').find(l => l.trim())
        ? parseCsvLine(csv.split('\n').find(l => l.trim())!)
            .map(h => h.toLowerCase().trim().replace(/[^a-z0-9_]/g, ''))
        : [],
    };

    // ── Parse CSV rows ────────────────────────────────────────────────────────
    step = 'parse-csv';
    // In header-based mode the first line is the header — skip it when it was
    // auto-detected server-side (client already stripped it when it passes headerRow).
    const rawLines = csv.split('\n').map(l => l.replace(/\r$/, ''));
    const allLines = (autoDetected && headerRowRaw)
      ? rawLines.slice(1)   // drop the header line we consumed
      : rawLines;
    const records: Record<string, string | null>[] = [];
    const parseErrors: string[] = [];
    let skipped = 0;

    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i].trim();
      if (!line) { skipped++; continue; }
      try {
        const fields = parseCsvLine(line);
        const row = colNames ? mapRowFromHeaders(fields, colNames, jobId) : mapRow(fields, jobId);
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
        importMode,
        headerDebug,
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
        first_name:       firstRow.first_name,
        last_name:        firstRow.last_name,
        full_name:        firstRow.full_name,
        address:          firstRow.address,
        zip:              firstRow.zip,
        age_band:         firstRow.age_band,
        claritas_ipa:     firstRow.claritas_ipa,
        est_income_range: firstRow.est_income_range,
        gender_code:      firstRow.gender_code,
        homeowner_flag1:  firstRow.homeowner_flag1,
      } : null,
      importMode,
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

