/**
 * DIAGNOSTIC ONLY — master-admin restricted.
 * Tries POST form-encoded date-range variants for get_Leads.asp.
 * Does NOT insert any responders.
 * Remove once working format is confirmed.
 */
import { decryptString } from '../../_lib/crypto.js';
import { getSupabaseAdmin, requireUserIdFromAuthHeader } from '../../_lib/supabaseAdmin.js';

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function probe(raw: string): {
  hasLeads: boolean; isAuthError: boolean; isDateError: boolean;
  hasOtherError: boolean; errorType: 'auth' | 'date' | 'other' | null; preview: string;
} {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  const lower = normalized.toLowerCase();
  const isAuthError = lower.includes('login failed') || lower.includes('invalid user') ||
    (lower.includes('<error>') && (lower.includes('login') || lower.includes('user')));
  const isDateError = lower.includes('<error>') && (
    lower.includes('date') || lower.includes('fromdate') || lower.includes('todate') ||
    lower.includes('startdate') || lower.includes('enddate')
  );
  const hasOtherError = lower.includes('<error>') && !isAuthError && !isDateError;
  const hasLeads = !isAuthError && !isDateError && !hasOtherError && (
    lower.includes('<firstname>') || lower.includes('<first_name>') ||
    lower.includes('<phone>') || lower.includes('<lastname>') ||
    lower.includes('<last_name>') || lower.includes('<email>') ||
    (normalized.match(/<[A-Za-z]+>/g) ?? []).length > 8
  );
  const errorType = isAuthError ? 'auth' : isDateError ? 'date' : hasOtherError ? 'other' : null;
  return { hasLeads, isAuthError, isDateError, hasOtherError, errorType, preview: normalized.slice(0, 400) };
}

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed' }); return; }

  let userId: string;
  try { userId = await requireUserIdFromAuthHeader(req); }
  catch { send(res, 401, { error: 'Unauthorized' }); return; }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: maRow } = await supabaseAdmin
    .from('master_admins').select('user_id').eq('user_id', userId).maybeSingle();
  if (!maRow?.user_id) { send(res, 403, { error: 'Master admin only' }); return; }

  let payload: any;
  try { payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { send(res, 400, { error: 'Invalid JSON body' }); return; }

  const campaignId = (payload?.campaignId ?? '').toString().trim();
  if (!campaignId) { send(res, 400, { error: 'campaignId is required' }); return; }

  const { data: credsData } = await supabaseAdmin
    .from('user_workthelead_credentials').select('username_enc,password_enc')
    .eq('user_id', userId).maybeSingle();
  if (!credsData?.username_enc || !credsData?.password_enc) {
    send(res, 400, { error: 'No credentials saved' }); return;
  }

  try {
    const username = decryptString(credsData.username_enc);
    const password = decryptString(credsData.password_enc);
    const base = 'https://client.teledirect.com/workthelead/api';
    const u = encodeURIComponent(username);
    const pw = encodeURIComponent(password);
    const cid = encodeURIComponent(campaignId);

    function postVariant(label: string, fields: Record<string, string>) {
      const body = Object.entries(fields).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
      const safeFields = Object.entries(fields)
        .map(([k, v]) => `${k}=${k.toLowerCase().includes('pass') ? '***' : v}`).join('&');
      return { label, url: `${base}/get_Leads.asp`, safeDesc: `POST [${safeFields}]`, body };
    }

    const mdy  = { from: '01/01/2026', to: '12/31/2026' };
    const iso  = { from: '2026-01-01', to: '2026-12-31' };
    const dash = { from: '01-01-2026', to: '12-31-2026' };
    const num  = { from: '20260101',   to: '20261231'   };
    const wide = { from: '01/01/2025', to: '12/31/2026' };

    const variants = [
      postVariant('P0: POST CampaignID only (no dates)',
        { UserName: username, Password: password, CampaignID: campaignId }),
      postVariant('P1: POST FromDate+ToDate MM/DD/YYYY',
        { UserName: username, Password: password, CampaignID: campaignId, FromDate: mdy.from, ToDate: mdy.to }),
      postVariant('P2: POST StartDate+EndDate MM/DD/YYYY',
        { UserName: username, Password: password, CampaignID: campaignId, StartDate: mdy.from, EndDate: mdy.to }),
      postVariant('P3: POST From+To MM/DD/YYYY',
        { UserName: username, Password: password, CampaignID: campaignId, From: mdy.from, To: mdy.to }),
      postVariant('P4: POST FromDate+ToDate YYYY-MM-DD',
        { UserName: username, Password: password, CampaignID: campaignId, FromDate: iso.from, ToDate: iso.to }),
      postVariant('P5: POST StartDate+EndDate YYYY-MM-DD',
        { UserName: username, Password: password, CampaignID: campaignId, StartDate: iso.from, EndDate: iso.to }),
      postVariant('P6: POST FromDate+ToDate MM-DD-YYYY',
        { UserName: username, Password: password, CampaignID: campaignId, FromDate: dash.from, ToDate: dash.to }),
      postVariant('P7: POST FromDate+ToDate YYYYMMDD',
        { UserName: username, Password: password, CampaignID: campaignId, FromDate: num.from, ToDate: num.to }),
      postVariant('P8: POST no CampaignID, FromDate+ToDate MM/DD/YYYY',
        { UserName: username, Password: password, FromDate: mdy.from, ToDate: mdy.to }),
      postVariant('P9: POST FromDate+ToDate MM/DD/YYYY wide 2025-2026',
        { UserName: username, Password: password, CampaignID: campaignId, FromDate: wide.from, ToDate: wide.to }),
      postVariant('P10: POST lowercase campaignid+fromdate+todate MM/DD/YYYY',
        { UserName: username, Password: password, campaignid: campaignId, fromdate: mdy.from, todate: mdy.to }),
    ];

    const results: any[] = [];

    // Control K — GET get_Campaigns.asp (identical to Settings Test Connection)
    try {
      const r = await fetch(`${base}/get_Campaigns.asp?UserName=${u}&Password=${pw}`, { method: 'GET' });
      const text = await r.text();
      results.push({
        label: 'K: GET get_Campaigns.asp (auth control)',
        safeDesc: `GET ${base}/get_Campaigns.asp?UserName=${u}&Password=***`,
        httpStatus: r.status, ...probe(text), isControl: true,
      });
    } catch (e: any) {
      results.push({
        label: 'K: GET get_Campaigns.asp (auth control)',
        safeDesc: `GET ${base}/get_Campaigns.asp?UserName=${u}&Password=***`,
        httpStatus: 0, hasLeads: false, isAuthError: false, isDateError: false,
        hasOtherError: true, errorType: 'other',
        preview: `Fetch exception: ${e?.message ?? String(e)}`, isControl: true,
      });
    }

    // POST variants — each isolated
    for (const v of variants) {
      try {
        const r = await fetch(v.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: v.body,
        });
        const text = await r.text();
        results.push({ label: v.label, safeDesc: v.safeDesc, httpStatus: r.status, ...probe(text), isControl: false });
      } catch (e: any) {
        results.push({
          label: v.label, safeDesc: v.safeDesc, httpStatus: 0,
          hasLeads: false, isAuthError: false, isDateError: false,
          hasOtherError: true, errorType: 'other',
          preview: `Fetch exception: ${e?.message ?? String(e)}`, isControl: false,
        });
      }
    }

    const winner = results.find(r => r.hasLeads) ?? null;
    send(res, 200, {
      ok: true,
      winner: winner?.label ?? null,
      usernamePreview: `${username.slice(0, 2)}***${username.slice(-2)}`,
      results,
    });
  } catch (topErr: any) {
    send(res, 500, {
      ok: false,
      error: topErr?.message ?? String(topErr),
      stack: (topErr?.stack ?? '').split('\n').slice(0, 3).join(' | '),
    });
  }
}
