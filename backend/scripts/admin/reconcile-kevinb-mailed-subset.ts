/**
 * reconcile-kevinb-mailed-subset.ts
 *
 * Reconciles a 7,500-row "actually mailed" CSV against the existing purchased
 * recipient pool. Creates a new job_mailing_lists row, inserts correct mailings,
 * then deletes the previously over-stated mailings rows — but only after the
 * inserts succeed.
 *
 * Usage:
 *   node dist-scripts/backend/scripts/admin/reconcile-kevinb-mailed-subset.js \
 *     --jobId <uuid> --csvPath <path/to/file.csv> --oldListId <uuid> [--dryRun]
 */

import { createClient } from '@supabase/supabase-js';
import { fingerprintAddress } from '../../api/_lib/mailedListPostprocess.js';
import { readFileSync } from 'fs';
import { basename } from 'path';

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

// ── Minimal CSV parser (no external deps) ──────────────────────────────────
// Handles quoted fields with commas and embedded newlines (basic RFC 4180).
function parseCsv(raw: string): Record<string, string>[] {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let cur = '';
  let inQuote = false;
  let row: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const ch = lines[i];
    if (inQuote) {
      if (ch === '"' && lines[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuote = false;
      else cur += ch;
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { row.push(cur.trim()); cur = ''; }
      else if (ch === '\n') { row.push(cur.trim()); cur = ''; rows.push(row); row = []; }
      else cur += ch;
    }
  }
  if (cur.length || row.length) { row.push(cur.trim()); rows.push(row); }

  if (rows.length === 0) return [];
  const headers = rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, ''));
  return rows.slice(1).filter(r => r.some(c => c.trim())).map(r => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = r[i] ?? ''; });
    return obj;
  });
}

