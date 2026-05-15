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

  const campaignId = (payload?.campaignId ?? '').toString().trim();
  if (!campaignId) {
    send(res, 400, { error: 'campaignId is required' });
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
      send(res, 400, { error: 'No TeleDirect credentials saved. Save credentials in Settings first.' });
      return;
    }

    const username = decryptString(data.username_enc);
    const password = decryptString(data.password_enc);

    const baseUrl = 'https://client.teledirect.com/workthelead/api';
    const url = `${baseUrl}/get_Leads.asp?UserName=${encodeURIComponent(username)}&Password=${encodeURIComponent(password)}&CampaignID=${encodeURIComponent(campaignId)}`;

    const resp = await fetch(url, { method: 'GET' });
    const text = await resp.text();

    if (!resp.ok) {
      send(res, 502, {
        ok: false,
        status: resp.status,
        error: `TeleDirect returned HTTP ${resp.status}`,
        bodyPreview: stripXml(text).slice(0, 500),
      });
      return;
    }

    const normalized = stripXml(text);
    const looksXml = normalized.startsWith('<?xml') || normalized.startsWith('<');

    send(res, 200, {
      ok: true,
      looksXml,
      bodyPreview: normalized.slice(0, 2000),
    });
  } catch (e: any) {
    send(res, 500, { error: e?.message || 'Server error' });
  }
}
