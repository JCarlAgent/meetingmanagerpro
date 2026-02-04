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

async function canViewOrgMembers(user: { id: string; email: string | null }, orgId: string) {
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
  // Prefer getUserById when available.
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

  // Fallback: listUsers (page-limited) and match.
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw error;
    const user = (data?.users || []).find((u: any) => u?.id === userId);
    return user ?? null;
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
    if (!orgId) {
      send(res, 400, { error: 'Missing orgId' });
      return;
    }

    const allowed = await canViewOrgMembers(user, orgId);
    if (!allowed) {
      send(res, 403, { error: 'Not authorized' });
      return;
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: members, error: memErr } = await supabaseAdmin
      .from('org_members')
      .select('org_id, user_id, role, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (memErr) throw memErr;

    const rows = (members ?? []) as Array<{ org_id: string; user_id: string; role: string; created_at: string }>;

    const uniqueUserIds = Array.from(new Set(rows.map((m) => m.user_id)));
    const userEntries = await Promise.all(
      uniqueUserIds.map(async (id) => {
        const authUser = await getAuthUserSafe(supabaseAdmin, id);
        return [id, authUser] as const;
      })
    );

    const byId = new Map(userEntries);

    const enriched = rows.map((m) => {
      const u: any = byId.get(m.user_id);
      return {
        ...m,
        user: u
          ? {
              id: u.id,
              email: u.email ?? null,
              created_at: u.created_at ?? null,
              last_sign_in_at: u.last_sign_in_at ?? null,
              user_metadata: u.user_metadata ?? null,
              app_metadata: u.app_metadata ?? null,
            }
          : null,
      };
    });

    send(res, 200, { ok: true, members: enriched });
  } catch (err: unknown) {
    const message = toMessage(err);
    // eslint-disable-next-line no-console
    console.error('orgs/members failed', { message, err });
    send(res, 500, { error: message });
  }
}
