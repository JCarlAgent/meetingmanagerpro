import { encryptString } from '../../_lib/crypto';
import { getSupabaseAdmin, requireUserIdFromAuthHeader } from '../../_lib/supabaseAdmin';

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
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

  let userId: string;
  try {
    userId = await requireUserIdFromAuthHeader(req);
  } catch {
    send(res, 401, { error: 'Unauthorized' });
    return;
  }

  let payload: any;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    send(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  const username = (payload?.username ?? '').toString().trim();
  const password = (payload?.password ?? '').toString();

  if (!username || username.length < 2) {
    send(res, 400, { error: 'Username is required' });
    return;
  }
  if (!password || password.length < 4) {
    send(res, 400, { error: 'Password is required' });
    return;
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    const usernameEnc = encryptString(username);
    const passwordEnc = encryptString(password);

    const { error } = await supabaseAdmin
      .from('user_workthelead_credentials')
      .upsert(
        {
          user_id: userId,
          username_enc: usernameEnc,
          password_enc: passwordEnc,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      send(res, 500, { error: 'Failed to save credentials' });
      return;
    }

    send(res, 200, { ok: true });
  } catch (e: any) {
    send(res, 500, { error: e?.message || 'Server error' });
  }
}
