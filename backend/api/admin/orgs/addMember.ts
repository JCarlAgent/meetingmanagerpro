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

const ALLOWED_ROLES = new Set(['advisor', 'fmo_admin', 'member', 'org_admin']);

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
  if (await isMasterAdmin(user)) return { ok: true as const, isMaster: true as const };

  const supabaseAdmin = getSupabaseAdmin();
  const { data } = await supabaseAdmin
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  const role = String((data as any)?.role ?? '');
  const ok = role === 'fmo_admin' || role === 'org_admin';
  return { ok, isMaster: false as const };
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const supabaseAdmin = getSupabaseAdmin();

  // Supabase JS v2 doesn't have a guaranteed getUserByEmail in all builds.
  // listUsers() is supported; we filter by email.
  const target = email.toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message || 'Failed to list users');
    }

    const users = data?.users || [];
    const user = users.find((u) => (u.email || '').toLowerCase() === target);
    if (user?.id) return user.id;

    if (users.length < perPage) break;
  }
  return null;
}

function inferBaseUrl(req: any): string {
  const origin = (req?.headers?.origin as string | undefined) || '';
  if (origin) return origin;

  const proto = (req?.headers?.['x-forwarded-proto'] as string | undefined) || 'https';
  const host =
    (req?.headers?.['x-forwarded-host'] as string | undefined) ||
    (req?.headers?.host as string | undefined) ||
    '';
  if (!host) return '';
  return `${proto}://${host}`;
}

async function inviteUser(email: string, redirectTo?: string): Promise<string> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined);
  if (error || !data?.user?.id) {
    throw new Error(error?.message || 'Failed to invite user');
  }
  return data.user.id;
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
    const email = String(body?.email ?? '').trim();
    const role = String(body?.role ?? '').trim();
    const fullName = String(body?.fullName ?? '').trim();
    const phone = String(body?.phone ?? '').trim();

    if (!orgId) {
      send(res, 400, { error: 'Missing orgId' });
      return;
    }
    if (!email || !email.includes('@')) {
      send(res, 400, { error: 'Missing/invalid email' });
      return;
    }
    if (!ALLOWED_ROLES.has(role)) {
      send(res, 400, { error: `Invalid role. Use one of: ${Array.from(ALLOWED_ROLES).join(', ')}` });
      return;
    }

    if (fullName && fullName.length > 120) {
      send(res, 400, { error: 'Full name too long' });
      return;
    }
    if (phone && phone.length > 40) {
      send(res, 400, { error: 'Phone number too long' });
      return;
    }

    const access = await canManageOrgMembers(user, orgId);
    if (!access.ok) {
      send(res, 403, { error: 'Not authorized' });
      return;
    }

    // Org admins can only add advisors/members to their org.
    if (!access.isMaster && role !== 'advisor' && role !== 'member') {
      send(res, 403, { error: 'Only master admins can assign admin roles' });
      return;
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Ensure org exists
    const { data: org } = await supabaseAdmin.from('orgs').select('id').eq('id', orgId).maybeSingle();
    if (!org?.id) {
      send(res, 404, { error: 'Org not found' });
      return;
    }

    let userId = await findUserIdByEmail(email);
    let invited = false;

    if (!userId) {
      const baseUrl = inferBaseUrl(req);
      const redirectTo = baseUrl ? `${baseUrl}/reset-password` : undefined;
      userId = await inviteUser(email, redirectTo);
      invited = true;
    }

    const tryUpsert = async (nextRole: string) => {
      return supabaseAdmin
        .from('org_members')
        .upsert({ org_id: orgId, user_id: userId, role: nextRole }, { onConflict: 'org_id,user_id' })
        .select('org_id, user_id, role, created_at')
        .single();
    };

    let { data: member, error: upsertErr } = await tryUpsert(role);

    // Backward-compat: older installs used member/org_admin.
    if (upsertErr && /check constraint|violates check constraint/i.test(upsertErr.message || '')) {
      const mapped = role === 'fmo_admin' ? 'org_admin' : role === 'advisor' ? 'member' : role;
      ({ data: member, error: upsertErr } = await tryUpsert(mapped));
    }

    if (upsertErr) throw toError(upsertErr);

    // Best-effort: write profile fields for display (name/phone) if provided.
    // This lets the FMO dashboard show advisor names even when auth metadata lacks them.
    let profileUpdated = false;
    let profileError: string | null = null;
    try {
      if ((fullName || phone) && userId) {
        const payload: any = {
          user_id: userId,
          email: email || null,
        };
        if (fullName) payload.full_name = fullName;
        if (phone) payload.phone = phone;

        const { error: profErr } = await supabaseAdmin.from('profiles').upsert(payload, { onConflict: 'user_id' });
        if (profErr) {
          profileError = profErr.message || 'Failed to update profile';
        } else {
          profileUpdated = true;
        }
      }
    } catch (e: any) {
      profileError = e?.message || 'Failed to update profile';
    }

    send(res, 200, { ok: true, invited, member, profileUpdated, profileError });
  } catch (err: unknown) {
    const message = toMessage(err);
    // eslint-disable-next-line no-console
    console.error('orgs/addMember failed', { message, err });
    send(res, 500, { error: message });
  }
}
