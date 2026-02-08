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

async function canManageOrgMembers(user: { id: string; email: string | null }, orgId: string) {
  if (await isMasterAdmin(user)) return true;

  const supabaseAdmin = getSupabaseAdmin();
  const { data } = await supabaseAdmin
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  return (data as any)?.role === 'fmo_admin' || (data as any)?.role === 'org_admin';
}

async function getAuthUserSafe(supabaseAdmin: any, userId: string) {
  try {
    const fn = supabaseAdmin?.auth?.admin?.getUserById;
    if (typeof fn === 'function') {
      const { data, error } = await fn.call(supabaseAdmin.auth.admin, userId);
      if (error) throw error;
      return data?.user ?? null;
    }
  } catch {
    // fall through
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw error;
    const u = (data?.users || []).find((x: any) => x?.id === userId);
    return u ?? null;
  } catch {
    return null;
  }
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

    let body: any;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      send(res, 400, { error: 'Invalid JSON body' });
      return;
    }

    const orgId = String(body?.orgId ?? '').trim();
    const userId = String(body?.userId ?? '').trim();
    const fullName = String(body?.fullName ?? '').trim();

    if (!orgId) {
      send(res, 400, { error: 'Missing orgId' });
      return;
    }
    if (!userId) {
      send(res, 400, { error: 'Missing userId' });
      return;
    }
    if (!fullName) {
      send(res, 400, { error: 'Missing fullName' });
      return;
    }
    if (fullName.length > 120) {
      send(res, 400, { error: 'Full name too long' });
      return;
    }

    const allowed = await canManageOrgMembers(user, orgId);
    if (!allowed) {
      send(res, 403, { error: 'Not authorized' });
      return;
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: membership } = await supabaseAdmin
      .from('org_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle();

    const role = String((membership as any)?.role ?? '');
    if (!role || (role !== 'advisor' && role !== 'member')) {
      send(res, 400, { error: 'Target user is not an advisor/member of this org' });
      return;
    }

    const authUser: any = await getAuthUserSafe(supabaseAdmin, userId);
    const email = String(authUser?.email ?? '').trim() || null;

    const { error: upErr } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          user_id: userId,
          full_name: fullName,
          email,
        },
        { onConflict: 'user_id' }
      );

    if (upErr) throw upErr;

    send(res, 200, { ok: true });
  } catch (err: unknown) {
    const message = toMessage(err);
    // eslint-disable-next-line no-console
    console.error('orgs/setMemberName failed', { message, err });
    send(res, 500, { error: message });
  }
}
