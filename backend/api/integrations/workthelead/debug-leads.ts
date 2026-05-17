/**
 * DIAGNOSTIC ONLY — master-admin restricted.
 * Probes TeleDirect get_Leads.asp with 24-hour daily window variants.
 * POST form-encoded — exact body style from commit 1a65abf (which produced DATE error, not AUTH error).
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

/** Extract field names and raw first record from XML for diagnostics */
function parseFirstRecord(raw: string): { fieldNames: string[]; rawFirstRecord: string } {
  const tagCounts: Record<string, number> = {};
  const tagRe = /<([A-Za-z][A-Za-z0-9_]*)[\s>/]/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(raw)) !== null) tagCounts[m[1]] = (tagCounts[m[1]] ?? 0) + 1;
  const repeating = Object.entries(tagCounts).filter(([, c]) => c > 1).map(([t]) => t);
  const rootTags = new Set(['Leads', 'leads', 'Records', 'Results', 'Root', 'Data', 'Response', 'Rows']);
  const container = repeating.find(t => !rootTags.has(t)) ?? repeating[0] ?? '';
  if (!container) return { fieldNames: [], rawFirstRecord: '' };
  const blockMatch = new RegExp(`<${container}[\\s>][\\s\\S]*?<\\/${container}>`, 'i').exec(raw);
  if (!blockMatch) return { fieldNames: [], rawFirstRecord: '' };
  const block = blockMatch[0];
  const fields = [...block.matchAll(/<([A-Za-z_][A-Za-z0-9_.]*)(?:\s[^>]*)?>([^<]*)<\/\1>/g)].map(x => x[1]);
  return { fieldNames: [...new Set(fields)], rawFirstRecord: block.slice(0, 800) };
}

