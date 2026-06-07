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

  // After linkage complete, insert mailings for distinct recipient_ids for the job
  const { data: simple } = await admin
    .from('campaign_mailed_list_records')
    .select('recipient_id')
    .eq('campaign_id', jobId)
    .not('recipient_id', 'is', null);
  const recipientIds = Array.from(new Set((simple ?? []).map((r: any) => r.recipient_id)));

  console.log(`Preparing to upsert mailings for ${recipientIds.length} recipients`);
  const MAIL_BATCH = 250;
  for (let i = 0; i < recipientIds.length; i += MAIL_BATCH) {
    const chunk = recipientIds.slice(i, i + MAIL_BATCH);
    const payload = chunk.map((rid) => ({ org_id: orgId, job_id: jobId, recipient_id: rid, mailing_list_id: listId, mailed_at: new Date().toISOString(), pieces: 1 }));
    const { data: inserted, error: insErr } = await admin.from('mailings').upsert(payload, { onConflict: 'mailing_list_id,recipient_id' });
    if (insErr) throw insErr;
    console.log(`  mailings upsert batch ${i / MAIL_BATCH + 1}: attempted=${payload.length} inserted=${inserted ? inserted.length : 'unknown'}`);
  }

  console.log('Resume backfill complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
