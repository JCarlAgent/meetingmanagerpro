import { createClient } from '@supabase/supabase-js';
import { fingerprintAddress } from '../../api/_lib/mailedListPostprocess.js';

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    process.exit(1);
  }

  const jobId = getArg('--jobId');
  const listId = getArg('--listId');
  if (!jobId || !listId) {
    console.error('Requires --jobId and --listId');
    process.exit(1);
  }

  const admin = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  // Resolve job/org
  const { data: job } = await admin.from('jobs').select('id,org_id').eq('id', jobId).maybeSingle();
  if (!job || !job.id) {
    console.error('Job not found:', jobId);
    process.exit(1);
  }
  const orgId = job.org_id;

  const FETCH_BATCH = 100; // fetch 100 missing rows at a time
  const UPDATE_CONCURRENCY = 3; // limited concurrency
  async function fetchMissingCount() {
    const { count } = await admin
      .from('campaign_mailed_list_records')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', jobId)
      .is('recipient_id', null);
    return Number(count ?? 0);
  }

  let remaining = await fetchMissingCount();
  console.log(`Starting resume backfill: remaining missing rows=${remaining}`);

  while (remaining > 0) {
    const { data: rows, error } = await admin
      .from('campaign_mailed_list_records')
      .select('id,first_name,last_name,address,city,state,zip')
      .eq('campaign_id', jobId)
      .is('recipient_id', null)
      .limit(FETCH_BATCH);
    if (error) throw error;
    if (!rows || rows.length === 0) break;

    // compute fingerprints and lookup recipients
    const idToFp = new Map<string, string>();
    const fps: string[] = [];
    for (const r of rows as any[]) {
      const fp = fingerprintAddress({ address1: r.address, address2: '', city: r.city, state: r.state, zip: r.zip });
      idToFp.set(r.id, fp);
      fps.push(fp);
    }

    // lookup recipients by fingerprint
    const { data: recs } = await admin
      .from('recipients')
      .select('id,fingerprint')
      .eq('org_id', orgId)
      .in('fingerprint', fps);
    const fpToId = new Map<string, string>();
    for (const rr of (recs ?? []) as any[]) fpToId.set(rr.fingerprint, rr.id);

    // prepare rows for update
    const toUpdate: Array<{ id: string; recipient_id: string }> = [];
    const skipped: string[] = [];
    for (const [id, fp] of idToFp.entries()) {
      const rid = fpToId.get(fp);
      if (rid) toUpdate.push({ id, recipient_id: rid });
      else skipped.push(id);
    }

    // update in small pools
    let linkedThisBatch = 0;
    for (let i = 0; i < toUpdate.length; i += UPDATE_CONCURRENCY) {
      const pool = toUpdate.slice(i, i + UPDATE_CONCURRENCY);
      const results = await Promise.all(
        pool.map(async (r) => {
          const { data: updated, error: updErr } = await admin
            .from('campaign_mailed_list_records')
            .update({ recipient_id: r.recipient_id })
            .eq('id', r.id)
            .is('recipient_id', null)
            .select('id');
          if (updErr) throw updErr;
          return (updated ? updated.length : 0);
        })
      );
      const stepLinked = results.reduce((a, b) => a + b, 0);
      linkedThisBatch += stepLinked;
    }

    remaining = await fetchMissingCount();
    console.log(`linked this batch=${linkedThisBatch} skipped this batch=${skipped.length} remaining=${remaining}`);
  }

  // Paginate all linked recipient_ids for this job
  const MAIL_PAGE = 1000;
  let mailOffset = 0;
  const allRecipientIds = new Set<string>();
  while (true) {
    const { data: page, error: pageErr } = await admin
      .from('campaign_mailed_list_records')
      .select('recipient_id')
      .eq('campaign_id', jobId)
      .not('recipient_id', 'is', null)
      .range(mailOffset, mailOffset + MAIL_PAGE - 1);
    if (pageErr) throw pageErr;
    if (!page || page.length === 0) break;
    for (const r of page as any[]) if (r.recipient_id) allRecipientIds.add(r.recipient_id);
    if (page.length < MAIL_PAGE) break;
    mailOffset += MAIL_PAGE;
  }
  const recipientIds = Array.from(allRecipientIds);
  console.log(`Distinct linked recipients found: ${recipientIds.length}`);

  // Fetch existing mailings for this list to avoid duplicate inserts
  const existingMailedIds = new Set<string>();
  let existingOffset = 0;
  while (true) {
    const { data: existing, error: exErr } = await admin
      .from('mailings')
      .select('recipient_id')
      .eq('mailing_list_id', listId)
      .range(existingOffset, existingOffset + MAIL_PAGE - 1);
    if (exErr) throw exErr;
    if (!existing || existing.length === 0) break;
    for (const m of existing as any[]) if (m.recipient_id) existingMailedIds.add(m.recipient_id);
    if (existing.length < MAIL_PAGE) break;
    existingOffset += MAIL_PAGE;
  }
  console.log(`Existing mailings found for list: ${existingMailedIds.size}`);

  const toInsert = recipientIds.filter((rid) => !existingMailedIds.has(rid));
  console.log(`Mailings to insert: ${toInsert.length}`);

  const MAIL_BATCH = 100;
  const mailedAt = new Date().toISOString();
  let mailingsInserted = 0;
  for (let i = 0; i < toInsert.length; i += MAIL_BATCH) {
    const chunk = toInsert.slice(i, i + MAIL_BATCH);
    const payload = chunk.map((rid) => ({ org_id: orgId, job_id: jobId, recipient_id: rid, mailing_list_id: listId, mailed_at: mailedAt, pieces: 1 }));
    try {
      const { error: insErr } = await admin.from('mailings').insert(payload);
      if (insErr) {
        const code = (insErr as any).code ?? '';
        if (String(code) === '23505') {
          console.log(`  mailings batch ${i / MAIL_BATCH + 1}: unique violation, skipping chunk`);
        } else {
          throw insErr;
        }
      } else {
        mailingsInserted += chunk.length;
        console.log(`  mailings inserted batch ${i / MAIL_BATCH + 1}: attempted=${chunk.length} (total so far=${mailingsInserted})`);
      }
    } catch (err: any) {
      const pgCode = err?.code ?? '';
      if (String(pgCode) === '23505') {
        console.log(`  mailings batch ${i / MAIL_BATCH + 1}: unique violation, skipping`);
      } else {
        throw err;
      }
    }
  }
  console.log(`Mailings insert complete: total inserted=${mailingsInserted}`);

  console.log('Resume backfill complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
