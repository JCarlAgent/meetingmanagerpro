import { getSupabaseAdmin, requireUserFromAuthHeader } from '../../_lib/supabaseAdmin';

function slugify(raw: string) {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
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

    const body = (req.body || {}) as { name?: string; slug?: string };
    const name = String(body.name ?? '').trim();
    if (!name) {
      res.status(400).json({ error: 'Missing name' });
      return;
    }

    const baseSlug = slugify(body.slug ? String(body.slug) : name);
    if (!baseSlug) {
      res.status(400).json({ error: 'Invalid slug' });
      return;
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Try insert; on unique conflict, retry with suffix
    const tryInsert = async (slug: string) => {
      return supabaseAdmin
        .from('orgs')
        .insert({ name, slug })
        .select('id, name, slug, created_at')
        .single();
    };

    let { data, error } = await tryInsert(baseSlug);

    if (error && /duplicate key|unique/i.test(error.message || '')) {
      const suffix = Math.random().toString(36).slice(2, 6);
      ({ data, error } = await tryInsert(`${baseSlug}-${suffix}`));
    }

    if (error) throw error;

    res.status(200).json({ ok: true, org: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    // eslint-disable-next-line no-console
    console.error('orgs/create failed', { message, err });
    res.status(500).json({ error: message });
  }
}
