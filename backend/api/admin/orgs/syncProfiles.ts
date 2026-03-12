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

function pickMetadataName(meta: any): string {
  if (!meta || typeof meta !== 'object') return '';

  const fullName = String(meta.full_name || meta.fullName || '').trim();
  if (fullName) return fullName;

  const name = String(meta.name || meta.display_name || meta.displayName || '').trim();
  if (name) return name;

  const first = String(meta.first_name || meta.firstName || meta.given_name || meta.givenName || '').trim();
  const last = String(meta.last_name || meta.lastName || meta.family_name || meta.familyName || '').trim();
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;

  return '';
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
    if (!orgId) {
      send(res, 400, { error: 'Missing orgId' });
      return;
    }

    const allowed = await canManageOrgMembers(user, orgId);
    if (!allowed) {
      send(res, 403, { error: 'Not authorized' });
      return;
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: members, error: memErr } = await supabaseAdmin
      .from('org_members')
      .select('user_id, role')
      .eq('org_id', orgId)
      .in('role', ['advisor', 'member'])
      .limit(5000);

    if (memErr) throw memErr;

    const userIds = Array.from(new Set(((members ?? []) as any[]).map((m) => String(m.user_id))));
    if (!userIds.length) {
      send(res, 200, { ok: true, updated: 0 });
      return;
    }

    const { data: profileRows, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('user_id, full_name, email')
      .in('user_id', userIds)
      .limit(5000);

    if (profErr) throw profErr;

    const existingById = new Map<string, { full_name: string | null; email: string | null }>();
    for (const p of (profileRows ?? []) as any[]) {
      existingById.set(String(p.user_id), {
        full_name: (p.full_name ?? null) as any,
        email: (p.email ?? null) as any,
      });
    }

    const toUpsert: any[] = [];
    for (const id of userIds) {
      const existing = existingById.get(id);
      const hasName = !!String(existing?.full_name ?? '').trim();
      if (hasName) continue;

      const authUser: any = await getAuthUserSafe(supabaseAdmin, id);
      const email = String(authUser?.email ?? existing?.email ?? '').trim() || null;
      const metaName = pickMetadataName(authUser?.user_metadata ?? null);
      const fullName = metaName || null;

      if (!fullName && !email) continue;

      toUpsert.push({
        user_id: id,
        full_name: fullName,
        email,
      });
    }

    if (!toUpsert.length) {
      send(res, 200, { ok: true, updated: 0 });
      return;
    }

    const { error: upErr } = await supabaseAdmin.from('profiles').upsert(toUpsert, { onConflict: 'user_id' });
    if (upErr) throw upErr;

    send(res, 200, { ok: true, updated: toUpsert.length });
  } catch (err: unknown) {
    const message = toMessage(err);
    // eslint-disable-next-line no-console
    console.error('orgs/syncProfiles failed', { message, err });
    send(res, 500, { error: message });
  }
}
