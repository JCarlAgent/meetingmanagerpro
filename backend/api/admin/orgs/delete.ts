import { getSupabaseAdmin, requireUserFromAuthHeader } from '../../_lib/supabaseAdmin.js';

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

  try {
    const user = await requireUserFromAuthHeader(req);
    const allowed = await isMasterAdmin(user);
    if (!allowed) {
      send(res, 403, { error: 'Not authorized' });
      return;
    }

    let body: any;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      send(res, 400, { error: 'Invalid JSON body' });
      return;
    }

    const orgId = String(body?.orgId ?? '').trim();
    const confirm = String(body?.confirm ?? '').trim();

    if (!orgId) {
      send(res, 400, { error: 'Missing orgId' });
      return;
    }

    // Guardrail: require caller to echo the orgId.
    if (!confirm || confirm !== orgId) {
      send(res, 400, { error: 'Confirmation required. Set confirm = orgId.' });
      return;
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: org } = await supabaseAdmin.from('orgs').select('id, name, slug').eq('id', orgId).maybeSingle();
    if (!org?.id) {
      send(res, 404, { error: 'Org not found' });
      return;
    }

    // Best-effort cleanup: remove org logo files from Storage.
    // Upload paths are orgId/<timestamp>-<name>, so a single list(orgId) is sufficient.
    const storageBucket = 'org-logos';
    let storageRemovedCount = 0;
    let storageWarning: string | null = null;
    try {
      const { data: items, error: listErr } = await supabaseAdmin.storage.from(storageBucket).list(orgId, { limit: 1000 });
      if (listErr) throw listErr;

      const names = (items ?? [])
        .map((i: any) => String(i?.name ?? '').trim())
        .filter(Boolean);

      if (names.length) {
        const paths = names.map((n) => `${orgId}/${n}`);
        const { error: remErr } = await supabaseAdmin.storage.from(storageBucket).remove(paths);
        if (remErr) throw remErr;
        storageRemovedCount = paths.length;
      }
    } catch (e: any) {
      // Don't block org deletion if storage isn't configured.
      storageWarning = toMessage(e);
    }

    // Delete cascades to org_members and (in this schema) most org-owned rows.
    const { error: delErr } = await supabaseAdmin.from('orgs').delete().eq('id', orgId);
    if (delErr) throw delErr;

    send(res, 200, {
      ok: true,
      deletedOrg: org,
      storage: {
        bucket: storageBucket,
        removedCount: storageRemovedCount,
        warning: storageWarning,
      },
    });
  } catch (err: unknown) {
    const message = toMessage(err);
    // eslint-disable-next-line no-console
    console.error('orgs/delete failed', { message, err });
    send(res, 500, { error: message });
  }
}
