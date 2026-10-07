import { getSupabaseAdmin, requireUserFromAuthHeader } from '../_lib/supabaseAdmin.js';

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function toMessage(err: any): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err.message === 'string' && err.message) return err.message;
  if (typeof err.error === 'string' && err.error) return err.error;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

async function isMasterAdmin(user: { id: string; email: string | null }) {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: ma } = await supabaseAdmin
    .from('master_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (ma?.user_id) return true;

  if (user.email) {
    const { data: adminEmail } = await supabaseAdmin
      .from('admins')
      .select('email')
      .ilike('email', user.email)
      .maybeSingle();

    if (adminEmail?.email) return true;
  }

  return false;
}

async function isFmoAdminForOrg(userId: string, orgId: string) {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: member } = await supabaseAdmin
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  return member?.role === 'fmo_admin';
}

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    send(res, 405, { error: 'Method not allowed' });
    return;
  }

  let body: any;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    send(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  const jobId = String(body?.jobId ?? body?.id ?? '').trim();
  if (!jobId) {
    send(res, 400, { error: 'Missing jobId' });
    return;
  }

  try {
    const user = await requireUserFromAuthHeader(req);
    const supabaseAdmin = getSupabaseAdmin();

    const { data: job, error: jobErr } = await supabaseAdmin
      .from('jobs')
      .select('id, org_id, title, job_number')
      .eq('id', jobId)
      .maybeSingle();

    if (jobErr) throw jobErr;
    if (!job?.id) {
      send(res, 404, { error: 'Job not found' });
      return;
    }

    const authorized = (await isMasterAdmin(user)) || (await isFmoAdminForOrg(user.id, job.org_id));
    if (!authorized) {
      send(res, 403, { error: 'Not authorized to delete this job' });
      return;
    }

    const { data: storageRows, error: storageQueryErr } = await supabaseAdmin
      .from('job_mailing_lists')
      .select('storage_path')
      .eq('job_id', jobId)
      .not('storage_path', 'is', null);

    if (storageQueryErr) throw storageQueryErr;

    const storagePaths = Array.from(
      new Set(
        (storageRows ?? [])
          .map((row: any) => String(row?.storage_path ?? '').trim())
          .filter(Boolean)
      )
    );

    const { error: deleteErr } = await supabaseAdmin
      .from('jobs')
      .delete()
      .eq('id', jobId);

    if (deleteErr) throw deleteErr;

    let storageWarning: string | null = null;
    let removedCount = 0;

    if (storagePaths.length) {
      try {
        const { error: storageErr } = await supabaseAdmin.storage.from('job-demographics').remove(storagePaths);
        if (storageErr) {
          throw storageErr;
        }
        removedCount = storagePaths.length;
      } catch (storageErr: any) {
        storageWarning = `Job deleted, but storage cleanup failed for ${storagePaths.length} object(s): ${toMessage(storageErr)}`;
        console.error('[jobs/delete] job deleted but storage cleanup failed', {
          jobId,
          orgId: job.org_id,
          storagePaths,
          message: toMessage(storageErr),
        });
      }
    }

    if (storageWarning) {
      send(res, 200, {
        success: true,
        deleted: true,
        storageCleanupWarning: true,
        warning: storageWarning,
        deletedJob: { id: job.id, org_id: job.org_id, job_number: job.job_number, title: job.title },
        storage: {
          bucket: 'job-demographics',
          attempted: storagePaths.length,
          removedCount,
          warning: storageWarning,
        },
      });
      return;
    }

    send(res, 200, {
      success: true,
      deleted: true,
      storageCleanupWarning: false,
      deletedJob: { id: job.id, org_id: job.org_id, job_number: job.job_number, title: job.title },
      storage: {
        bucket: 'job-demographics',
        attempted: storagePaths.length,
        removedCount,
      },
    });
  } catch (err: unknown) {
    const message = toMessage(err);
    console.error('[jobs/delete] failed', { jobId, message, err });
    send(res, 500, { error: message });
  }
}
