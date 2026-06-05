// Removed @vercel/node types to avoid build-time dependency on Vercel typings
import crypto from 'node:crypto';
import Papa from 'papaparse';
import { getSupabaseAdmin, requireUserFromAuthHeader } from '../../_lib/supabaseAdmin.js';
import { runMailedListPostprocess } from '../../_lib/mailedListPostprocess.js';

type CsvRow = Record<string, unknown>;

type RecipientInput = {
  org_id: string;
  fingerprint: string;
  first_name?: string | null;
  last_name?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
};

function normalizeText(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, '')
    .replace(/\s+/g, ' ');
}

function zip5(value: unknown): string {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  return digits.slice(0, 5);
}

function fingerprintAddress(parts: {
  address1: unknown;
  address2: unknown;
  city: unknown;
  state: unknown;
  zip: unknown;
}): string {
  const payload = [
    normalizeText(parts.address1),
    normalizeText(parts.address2),
    normalizeText(parts.city),
    normalizeText(parts.state),
    normalizeText(zip5(parts.zip)),
  ].join('|');

  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

function pick(row: CsvRow, keys: string[]): string {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim() !== '') {
      return String(row[key]).trim();
    }
  }
  return '';
}

async function canAccessJob(args: { userId: string; email: string | null; jobId: string }) {
  const supabaseAdmin = getSupabaseAdmin();

  // Master admin by user_id
  const { data: ma } = await supabaseAdmin
    .from('master_admins')
    .select('user_id')
    .eq('user_id', args.userId)
    .maybeSingle();

  if (ma?.user_id) return { ok: true as const, reason: 'master_admins' };

  // Master admin by legacy email list
  if (args.email) {
    const { data: adminEmail } = await supabaseAdmin
      .from('admins')
      .select('email')
      .ilike('email', args.email)
      .maybeSingle();
    if (adminEmail?.email) return { ok: true as const, reason: 'admins_email' };
  }

  const { data: job, error: jobErr } = await supabaseAdmin
    .from('jobs')
    .select('id, org_id, created_by_user_id')
    .eq('id', args.jobId)
    .maybeSingle();

  if (jobErr || !job?.id) {
    return { ok: false as const, reason: 'job_not_found' };
  }

  // Org membership
  const { data: member } = await supabaseAdmin
    .from('org_members')
    .select('role')
    .eq('org_id', job.org_id)
    .eq('user_id', args.userId)
    .maybeSingle();

  if (!member?.role) return { ok: false as const, reason: 'not_org_member' };

  if (member.role === 'fmo_admin') return { ok: true as const, reason: 'fmo_admin' };

  if (job.created_by_user_id === args.userId) return { ok: true as const, reason: 'job_owner' };

  return { ok: false as const, reason: 'advisor_not_owner' };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const user = await requireUserFromAuthHeader(req);
    const { jobId, storagePath, originalFilename, mailedAt } = (req.body || {}) as {
      jobId?: string;
      storagePath?: string;
      originalFilename?: string;
      mailedAt?: string;
    };

    if (!jobId || !storagePath || !originalFilename) {
      res.status(400).json({ error: 'Missing jobId, storagePath, or originalFilename' });
      return;
    }

    const access = await canAccessJob({ userId: user.id, email: user.email, jobId });
    if (!access.ok) {
      res.status(403).json({ error: 'Not authorized for this job', reason: access.reason });
      return;
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: job, error: jobErr } = await supabaseAdmin
      .from('jobs')
      .select('id, org_id')
      .eq('id', jobId)
      .single();

    if (jobErr) throw jobErr;

    // Download CSV from Storage
    const { data: fileData, error: dlErr } = await supabaseAdmin
      .storage
      .from('job-demographics')
      .download(storagePath);

    if (dlErr) {
      res.status(400).json({ error: `Failed to download file from storage: ${dlErr.message}` });
      return;
    }

    const buf = Buffer.from(await fileData.arrayBuffer());
    const csvText = buf.toString('utf8');

    const parsed = Papa.parse<CsvRow>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    });

    if (parsed.errors?.length) {
      res.status(400).json({ error: 'CSV parse error', details: parsed.errors.slice(0, 3) });
      return;
    }

    const rows = (parsed.data || []).filter((r) => r && Object.values(r).some((v) => String(v ?? '').trim() !== ''));

    // Insert job_mailing_lists metadata
    const mailedAtIso = mailedAt ? new Date(mailedAt).toISOString() : new Date().toISOString();

    const { data: listRow, error: listErr } = await supabaseAdmin
      .from('job_mailing_lists')
      .insert({
        job_id: jobId,
        storage_path: storagePath,
        original_filename: originalFilename,
        row_count: rows.length,
        uploaded_at: mailedAtIso,
      })
      .select('id')
      .single();

    if (listErr) throw listErr;

    // Build recipient inputs and dedupe by fingerprint within this upload
    const byFingerprint = new Map<string, RecipientInput>();

    for (const row of rows) {
      const first = pick(row, ['first_name', 'firstname', 'first name']);
      const last = pick(row, ['last_name', 'lastname', 'last name']);

      const address1 = pick(row, ['address1', 'address_1', 'address', 'street', 'street_address', 'mailing_address', 'address line 1']);
      const address2 = pick(row, ['address2', 'address_2', 'apt', 'unit', 'suite', 'address line 2']);
      const city = pick(row, ['city', 'town']);
      const state = pick(row, ['state', 'st']);
      const zip = pick(row, ['zip', 'zipcode', 'zip_code', 'postal', 'postal_code']);

      if (!address1 || !city || !state || !zip5(zip)) {
        continue;
      }

      const fp = fingerprintAddress({ address1, address2, city, state, zip });
      if (!byFingerprint.has(fp)) {
        byFingerprint.set(fp, {
          org_id: job.org_id,
          fingerprint: fp,
          first_name: first || null,
          last_name: last || null,
          address1,
          address2: address2 || null,
          city,
          state,
          postal_code: zip5(zip) || null,
        });
      }
    }

    const uniqueRecipients = Array.from(byFingerprint.values());
    const duplicatesSkipped = Math.max(0, rows.length - uniqueRecipients.length);

    // Insert raw parsed rows into campaign_mailed_list_records so we can
    // later link them to `recipients` via `recipient_id`.
    const rawInsertBatchSize = 500;
    const insertedRecords: Array<{ id: string; address: string | null; city: string | null; state: string | null; zip: string | null }> = [];
    function buildRawRecord(row: CsvRow) {
      const individual_name = pick(row, ['individual_name', 'individualname', 'individual name']);
      const first = pick(row, ['first_name', 'firstname', 'first name']);
      const last = pick(row, ['last_name', 'lastname', 'last name']);
      const address = pick(row, ['address1', 'address_1', 'address', 'street', 'street_address', 'mailing_address', 'address line 1']);
      const city = pick(row, ['city', 'town']);
      const state = pick(row, ['state', 'st']);
      const zip = pick(row, ['zip', 'zipcode', 'zip_code', 'postal', 'postal_code']);
      return {
        campaign_id: jobId,
        individual_name: individual_name || null,
        first_name: first || null,
        last_name: last || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zip: zip5(zip) || null,
        claritas_ipa: pick(row, ['claritas_ipa', 'claritas', 'ipa']) || null,
        age_band: pick(row, ['age_band', 'ageband']) || null,
        est_income_code: pick(row, ['est_income_code', 'est_income_code']) || null,
        est_income_range: pick(row, ['est_income_range', 'est_income_narrow_range']) || null,
      };
    }

    for (let i = 0; i < rows.length; i += rawInsertBatchSize) {
      const batch = rows.slice(i, i + rawInsertBatchSize).map(buildRawRecord);
      const { data: insData, error: insErr } = await supabaseAdmin
        .from('campaign_mailed_list_records')
        .insert(batch)
        .select('id, address, city, state, zip');

      if (insErr) throw insErr;
      insertedRecords.push(...((insData ?? []) as any));
    }

    // Call shared postprocess helper to upsert recipients, create mailings,
    // and link campaign_mailed_list_records.recipient_id. This centralizes
    // the logic and keeps behavior identical between chunked and full-file flows.
    const post = await runMailedListPostprocess(supabaseAdmin, jobId, { mailedAtIso, listId: listRow.id, storagePath, originalFilename });

    res.status(200).json({
      ok: true,
      jobId,
      storagePath,
      listId: listRow.id,
      rowsParsed: rows.length,
      uniqueRecipients: uniqueRecipients.length,
      duplicatesSkipped,
      recipientsUpserted: post.recipientsUpserted,
      mailingsInserted: post.mailingsInserted,
      mailedAt: mailedAtIso,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
}
