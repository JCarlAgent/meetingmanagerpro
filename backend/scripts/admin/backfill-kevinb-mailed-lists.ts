import { createClient } from '@supabase/supabase-js';
import { runMailedListPostprocess, fingerprintAddress } from '../../api/_lib/mailedListPostprocess.js';

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
  const dryRun = process.argv.includes('--dryRun') || process.argv.includes('--dry-run');

  if (!jobId || !listId) {
    console.error('This script requires --jobId and --listId. Example: --jobId <id> --listId <id> [--dryRun]');
    process.exit(1);
  }

  const admin = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  // Resolve job and org
  const { data: job } = await admin.from('jobs').select('id,org_id').eq('id', jobId).maybeSingle();
  if (!job || !job.id) {
    console.error('Job not found:', jobId);
    process.exit(1);
  }
  const orgId = job.org_id;

  console.log('Before counts:');
  const [{ count: totalCount }, { count: haveRecipient }, { count: missingRecipient }, { count: recipientsCount }, { count: mailingsJob }, { count: mailingsList }] =
    await Promise.all([
      admin.from('campaign_mailed_list_records').select('id', { count: 'exact', head: true }).eq('campaign_id', jobId),
      admin.from('campaign_mailed_list_records').select('id', { count: 'exact', head: true }).eq('campaign_id', jobId).not('recipient_id', 'is', null),
      admin.from('campaign_mailed_list_records').select('id', { count: 'exact', head: true }).eq('campaign_id', jobId).is('recipient_id', null),
      admin.from('recipients').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
      admin.from('mailings').select('id', { count: 'exact', head: true }).eq('job_id', jobId),
      admin.from('mailings').select('id', { count: 'exact', head: true }).eq('mailing_list_id', listId),
    ]);

  console.log(`- campaign_mailed_list_records total: ${totalCount ?? 0}`);
  console.log(`- campaign_mailed_list_records with recipient_id: ${haveRecipient ?? 0}`);
  console.log(`- campaign_mailed_list_records missing recipient_id: ${missingRecipient ?? 0}`);
  console.log(`- recipients for org (${orgId}): ${recipientsCount ?? 0}`);
  console.log(`- mailings for job (${jobId}): ${mailingsJob ?? 0}`);
  console.log(`- mailings for list (${listId}): ${mailingsList ?? 0}`);

  // Compute unique fingerprints (use helper's fingerprintAddress)
  // Paginate to ensure we inspect all rows.
  const fps = new Set<string>();
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data: page, error: pageErr } = await admin
      .from('campaign_mailed_list_records')
      .select('id,first_name,last_name,address,city,state,zip')
      .eq('campaign_id', jobId)
      .range(offset, offset + PAGE - 1);
    if (pageErr) {
      console.error('Error fetching page for fingerprinting:', pageErr);
      process.exit(1);
    }
    if (!page || page.length === 0) break;
    for (const r of page as any[]) {
      const fp = fingerprintAddress({ address1: r.address, address2: '', city: r.city, state: r.state, zip: r.zip });
      fps.add(fp);
    }
    if (page.length < PAGE) break;
    offset += PAGE;
  }

  console.log(`- unique recipient fingerprints in mailed list: ${fps.size}`);

  if (dryRun) {
    console.log('\nDry-run mode; not calling helper.');
    console.log('Would call runMailedListPostprocess(admin, jobId, { listId }) to upsert recipients, create mailings, and link campaign records.');
    process.exit(0);
  }

  console.log('\nLive mode: calling runMailedListPostprocess...');
  const res = await runMailedListPostprocess(admin, jobId, { listId });
  console.log('Helper result:', res);

  // Print after counts
  const [{ count: totalCountA }, { count: haveRecipientA }, { count: missingRecipientA }, { count: recipientsCountA }, { count: mailingsJobA }, { count: mailingsListA }] =
    await Promise.all([
      admin.from('campaign_mailed_list_records').select('id', { count: 'exact', head: true }).eq('campaign_id', jobId),
      admin.from('campaign_mailed_list_records').select('id', { count: 'exact', head: true }).eq('campaign_id', jobId).not('recipient_id', 'is', null),
      admin.from('campaign_mailed_list_records').select('id', { count: 'exact', head: true }).eq('campaign_id', jobId).is('recipient_id', null),
      admin.from('recipients').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
      admin.from('mailings').select('id', { count: 'exact', head: true }).eq('job_id', jobId),
      admin.from('mailings').select('id', { count: 'exact', head: true }).eq('mailing_list_id', listId),
    ]);

  console.log('\nAfter counts:');
  console.log(`- campaign_mailed_list_records total: ${totalCountA ?? 0}`);
  console.log(`- campaign_mailed_list_records with recipient_id: ${haveRecipientA ?? 0}`);
  console.log(`- campaign_mailed_list_records missing recipient_id: ${missingRecipientA ?? 0}`);
  console.log(`- recipients for org (${orgId}): ${recipientsCountA ?? 0}`);
  console.log(`- mailings for job (${jobId}): ${mailingsJobA ?? 0}`);
  console.log(`- mailings for list (${listId}): ${mailingsListA ?? 0}`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
