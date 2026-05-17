/**
 * DIAGNOSTIC ONLY — master-admin restricted.
 * Probes 24-hour daily windows for get_Leads.asp (POST form-encoded).
 * API requires FromDate/ToDate with a window < 25 hours.
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

/** Extract all XML field names and the first raw record for diagnostics */
function parseFirstRecord(raw: string): { fieldNames: string[]; rawFirstRecord: string } {
  // Find any repeating element (heuristic: first tag that appears more than once)
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

  try {
    const username = decryptString(credsData.username_enc);
    const password = decryptString(credsData.password_enc);
    const base = 'https://client.teledirect.com/workthelead/api';

    function postBody(fields: Record<string, string>): string {
      return Object.entries(fields).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    }
    function safeDesc(fields: Record<string, string>): string {
      return Object.entries(fields)
        .map(([k, v]) => `${k}=${k.toLowerCase().includes('pass') ? '***' : v}`).join(' | ');
    }

    // 24-hour daily windows to probe (May 13–17 2026)
    // Two formats: with timestamp (HH:MM:SS) and date-only
    const days = [
      { label: '05/13/2026', from: '05/13/2026 00:00:00', to: '05/13/2026 23:59:59', dateOnly: { from: '05/13/2026', to: '05/14/2026' } },
      { label: '05/14/2026', from: '05/14/2026 00:00:00', to: '05/14/2026 23:59:59', dateOnly: { from: '05/14/2026', to: '05/15/2026' } },
      { label: '05/15/2026', from: '05/15/2026 00:00:00', to: '05/15/2026 23:59:59', dateOnly: { from: '05/15/2026', to: '05/16/2026' } },
      { label: '05/16/2026', from: '05/16/2026 00:00:00', to: '05/16/2026 23:59:59', dateOnly: { from: '05/16/2026', to: '05/17/2026' } },
      { label: '05/17/2026', from: '05/17/2026 00:00:00', to: '05/17/2026 23:59:59', dateOnly: { from: '05/17/2026', to: '05/18/2026' } },
    ];

    type Variant = { label: string; safeDesc: string; body: string };
    const variants: Variant[] = [];

    // With timestamp
    for (const d of days) {
      const fields = { UserName: username, Password: password, CampaignID: campaignId, FromDate: d.from, ToDate: d.to };
      variants.push({ label: `WITH-TIME ${d.label} (FromDate=${d.from} ToDate=${d.to})`, safeDesc: safeDesc(fields), body: postBody(fields) });
    }
    // Date-only (no time component, ToDate = next day)
    for (const d of days) {
      const fields = { UserName: username, Password: password, CampaignID: campaignId, FromDate: d.dateOnly.from, ToDate: d.dateOnly.to };
      variants.push({ label: `DATE-ONLY ${d.label} (FromDate=${d.dateOnly.from} ToDate=${d.dateOnly.to})`, safeDesc: safeDesc(fields), body: postBody(fields) });
    }
    // Also try without CampaignID on the most likely day (today, May 17) — some APIs return all leads for date range
    const todayFields = { UserName: username, Password: password, FromDate: '05/17/2026 00:00:00', ToDate: '05/17/2026 23:59:59' };
    variants.push({ label: 'WITH-TIME 05/17/2026 NO-CAMPAIGNID', safeDesc: safeDesc(todayFields), body: postBody(todayFields) });

    const results: any[] = [];

    // Control K — GET get_Campaigns.asp (identical to Settings Test Connection)
    try {
      const r = await fetch(`${base}/get_Campaigns.asp?UserName=${encodeURIComponent(username)}&Password=${encodeURIComponent(password)}`, { method: 'GET' });
      const text = await r.text();
      results.push({
        label: 'K: GET get_Campaigns.asp (auth control)',
        safeDesc: `GET ${base}/get_Campaigns.asp?UserName=${encodeURIComponent(username)}&Password=***`,
        httpStatus: r.status, ...probe(text), isControl: true,
      });
    } catch (e: any) {
      results.push({
        label: 'K: GET get_Campaigns.asp (auth control)',
        safeDesc: `GET ${base}/get_Campaigns.asp?UserName=${encodeURIComponent(username)}&Password=***`,
        httpStatus: 0, hasLeads: false, isAuthError: false, isDateError: false,
        hasOtherError: true, errorType: 'other', fieldNames: [], rawFirstRecord: '',
        preview: `Fetch exception: ${(e as any)?.message ?? String(e)}`, isControl: true,
      });
    }

    // POST variants — each isolated
    for (const v of variants) {
      try {
        const r = await fetch(`${base}/get_Leads.asp`, {
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
          hasOtherError: true, errorType: 'other', fieldNames: [], rawFirstRecord: '',
          preview: `Fetch exception: ${(e as any)?.message ?? String(e)}`, isControl: false,
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
  } catch (topErr: any) {
    send(res, 500, {
      ok: false,
      error: (topErr as any)?.message ?? String(topErr),
      stack: ((topErr as any)?.stack ?? '').split('\n').slice(0, 3).join(' | '),
    });
  }
}
