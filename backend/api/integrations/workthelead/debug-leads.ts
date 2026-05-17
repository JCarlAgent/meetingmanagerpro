/**
 * DIAGNOSTIC ONLY — master-admin restricted.
 * Tries POST form-encoded date-range variants for get_Leads.asp.
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

function probe(raw: string): {
  hasLeads: boolean;
  isAuthError: boolean;
  isDateError: boolean;
  hasOtherError: boolean;
  errorType: 'auth' | 'date' | 'other' | null;
  preview: string;
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

  // Date formats to probe
  const dates = {
    mdySlash:  { from: '01/01/2026', to: '12/31/2026' }, // MM/DD/YYYY
    ydmDash:   { from: '2026-01-01', to: '2026-12-31' }, // YYYY-MM-DD
    mdyDash:   { from: '01-01-2026', to: '12-31-2026' }, // MM-DD-YYYY
    yyyymmdd:  { from: '20260101',   to: '20261231'   }, // YYYYMMDD
    // Wide range spanning 2025-2026 in case older records exist
    wide:      { from: '01/01/2025', to: '12/31/2026' }, // MM/DD/YYYY wide
  };

  type Variant = {
    label: string;
    url: string;
    safeDesc: string;
    body: string;
  };

  function postVariant(label: string, fields: Record<string, string>): Variant {
    const body = Object.entries(fields)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
    const safeFields = Object.entries(fields)
      .map(([k, v]) => `${k}=${k.toLowerCase().includes('pass') ? '***' : v}`)
      .join('&');
    return { label, url: `${base}/get_Leads.asp`, safeDesc: `POST ${base}/get_Leads.asp [${safeFields}]`, body };
  }

  const variants: Variant[] = [
    // Baseline — no dates (confirms auth, should still give "ToDate is invalid")
    postVariant('P0: POST CampaignID only (no dates — baseline)', {
      UserName: username, Password: password, CampaignID: campaignId,
    }),

    // ── MM/DD/YYYY (most likely for classic ASP) ──
    postVariant('P1: POST CampaignID+FromDate+ToDate MM/DD/YYYY', {
      UserName: username, Password: password, CampaignID: campaignId,
      FromDate: dates.mdySlash.from, ToDate: dates.mdySlash.to,
    }),
    postVariant('P2: POST CampaignID+StartDate+EndDate MM/DD/YYYY', {
      UserName: username, Password: password, CampaignID: campaignId,
      StartDate: dates.mdySlash.from, EndDate: dates.mdySlash.to,
    }),
    postVariant('P3: POST CampaignID+From+To MM/DD/YYYY', {
      UserName: username, Password: password, CampaignID: campaignId,
      From: dates.mdySlash.from, To: dates.mdySlash.to,
    }),

    // ── YYYY-MM-DD ──
    postVariant('P4: POST CampaignID+FromDate+ToDate YYYY-MM-DD', {
      UserName: username, Password: password, CampaignID: campaignId,
      FromDate: dates.ydmDash.from, ToDate: dates.ydmDash.to,
    }),
    postVariant('P5: POST CampaignID+StartDate+EndDate YYYY-MM-DD', {
      UserName: username, Password: password, CampaignID: campaignId,
      StartDate: dates.ydmDash.from, EndDate: dates.ydmDash.to,
    }),

    // ── MM-DD-YYYY ──
    postVariant('P6: POST CampaignID+FromDate+ToDate MM-DD-YYYY', {
      UserName: username, Password: password, CampaignID: campaignId,
      FromDate: dates.mdyDash.from, ToDate: dates.mdyDash.to,
    }),

    // ── YYYYMMDD ──
    postVariant('P7: POST CampaignID+FromDate+ToDate YYYYMMDD', {
      UserName: username, Password: password, CampaignID: campaignId,
      FromDate: dates.yyyymmdd.from, ToDate: dates.yyyymmdd.to,
    }),

    // ── No CampaignID — date range only (returns all leads?) ──
    postVariant('P8: POST no CampaignID, FromDate+ToDate MM/DD/YYYY only', {
      UserName: username, Password: password,
      FromDate: dates.mdySlash.from, ToDate: dates.mdySlash.to,
    }),

    // ── Wide date range (2025-2026) in case records predate 2026 ──
    postVariant('P9: POST CampaignID+FromDate+ToDate MM/DD/YYYY wide (2025-2026)', {
      UserName: username, Password: password, CampaignID: campaignId,
      FromDate: dates.wide.from, ToDate: dates.wide.to,
    }),

    // ── Lowercase field names ──
    postVariant('P10: POST lowercase campaignid+fromdate+todate MM/DD/YYYY', {
      UserName: username, Password: password, campaignid: campaignId,
      fromdate: dates.mdySlash.from, todate: dates.mdySlash.to,
    }),
  ];

  // Control K — GET get_Campaigns.asp (identical to test.ts — confirms auth is live)
  const controlK = {
    label: 'K: GET get_Campaigns.asp (auth control — identical to Settings test)',
    url: `${base}/get_Campaigns.asp?UserName=${u}&Password=${pw}`,
    safeDesc: `GET ${base}/get_Campaigns.asp?UserName=${u}&Password=***`,
  };

  const results = [];

  // Run control K first
  try {
    const r = await fetch(controlK.url, { method: 'GET' });
    const text = await r.text();
    const p = probe(text);
    const normalized = text.replace(/\s+/g, ' ').trim();
    results.push({
      label: controlK.label,
      safeDesc: controlK.safeDesc,
      httpStatus: r.status,
      ...p,
      isControl: true,
    });
  } catch (e: any) {
    results.push({
      label: controlK.label, safeDesc: controlK.safeDesc, httpStatus: 0,
      hasLeads: false, isAuthError: true, isDateError: false, hasOtherError: false,
      errorType: 'other' as const, preview: `Fetch error: ${e?.message ?? String(e)}`,
      isControl: true,
    });
  }

  // Run all POST variants
  for (const v of variants) {
    try {
      const r = await fetch(v.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: v.body,
      });
      const text = await r.text();
      const p = probe(text);
      results.push({
        label: v.label,
        safeDesc: v.safeDesc,
        httpStatus: r.status,
        ...p,
        isControl: false,
      });
    } catch (e: any) {
      results.push({
        label: v.label, safeDesc: v.safeDesc, httpStatus: 0,
        hasLeads: false, isAuthError: false, isDateError: false, hasOtherError: true,
        errorType: 'other' as const, preview: `Fetch error: ${e?.message ?? String(e)}`,
        isControl: false,
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
}

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
