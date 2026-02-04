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

    const name = String(body?.name ?? '').trim();
    if (!name) {
      send(res, 400, { error: 'Missing name' });
      return;
    }

    const baseSlug = slugify(body?.slug ? String(body.slug) : name);
    if (!baseSlug) {
      send(res, 400, { error: 'Invalid slug' });
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

    if (error) throw toError(error);

    send(res, 200, { ok: true, org: data });
  } catch (err: unknown) {
    const message = toMessage(err);
    // eslint-disable-next-line no-console
    console.error('orgs/create failed', { message, err });
    send(res, 500, { error: message });
  }
}
