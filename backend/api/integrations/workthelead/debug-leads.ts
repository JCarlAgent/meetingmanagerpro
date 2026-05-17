/**
 * DIAGNOSTIC ONLY — master-admin restricted.
 * Tries multiple get_Leads.asp query/body shapes to find the correct format.
 * Does NOT insert any responders.
 * Remove or disable once working format is confirmed.
 */
import { decryptString } from '../../_lib/crypto.js';
import { getSupabaseAdmin, requireUserIdFromAuthHeader } from '../../_lib/supabaseAdmin.js';

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function probe(raw: string): { hasError: boolean; hasLeads: boolean; preview: string } {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  const lower = normalized.toLowerCase();
  const hasError = lower.includes('<error>') || lower.includes('login failed') || lower.includes('invalid');
  // "has leads" = some repeating element with name/phone-like child content
  const hasLeads = !hasError && (
    lower.includes('<firstname>') || lower.includes('<first_name>') ||
    lower.includes('<phone>') || lower.includes('<lastname>') ||
    lower.includes('<last_name>') || lower.includes('<email>') ||
    // Anything that isn't just a wrapper/error response
    (normalized.match(/<[A-Za-z]+>/g) ?? []).length > 6
  );
  return { hasError, hasLeads, preview: normalized.slice(0, 300) };
}

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed' }); return; }

  let userId: string;
  try {
    userId = await requireUserIdFromAuthHeader(req);
  } catch {
    send(res, 401, { error: 'Unauthorized' }); return;
  }

  // Master-admin guard — checks master_admins table (same pattern as admin routes)
  const supabaseAdmin = getSupabaseAdmin();
  const { data: maRow } = await supabaseAdmin
    .from('master_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!maRow?.user_id) {
    send(res, 403, { error: 'Master admin only' }); return;
  }

  let payload: any;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    send(res, 400, { error: 'Invalid JSON body' }); return;
  }

  const campaignId = (payload?.campaignId ?? '').toString().trim();
  if (!campaignId) { send(res, 400, { error: 'campaignId is required' }); return; }

  const { data: credsData } = await supabaseAdmin
    .from('user_workthelead_credentials')
    .select('username_enc,password_enc')
    .eq('user_id', userId)
    .maybeSingle();

  if (!credsData?.username_enc || !credsData?.password_enc) {
    send(res, 400, { error: 'No credentials saved' }); return;
  }

  const username = decryptString(credsData.username_enc);
  const password = decryptString(credsData.password_enc);
  const base = 'https://client.teledirect.com/workthelead/api';
  const u = encodeURIComponent(username);
  const pw = encodeURIComponent(password);
  const cid = encodeURIComponent(campaignId);

  type Variant = {
    label: string;
    method: 'GET' | 'POST';
    url: string;
    safeUrl: string;
    body?: string;
    contentType?: string;
  };

  const variants: Variant[] = [
    // A — current shape (what we know fails)
    {
      label: 'A: GET UserName+Password+CampaignID (current)',
      method: 'GET',
      url: `${base}/get_Leads.asp?UserName=${u}&Password=${pw}&CampaignID=${cid}`,
      safeUrl: `${base}/get_Leads.asp?UserName=${u}&Password=***&CampaignID=${cid}`,
    },
    // B — lowercase param names
    {
      label: 'B: GET username+password+CampaignID (lowercase)',
      method: 'GET',
      url: `${base}/get_Leads.asp?username=${u}&password=${pw}&CampaignID=${cid}`,
      safeUrl: `${base}/get_Leads.asp?username=${u}&password=***&CampaignID=${cid}`,
    },
    // C — CampaignId (mixed case)
    {
      label: 'C: GET UserName+Password+CampaignId',
      method: 'GET',
      url: `${base}/get_Leads.asp?UserName=${u}&Password=${pw}&CampaignId=${cid}`,
      safeUrl: `${base}/get_Leads.asp?UserName=${u}&Password=***&CampaignId=${cid}`,
    },
    // D — all lowercase campaign param
    {
      label: 'D: GET UserName+Password+campaignid',
      method: 'GET',
      url: `${base}/get_Leads.asp?UserName=${u}&Password=${pw}&campaignid=${cid}`,
      safeUrl: `${base}/get_Leads.asp?UserName=${u}&Password=***&campaignid=${cid}`,
    },
    // E — ClientCampaignID
    {
      label: 'E: GET UserName+Password+ClientCampaignID',
      method: 'GET',
      url: `${base}/get_Leads.asp?UserName=${u}&Password=${pw}&ClientCampaignID=${cid}`,
      safeUrl: `${base}/get_Leads.asp?UserName=${u}&Password=***&ClientCampaignID=${cid}`,
    },
    // F — Campaign
    {
      label: 'F: GET UserName+Password+Campaign',
      method: 'GET',
      url: `${base}/get_Leads.asp?UserName=${u}&Password=${pw}&Campaign=${cid}`,
      safeUrl: `${base}/get_Leads.asp?UserName=${u}&Password=***&Campaign=${cid}`,
    },
    // G — ListID
    {
      label: 'G: GET UserName+Password+ListID',
      method: 'GET',
      url: `${base}/get_Leads.asp?UserName=${u}&Password=${pw}&ListID=${cid}`,
      safeUrl: `${base}/get_Leads.asp?UserName=${u}&Password=***&ListID=${cid}`,
    },
    // H — no campaign filter at all
    {
      label: 'H: GET UserName+Password only (no campaign)',
      method: 'GET',
      url: `${base}/get_Leads.asp?UserName=${u}&Password=${pw}`,
      safeUrl: `${base}/get_Leads.asp?UserName=${u}&Password=***`,
    },
    // I — POST with form body
    {
      label: 'I: POST form-encoded UserName+Password+CampaignID',
      method: 'POST',
      url: `${base}/get_Leads.asp`,
      safeUrl: `${base}/get_Leads.asp [POST body: UserName=${u}&Password=***&CampaignID=${cid}]`,
      body: `UserName=${u}&Password=${pw}&CampaignID=${cid}`,
      contentType: 'application/x-www-form-urlencoded',
    },
    // J — Login / Pwd alternative param names (some ASP APIs)
    {
      label: 'J: GET Login+Pwd+CampaignID',
      method: 'GET',
      url: `${base}/get_Leads.asp?Login=${u}&Pwd=${pw}&CampaignID=${cid}`,
      safeUrl: `${base}/get_Leads.asp?Login=${u}&Pwd=***&CampaignID=${cid}`,
    },
    // K — same as get_Campaigns.asp auth + CampaignID (confirming base auth works at same endpoint)
    {
      label: 'K: GET Campaigns endpoint with same creds (control)',
      method: 'GET',
      url: `${base}/get_Campaigns.asp?UserName=${u}&Password=${pw}`,
      safeUrl: `${base}/get_Campaigns.asp?UserName=${u}&Password=***`,
    },
  ];

  const results = [];

  for (const v of variants) {
    try {
      const fetchOpts: RequestInit = { method: v.method };
      if (v.method === 'POST' && v.body) {
        fetchOpts.body = v.body;
        fetchOpts.headers = { 'Content-Type': v.contentType ?? 'application/x-www-form-urlencoded' };
      }
      const r = await fetch(v.url, fetchOpts);
      const text = await r.text();
      const { hasError, hasLeads, preview } = probe(text);
      results.push({
        label: v.label,
        safeUrl: v.safeUrl,
        httpStatus: r.status,
        hasError,
        hasLeads,
        preview,
      });
    } catch (e: any) {
      results.push({
        label: v.label,
        safeUrl: v.safeUrl,
        httpStatus: 0,
        hasError: true,
        hasLeads: false,
        preview: `Fetch error: ${e?.message ?? String(e)}`,
      });
    }
  }

  // Highlight any variant that looks like it worked
  const winner = results.find(r => r.hasLeads) ?? null;

  send(res, 200, {
    ok: true,
    winner: winner?.label ?? null,
    results,
  });
}