function probe(raw: string): {
  hasLeads: boolean; isAuthError: boolean; isDateError: boolean;
  hasOtherError: boolean; errorType: 'auth' | 'date' | 'other' | null;
  preview: string; fieldNames: string[]; rawFirstRecord: string;
} {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  const lower = normalized.toLowerCase();
  const isAuthError = lower.includes('login failed') || lower.includes('invalid user') ||
    (lower.includes('<error>') && (lower.includes('login') || lower.includes('user')));
  const isDateError = lower.includes('<error>') && (
    lower.includes('date') || lower.includes('hours') || lower.includes('fromdate') ||
    lower.includes('todate') || lower.includes('startdate') || lower.includes('enddate')
  );
  const hasOtherError = lower.includes('<error>') && !isAuthError && !isDateError;
  const hasLeads = !isAuthError && !isDateError && !hasOtherError && (
    lower.includes('<firstname>') || lower.includes('<first_name>') ||
    lower.includes('<phone>') || lower.includes('<lastname>') ||
    lower.includes('<last_name>') || lower.includes('<email>') ||
    (normalized.match(/<[A-Za-z]+>/g) ?? []).length > 8
  );
  const errorType = isAuthError ? 'auth' : isDateError ? 'date' : hasOtherError ? 'other' : null;
  const { fieldNames, rawFirstRecord } = hasLeads ? parseFirstRecord(raw) : { fieldNames: [], rawFirstRecord: '' };
  return { hasLeads, isAuthError, isDateError, hasOtherError, errorType, preview: normalized.slice(0, 400), fieldNames, rawFirstRecord };
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

  // Decrypt credentials at handler scope — SAME as 1a65abf (not wrapped in try).
  // .trim() guards against trailing newlines from decryption.
  const username = decryptString(credsData.username_enc).trim();
  const password = decryptString(credsData.password_enc).trim();
  const base = 'https://client.teledirect.com/workthelead/api';

  // --- EXACT postVariant function from commit 1a65abf ---
  // body: key=encodeURIComponent(value) joined by &
  // safeDesc: same but password replaced with ***
  type Variant = { label: string; url: string; safeDesc: string; body: string };

  function postVariant(label: string, fields: Record<string, string>): Variant {
    const body = Object.entries(fields)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
    const safeFields = Object.entries(fields)
      .map(([k, v]) => `${k}=${k.toLowerCase().includes('pass') ? '***' : encodeURIComponent(v)}`)
      .join('&');
    return { label, url: `${base}/get_Leads.asp`, safeDesc: `POST ${base}/get_Leads.asp [${safeFields}]`, body };
  }

  const variants: Variant[] = [
    // P0 — NO dates, baseline. Previously returned "ToDate is invalid" (auth succeeded).
    // If this now returns AUTH error, credentials have changed/expired.
    postVariant('P0: NO-DATES baseline (auth check — expect ToDate error if creds valid)', {
      UserName: username, Password: password, CampaignID: campaignId,
    }),

    // DATE-ONLY variants — MM/DD/YYYY, 24-hour window (same day to next day = exactly 24h)
    postVariant('P1: DATE-ONLY 05/13→05/14', {
      UserName: username, Password: password, CampaignID: campaignId,
      FromDate: '05/13/2026', ToDate: '05/14/2026',
    }),
    postVariant('P2: DATE-ONLY 05/14→05/15', {
      UserName: username, Password: password, CampaignID: campaignId,
      FromDate: '05/14/2026', ToDate: '05/15/2026',
    }),
    postVariant('P3: DATE-ONLY 05/15→05/16', {
      UserName: username, Password: password, CampaignID: campaignId,
      FromDate: '05/15/2026', ToDate: '05/16/2026',
    }),
    postVariant('P4: DATE-ONLY 05/16→05/17', {
      UserName: username, Password: password, CampaignID: campaignId,
      FromDate: '05/16/2026', ToDate: '05/17/2026',
    }),
    postVariant('P5: DATE-ONLY 05/17→05/18', {
      UserName: username, Password: password, CampaignID: campaignId,
      FromDate: '05/17/2026', ToDate: '05/18/2026',
    }),

    // Exact 23-hour timestamp window (confirmed < 25h limit)
    postVariant('P6: 23-HOUR TIMESTAMP 05/15 00:00:00 → 23:00:00', {
      UserName: username, Password: password, CampaignID: campaignId,
      FromDate: '05/15/2026 00:00:00', ToDate: '05/15/2026 23:00:00',
    }),

    // Wide date range that previously triggered "must be less than 25 hours" — confirms auth OK, date check active
    postVariant('P7: WIDE-RANGE auth-confirm MM/DD/YYYY (01/01→12/31/2026)', {
      UserName: username, Password: password, CampaignID: campaignId,
      FromDate: '01/01/2026', ToDate: '12/31/2026',
    }),

    // No CampaignID — does the API return all leads for a date range?
    postVariant('P8: DATE-ONLY 05/17→05/18 NO-CAMPAIGNID', {
      UserName: username, Password: password,
      FromDate: '05/17/2026', ToDate: '05/18/2026',
    }),
  ];

  // Control K — GET get_Campaigns.asp (same as Settings Test Connection)
  const u = encodeURIComponent(username);
  const pw = encodeURIComponent(password);
  const controlK = {
    label: 'K: GET get_Campaigns.asp (auth control — same as Settings test)',
    url: `${base}/get_Campaigns.asp?UserName=${u}&Password=${pw}`,
    safeDesc: `GET ${base}/get_Campaigns.asp?UserName=${u}&Password=***`,
  };

  const results: any[] = [];

  // Control K first
  try {
    const r = await fetch(controlK.url, { method: 'GET' });
    const text = await r.text();
    results.push({ label: controlK.label, safeDesc: controlK.safeDesc, httpStatus: r.status, ...probe(text), isControl: true });
  } catch (e: any) {
    results.push({
      label: controlK.label, safeDesc: controlK.safeDesc, httpStatus: 0,
      hasLeads: false, isAuthError: false, isDateError: false, hasOtherError: true,
      errorType: 'other' as const, fieldNames: [], rawFirstRecord: '',
      preview: `Fetch error: ${e?.message ?? String(e)}`, isControl: true,
    });
  }

  // POST variants — each individually try/catched (exact pattern from 1a65abf)
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
        hasLeads: false, isAuthError: false, isDateError: false, hasOtherError: true,
        errorType: 'other' as const, fieldNames: [], rawFirstRecord: '',
        preview: `Fetch error: ${e?.message ?? String(e)}`, isControl: false,
      });
    }
  }

  const winner = results.find(r => r.hasLeads) ?? null;
  send(res, 200, {
    ok: true,
    winner: winner?.label ?? null,
    winnerFieldNames: winner?.fieldNames ?? [],
    winnerRawFirstRecord: winner?.rawFirstRecord ?? '',
    usernamePreview: `${username.slice(0, 2)}***${username.slice(-2)}`,
    results,
  });
}
