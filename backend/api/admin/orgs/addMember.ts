import { getSupabaseAdmin, requireUserFromAuthHeader } from '../../_lib/supabaseAdmin';

const ALLOWED_ROLES = new Set(['advisor', 'fmo_admin', 'member', 'org_admin']);

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

  // Supabase JS v2 doesn't have a guaranteed getUserByEmail in all builds.
  // listUsers() is supported; we filter by email.
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

async function inviteUser(email: string): Promise<string> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
  if (error || !data?.user?.id) {
    throw new Error(error?.message || 'Failed to invite user');
  }
  return data.user.id;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const access = await requireMasterAdmin(req);
    if (!access.ok) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }

    const body = (req.body || {}) as { orgId?: string; email?: string; role?: string };
    const orgId = String(body.orgId ?? '').trim();
    const email = String(body.email ?? '').trim();
    const role = String(body.role ?? '').trim();

    if (!orgId) {
      res.status(400).json({ error: 'Missing orgId' });
      return;
    }
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Missing/invalid email' });
      return;
    }
    if (!ALLOWED_ROLES.has(role)) {
      res.status(400).json({ error: `Invalid role. Use one of: ${Array.from(ALLOWED_ROLES).join(', ')}` });
      return;
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Ensure org exists
    const { data: org } = await supabaseAdmin.from('orgs').select('id').eq('id', orgId).maybeSingle();
    if (!org?.id) {
      res.status(404).json({ error: 'Org not found' });
      return;
    }

    let userId = await findUserIdByEmail(email);
    let invited = false;

    if (!userId) {
      userId = await inviteUser(email);
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

    if (upsertErr) throw upsertErr;

    res.status(200).json({ ok: true, invited, member });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}
