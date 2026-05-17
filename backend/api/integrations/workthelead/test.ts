import { decryptString } from '../../_lib/crypto.js';
import { getSupabaseAdmin, requireUserIdFromAuthHeader } from '../../_lib/supabaseAdmin.js';

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function stripXml(xml: string) {
  return xml.replace(/\s+/g, ' ').trim();
}

function usernamePreview(u: string): string {
  if (u.length <= 4) return '***';
  return `${u.slice(0, 2)}***${u.slice(-2)}`;
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

  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from('user_workthelead_credentials')
      .select('username_enc,password_enc')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      send(res, 500, { error: 'Failed to read credentials' });
      return;
    }

    if (!data?.username_enc || !data?.password_enc) {
      send(res, 400, { error: 'No credentials saved yet' });
      return;
    }

    const username = decryptString(data.username_enc);
    const password = decryptString(data.password_enc);
    const preview = usernamePreview(username);

    const baseUrl = 'https://client.teledirect.com/workthelead/api';
    const url = `${baseUrl}/get_Campaigns.asp?UserName=${encodeURIComponent(username)}&Password=${encodeURIComponent(password)}`;
    const safeUrl = `${baseUrl}/get_Campaigns.asp?UserName=${encodeURIComponent(username)}&Password=***`;

    const resp = await fetch(url, { method: 'GET' });
    const text = await resp.text();
    const normalized = stripXml(text);
    const looksXml = normalized.startsWith('<?xml') || normalized.startsWith('<');
    const lower = normalized.toLowerCase();
    // TeleDirect returns HTTP 200 even for auth failures — must check body content
    const bodyHasError = lower.includes('<error>') || lower.includes('login failed') || lower.includes('invalid user');

    if (!resp.ok || bodyHasError) {
      send(res, 200, {
        ok: false,
        httpStatus: resp.status,
        usernamePreview: preview,
        safeUrl,
        looksXml,
        errorInBody: bodyHasError,
        rawPreview: normalized.slice(0, 500),
        message: bodyHasError
          ? 'TeleDirect returned an error in the XML body (HTTP 200 but auth failed). Credentials are likely wrong or expired.'
          : `HTTP ${resp.status} from TeleDirect`,
      });
      return;
    }

    send(res, 200, {
      ok: true,
      httpStatus: resp.status,
      usernamePreview: preview,
      safeUrl,
      looksXml,
      errorInBody: false,
      rawPreview: normalized.slice(0, 500),
      message: 'Connection successful — TeleDirect returned valid XML with no error.',
    });
  } catch (e: any) {
    send(res, 500, { error: e?.message || 'Server error' });
  }
}