// Attempt to resolve address fields from common CSV header variants
function extractAddressFields(row: Record<string, string>) {
  const get = (...keys: string[]) => {
    for (const k of keys) { if (row[k] != null && row[k] !== '') return row[k]; }
    return '';
  };
  return {
    address1: get('address', 'address1', 'addr', 'street', 'addr1', 'mailing_address', 'deladdr', 'delivery_address', 'street_address', 'altaddr'),
    address2: get('address2', 'addr2', 'apt', 'unit'),
    city: get('city', 'city_name'),
    state: get('state', 'st', 'state_code'),
    zip: get('zip', 'postal_code', 'zip_code', 'zipcode', 'postalcode'),
  };
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    process.exit(1);
  }

  const jobId = getArg('--jobId');
  const csvPath = getArg('--csvPath');
  const oldListId = getArg('--oldListId');
  const dryRun = process.argv.includes('--dryRun') || process.argv.includes('--dry-run');

  if (!jobId || !csvPath || !oldListId) {
    console.error('Requires --jobId, --csvPath, and --oldListId. Add --dryRun to preview only.');
    process.exit(1);
  }

  const admin = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  // Resolve job/org
  const { data: job } = await admin.from('jobs').select('id,org_id').eq('id', jobId).maybeSingle();
  if (!job?.id) { console.error('Job not found:', jobId); process.exit(1); }
  const orgId = job.org_id;

  // Parse CSV
  console.log(`\nParsing CSV: ${csvPath}`);
  const raw = readFileSync(csvPath, 'utf-8');
  const csvRows = parseCsv(raw);
  console.log(`  CSV rows parsed: ${csvRows.length}`);

  // Compute fingerprints from CSV
  const csvFps = new Set<string>();
  const csvFpToRow = new Map<string, Record<string, string>>();
  for (const row of csvRows) {
    const parts = extractAddressFields(row);
    if (!parts.address1 && !parts.city && !parts.zip) continue; // skip blank rows
    const fp = fingerprintAddress(parts);
    csvFps.add(fp);
    if (!csvFpToRow.has(fp)) csvFpToRow.set(fp, row);
  }
  console.log(`  Unique CSV fingerprints: ${csvFps.size}`);

  // Match to existing recipients in batches
  const FP_BATCH = 100;
  const fpList = Array.from(csvFps);
  const fpToRecipientId = new Map<string, string>();
  for (let i = 0; i < fpList.length; i += FP_BATCH) {
    const batch = fpList.slice(i, i + FP_BATCH);
    const { data: recs, error } = await admin
      .from('recipients')
      .select('id,fingerprint')
      .eq('org_id', orgId)
      .in('fingerprint', batch);
    if (error) throw error;
    for (const r of (recs ?? []) as any[]) fpToRecipientId.set(r.fingerprint, r.id);
  }

  const matchedFps = Array.from(csvFps).filter(fp => fpToRecipientId.has(fp));
  const unmatchedFps = Array.from(csvFps).filter(fp => !fpToRecipientId.has(fp));
  console.log(`  Matched recipients: ${matchedFps.length}`);
  console.log(`  Unmatched CSV fingerprints: ${unmatchedFps.length}`);

  // Log unmatched rows
  if (unmatchedFps.length > 0) {
    console.log('\nUnmatched rows (first 20):');
    for (const fp of unmatchedFps.slice(0, 20)) {
      const row = csvFpToRow.get(fp);
      if (row) {
        const parts = extractAddressFields(row);
        console.log(`  ${parts.address1} | ${parts.city}, ${parts.state} ${parts.zip}`);
      }
    }
    if (unmatchedFps.length > 20) console.log(`  ... and ${unmatchedFps.length - 20} more.`);
  }

  // Current mailings count for old list
  const { count: oldMailingsCount } = await admin
    .from('mailings')
    .select('id', { count: 'exact', head: true })
    .eq('mailing_list_id', oldListId);
  console.log(`\nCurrent mailings for oldListId (${oldListId}): ${oldMailingsCount ?? 0}`);

  if (dryRun) {
    console.log('\n--- DRY RUN complete. No DB changes made. ---');
    console.log(`  Would create 1 new job_mailing_lists row with row_count=${matchedFps.length}`);
    console.log(`  Would insert ${matchedFps.length} mailings rows`);
    console.log(`  Would delete ${oldMailingsCount ?? 0} old mailings rows for oldListId`);
    process.exit(0);
  }

  // Safety gate: require reasonable match rate
  const matchRate = csvFps.size > 0 ? matchedFps.length / csvFps.size : 0;
  if (matchRate < 0.8) {
    console.error(`\nSafety check failed: match rate ${(matchRate * 100).toFixed(1)}% is below 80%. Aborting. Re-run with --dryRun to review unmatched rows.`);
    process.exit(1);
  }
  console.log(`\nMatch rate ${(matchRate * 100).toFixed(1)}% — safety check passed. Proceeding with live run.`);

  // 1. Create new job_mailing_lists row for actual mailed subset
  const { data: newList, error: createErr } = await admin
    .from('job_mailing_lists')
    .insert({
      job_id: jobId,
      original_filename: basename(csvPath),
      row_count: matchedFps.length,
      uploaded_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (createErr) throw createErr;
  const newListId = newList.id;
  console.log(`\nCreated new job_mailing_lists row: ${newListId}`);

  // 2. Insert correct mailings for matched recipients
  const mailedAt = new Date().toISOString();
  const MAIL_BATCH = 100;
  const recipientIds = matchedFps.map(fp => fpToRecipientId.get(fp)!);
  let mailingsInserted = 0;
  for (let i = 0; i < recipientIds.length; i += MAIL_BATCH) {
    const chunk = recipientIds.slice(i, i + MAIL_BATCH);
    const payload = chunk.map(rid => ({
      org_id: orgId,
      job_id: jobId,
      recipient_id: rid,
      mailing_list_id: newListId,
      mailed_at: mailedAt,
      pieces: 1,
    }));
    const { error: insErr } = await admin.from('mailings').insert(payload);
    if (insErr) {
      console.error('Error inserting mailings batch — rolling back by deleting new list row:', insErr);
      await admin.from('job_mailing_lists').delete().eq('id', newListId);
      throw insErr;
    }
    mailingsInserted += chunk.length;
    console.log(`  Inserted mailings ${mailingsInserted}/${recipientIds.length}`);
  }
  console.log(`\nMailings inserted: ${mailingsInserted}`);

  // 3. Only after successful inserts, delete old incorrect mailings
  const { error: delErr, count: deleted } = await admin
    .from('mailings')
    .delete({ count: 'exact' })
    .eq('mailing_list_id', oldListId);
  if (delErr) {
    console.error('Warning: new mailings inserted successfully but failed to delete old mailings:', delErr);
    console.error('Manual cleanup needed: DELETE FROM mailings WHERE mailing_list_id =', oldListId);
  } else {
    console.log(`Deleted old mailings for oldListId: ${deleted ?? 0} rows`);
  }

  console.log('\nReconcile complete.');
  console.log(`  New mailing_list_id: ${newListId}`);
  console.log(`  Matched & mailed: ${mailingsInserted}`);
  console.log(`  Unmatched (not in DB): ${unmatchedFps.length}`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
