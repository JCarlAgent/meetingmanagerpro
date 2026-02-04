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

function toError(err: any): Error {
  return err instanceof Error ? err : new Error(toMessage(err));
}

async function requireMasterAdmin(req: any) {
  const user = await requireUserFromAuthHeader(req);
  const supabaseAdmin = getSupabaseAdmin();

  const { data: ma } = await supabaseAdmin
    .from('master_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (ma?.user_id) return { ok: true as const, user };

  if (user.email) {
    const { data: adminEmail } = await supabaseAdmin
      .from('admins')
      .select('email')
      .ilike('email', user.email)
      .maybeSingle();

    if (adminEmail?.email) return { ok: true as const, user };
  }

  return { ok: false as const, user };
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (error) {
    throw new Error(error.message || 'Failed to list users');
  }

  const user = (data?.users || []).find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
  return user?.id ?? null;
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
    const access = await requireMasterAdmin(req);
    if (!access.ok) {
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

    const fromOrgId = String(body?.fromOrgId ?? '').trim();
    const toOrgId = String(body?.toOrgId ?? '').trim();
    const email = String(body?.email ?? '').trim();
    const userIdFromBody = String(body?.userId ?? '').trim();
    const removeFromSource = body?.removeFromSource !== false;

    if (!fromOrgId) {
      send(res, 400, { error: 'Missing fromOrgId' });
      return;
    }
    if (!toOrgId) {
      send(res, 400, { error: 'Missing toOrgId' });
      return;
    }
    if (fromOrgId === toOrgId) {
      send(res, 400, { error: 'fromOrgId and toOrgId must be different' });
      return;
    }

    let userId = userIdFromBody;
    if (!userId) {
      if (!email || !email.includes('@')) {
        send(res, 400, { error: 'Provide userId or a valid email' });
        return;
      }
      userId = (await findUserIdByEmail(email)) || '';
      if (!userId) {
        send(res, 404, { error: `No auth user found for ${email}` });
        return;
      }
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Ensure orgs exist
    const [{ data: fromOrg }, { data: toOrg }] = await Promise.all([
      supabaseAdmin.from('orgs').select('id').eq('id', fromOrgId).maybeSingle(),
      supabaseAdmin.from('orgs').select('id').eq('id', toOrgId).maybeSingle(),
    ]);

    if (!fromOrg?.id) {
      send(res, 404, { error: 'Source org not found' });
      return;
    }
    if (!toOrg?.id) {
      send(res, 404, { error: 'Destination org not found' });
      return;
    }

    const { data: existing } = await supabaseAdmin
      .from('org_members')
      .select('org_id, user_id, role, created_at')
      .eq('org_id', fromOrgId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!existing?.user_id) {
      send(res, 404, { error: 'User is not a member of the source org' });
      return;
    }

    const tryUpsert = async (role: string) => {
      return supabaseAdmin
        .from('org_members')
        .upsert({ org_id: toOrgId, user_id: userId, role }, { onConflict: 'org_id,user_id' })
        .select('org_id, user_id, role, created_at')
        .single();
    };

    let { data: added, error: upsertErr } = await tryUpsert('advisor');
    if (upsertErr && /check constraint|violates check constraint/i.test(upsertErr.message || '')) {
      ({ data: added, error: upsertErr } = await tryUpsert('member'));
    }
    if (upsertErr) throw toError(upsertErr);

    let removed = false;
    if (removeFromSource) {
      const { error: delErr } = await supabaseAdmin
        .from('org_members')
        .delete()
        .eq('org_id', fromOrgId)
        .eq('user_id', userId);
      if (delErr) throw toError(delErr);
      removed = true;
    }

    send(res, 200, { ok: true, fromOrgId, toOrgId, userId, added, removed });
  } catch (err: unknown) {
    const message = toMessage(err);
    // eslint-disable-next-line no-console
    console.error('orgs/transferMember failed', { message, err });
    send(res, 500, { error: message });
  }
}
