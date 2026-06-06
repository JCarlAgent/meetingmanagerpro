import crypto from 'node:crypto';

// Shared post-processing for mailed-list imports (purchased lists)
// Ensures `job_mailing_lists`, `recipients`, `mailings`, and
// `campaign_mailed_list_records.recipient_id` are created/linked.
export function normalizeText(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, '')
    .replace(/\s+/g, ' ');
}

export function zip5(value: unknown): string {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  return digits.slice(0, 5);
}

export function fingerprintAddress(parts: {
  address1: unknown;
  address2?: unknown;
  city: unknown;
  state: unknown;
  zip: unknown;
}): string {
  const payload = [
    normalizeText(parts.address1),
    normalizeText(parts.address2 ?? ''),
    normalizeText(parts.city),
    normalizeText(parts.state),
    normalizeText(zip5(parts.zip)),
  ].join('|');

  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

export async function runMailedListPostprocess(
  supabaseAdmin: any,
  jobId: string,
  opts?: {
    mailedAtIso?: string;
    listId?: string;
    storagePath?: string | null;
    originalFilename?: string | null;
  }
) {
  const mailedAtIso = opts?.mailedAtIso ?? new Date().toISOString();

  // Resolve job and org
  const { data: job } = await supabaseAdmin.from('jobs').select('id,org_id').eq('id', jobId).maybeSingle();
  if (!job || !job.id) throw new Error('Job not found');
  const org_id = job.org_id;

  // Ensure job_mailing_lists exists (create if not provided)
  let listId = opts?.listId ?? null;
  if (!listId) {
    // compute row_count from inserted campaign_mailed_list_records
    const { count } = await supabaseAdmin
      .from('campaign_mailed_list_records')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', jobId);
    const row_count = Number(count ?? 0);

    const { data: created, error: createErr } = await supabaseAdmin
      .from('job_mailing_lists')
      .insert({
        job_id: jobId,
        storage_path: opts?.storagePath ?? null,
        original_filename: opts?.originalFilename ?? null,
        row_count,
        uploaded_at: mailedAtIso,
      })
      .select('id')
      .single();
    if (createErr) throw createErr;
    listId = created.id;
  } else {
    // update row_count defensively
    const { count } = await supabaseAdmin
      .from('campaign_mailed_list_records')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', jobId);
    const row_count = Number(count ?? 0);
    await supabaseAdmin.from('job_mailing_lists').update({ row_count }).eq('id', listId);
  }

  // Fetch raw mailed-list rows that are missing recipient linkage only.
  // This minimizes re-processing already-linked rows and speeds execution.
  // Use pagination (.range) to ensure we fetch ALL rows (Supabase defaults to limits).
  const rows: any[] = [];
  const PAGE = 1000;
  let offset = 0;
  console.log('Fetching campaign_mailed_list_records missing recipient_id (paginated)...');
  while (true) {
    const { data: page, error: pageErr } = await supabaseAdmin
      .from('campaign_mailed_list_records')
      .select('id,first_name,last_name,address,city,state,zip')
      .eq('campaign_id', jobId)
      .is('recipient_id', null)
      .range(offset, offset + PAGE - 1);
    if (pageErr) throw pageErr;
    if (!page || page.length === 0) break;
    rows.push(...page);
    console.log(`  fetched page: offset=${offset} rows=${page.length}`);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  console.log(`Total rows missing recipient_id to process: ${rows.length}`);

  const idToFp = new Map<string, string>();
  const fps: string[] = [];
  for (const r of (rows ?? []) as Array<any>) {
    const fp = fingerprintAddress({ address1: r.address, address2: '', city: r.city, state: r.state, zip: r.zip });
    idToFp.set(r.id, fp);
    fps.push(fp);
  }

  // Deduplicate fingerprints
  const uniqueFps = Array.from(new Set(fps));

  // Build recipient inputs by grouping first/last/address from any record with that fingerprint
  const fpToExample: Map<string, any> = new Map();
  for (const r of (rows ?? []) as Array<any>) {
    const fp = idToFp.get(r.id)!;
    if (!fpToExample.has(fp)) {
      fpToExample.set(fp, {
        org_id,
        fingerprint: fp,
        first_name: r.first_name ?? null,
        last_name: r.last_name ?? null,
        address1: r.address ?? null,
        address2: null,
        city: r.city ?? null,
        state: r.state ?? null,
        postal_code: (r.zip ? String(r.zip).replace(/[^0-9]/g, '').slice(0,5) : null),
      });
    }
  }

  const recipientInputs = Array.from(fpToExample.values());

  // Upsert recipients in batches
  const BATCH = 500;
  let recipientsUpserted = 0;
  console.log('Upserting recipients in batches...');
  for (let i = 0; i < recipientInputs.length; i += BATCH) {
    const batch = recipientInputs.slice(i, i + BATCH);
    const { data: upserted, error: upErr } = await supabaseAdmin
      .from('recipients')
      .upsert(batch, { onConflict: 'org_id,fingerprint' });
    if (upErr) throw upErr;
    console.log(`  recipients upserted batch ${i / BATCH + 1}: attempted=${batch.length} returned=${upserted ? upserted.length : 'unknown'}`);
    recipientsUpserted += upserted ? upserted.length : batch.length;
  }

  // Fetch recipient ids for these fingerprints in safe-sized batches.
  // Large `.in()` queries can exceed URL length limits or return truncated
  // results; fetch by smaller batches and include the org_id filter to be
  // explicit. Also check for errors on each call.
  const fpBatches: string[][] = [];
  const FP_BATCH = 100;
  for (let i = 0; i < uniqueFps.length; i += FP_BATCH) fpBatches.push(uniqueFps.slice(i, i + FP_BATCH));
  const fpToId = new Map<string, string>();
  for (const fb of fpBatches) {
    const { data: recs, error: recErr } = await supabaseAdmin
      .from('recipients')
      .select('id,fingerprint')
      .eq('org_id', org_id)
      .in('fingerprint', fb);
    if (recErr) throw recErr;
    for (const rr of (recs ?? []) as Array<any>) fpToId.set(rr.fingerprint, rr.id);
  }

  // Build mapping of rows -> recipient_id for only the rows we fetched
  const rowsToUpdate: Array<{ id: string; recipient_id: string }> = [];
  for (const [id, fp] of idToFp.entries()) {
    const rid = fpToId.get(fp);
    if (!rid) continue;
    rowsToUpdate.push({ id, recipient_id: rid });
  }

  console.log(`Rows that can be linked to recipients: ${rowsToUpdate.length}`);

  // Update campaign_mailed_list_records.recipient_id in batches using upsert
  // on the primary key `id`. This is more efficient than updating per-recipient.
  let rowsUpdated = 0;
  for (let i = 0; i < rowsToUpdate.length; i += BATCH) {
    const chunk = rowsToUpdate.slice(i, i + BATCH);
    // Use upsert on primary key to set recipient_id for existing rows.
    const { data: updated, error: updErr } = await supabaseAdmin
      .from('campaign_mailed_list_records')
      .upsert(chunk, { onConflict: 'id' });
    if (updErr) throw updErr;
    console.log(`  updated rows batch ${i / BATCH + 1}: attempted=${chunk.length} updated=${updated ? updated.length : 'unknown'}`);
    rowsUpdated += updated ? updated.length : chunk.length;
  }

  // After linkage, insert mailings ledger rows (one per unique recipient linked)
  const uniqueRecipientIds = Array.from(new Set(rowsToUpdate.map((r) => r.recipient_id)));
  console.log(`Preparing mailings for ${uniqueRecipientIds.length} recipients (idempotent upsert)...`);
  const mailings: any[] = [];
  for (const rid of uniqueRecipientIds) {
    mailings.push({ org_id, job_id: jobId, recipient_id: rid, mailing_list_id: listId, mailed_at: mailedAtIso, pieces: 1 });
  }

  let mailingsInserted = 0;
  for (let i = 0; i < mailings.length; i += BATCH) {
    const chunk = mailings.slice(i, i + BATCH);
    try {
      const { data: inserted, error: upErr } = await supabaseAdmin
        .from('mailings')
        .upsert(chunk, { onConflict: 'mailing_list_id,recipient_id' });
      if (upErr) throw upErr;
      console.log(`  mailings upsert batch ${i / BATCH + 1}: attempted=${chunk.length} inserted=${inserted ? inserted.length : 'unknown'}`);
      mailingsInserted += inserted ? inserted.length : chunk.length;
    } catch (err: any) {
      const pgCode = err?.code ?? err?.details ?? null;
      if (String(pgCode) === '23505' || (err && /unique/i.test(String(err.message ?? '')))) {
        // ignore unique violations
      } else {
        throw err;
      }
    }
  }

  return {
    listId,
    rowsMissingInitially: rows.length,
    rowsLinked: rowsUpdated,
    recipientsUpserted,
    mailingsInserted,
  };
}

export default { runMailedListPostprocess, fingerprintAddress, normalizeText, zip5 };
