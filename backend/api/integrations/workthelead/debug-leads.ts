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

  // campaignId is no longer sent to get_Leads.asp — docs say Location Login only needs UserName/Password/FromDate/ToDate

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
  // body: key=encodeURIComponent(value) joined by & — spaces encoded as %20
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

  // Variant where spaces are encoded as + (RFC 1866 form-encoding spec, not encodeURIComponent)
  function plusVariant(label: string, fields: Record<string, string>): Variant {
    function plusEncode(s: string): string {
      return encodeURIComponent(s).replace(/%20/g, '+');
    }
    const body = Object.entries(fields)
      .map(([k, v]) => `${k}=${plusEncode(v)}`)
      .join('&');
    const safeFields = Object.entries(fields)
      .map(([k, v]) => `${k}=${k.toLowerCase().includes('pass') ? '***' : plusEncode(v)}`)
      .join('&');
    return { label, url: `${base}/get_Leads.asp`, safeDesc: `POST ${base}/get_Leads.asp [PLUS-ENCODED] [${safeFields}]`, body };
  }

  // Variant with fully raw/unencoded values — slashes, spaces, colons all literal
  // Some classic ASP servers parse this more leniently
  function rawVariant(label: string, fields: Record<string, string>): Variant {
    const body = Object.entries(fields)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const safeFields = Object.entries(fields)
      .map(([k, v]) => `${k}=${k.toLowerCase().includes('pass') ? '***' : v}`)
      .join('&');
    return { label, url: `${base}/get_Leads.asp`, safeDesc: `POST ${base}/get_Leads.asp [RAW-UNENCODED] [${safeFields}]`, body };
  }

  // CONFIRMED:
  //   Encoded (encodeURIComponent / +) → "Login failed" (ASP can't parse encoded date strings)
  //   Raw unencoded                    → "ToDate is invalid" (auth passes, date format wrong)
  //
  // NEW HYPOTHESIS: 276067 = public RSVP tracking ID (myrsvp.biz/?id=)
  //                 595037 = true internal TeleDirect meeting/campaign ID (from exported file title)
  // Strategy: raw only — test 3 CampaignID groups × best date formats.
  // Also testing date-only (no time) since time portion may be causing parse failures.

  // Best raw date candidates from sweep: M/D/YYYY AM/PM with seconds, plus date-only
  const dates = {
    d16ampm: { FromDate: '5/16/2026 12:00:00 AM', ToDate: '5/16/2026 11:59:59 PM' },
    d17ampm: { FromDate: '5/17/2026 12:00:00 AM', ToDate: '5/17/2026 11:59:59 PM' },
    d16only: { FromDate: '5/16/2026', ToDate: '5/16/2026' },
    d17only: { FromDate: '5/17/2026', ToDate: '5/17/2026' },
  };

  const variants: Variant[] = [
    // ── Auth anchor — no dates, no CampaignID ──
    postVariant('P0: NO-DATES auth anchor (expect ToDate-invalid = auth OK)', {
      UserName: username, Password: password,
    }),

    // ── Group 1: NO CampaignID ──
    rawVariant('NC_A: NO-ID | 5/16 AM/PM seconds', { UserName: username, Password: password, ...dates.d16ampm }),
    rawVariant('NC_E: NO-ID | 5/17 AM/PM seconds (today)', { UserName: username, Password: password, ...dates.d17ampm }),
    rawVariant('NC_D: NO-ID | date-only 5/16', { UserName: username, Password: password, ...dates.d16only }),
    rawVariant('NC_F: NO-ID | date-only 5/17 (today)', { UserName: username, Password: password, ...dates.d17only }),

    // ── Group 2: CampaignID=595037 (internal meeting ID from exported reservation file) ──
    rawVariant('C595_A: ID=595037 | 5/16 AM/PM seconds', { UserName: username, Password: password, CampaignID: '595037', ...dates.d16ampm }),
    rawVariant('C595_E: ID=595037 | 5/17 AM/PM seconds (today)', { UserName: username, Password: password, CampaignID: '595037', ...dates.d17ampm }),
    rawVariant('C595_D: ID=595037 | date-only 5/16', { UserName: username, Password: password, CampaignID: '595037', ...dates.d16only }),
    rawVariant('C595_F: ID=595037 | date-only 5/17 (today)', { UserName: username, Password: password, CampaignID: '595037', ...dates.d17only }),

    // ── Group 3: CampaignID=276067 (public RSVP id — for comparison) ──
    rawVariant('C276_A: ID=276067 | 5/16 AM/PM seconds', { UserName: username, Password: password, CampaignID: '276067', ...dates.d16ampm }),
    rawVariant('C276_E: ID=276067 | 5/17 AM/PM seconds (today)', { UserName: username, Password: password, CampaignID: '276067', ...dates.d17ampm }),
    rawVariant('C276_D: ID=276067 | date-only 5/16', { UserName: username, Password: password, CampaignID: '276067', ...dates.d16only }),
    rawVariant('C276_F: ID=276067 | date-only 5/17 (today)', { UserName: username, Password: password, CampaignID: '276067', ...dates.d17only }),
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
    results.push({ label: controlK.label, safeDesc: controlK.safeDesc, httpStatus: r.status, ...probe(text), rawXml: text.slice(0, 3000), isControl: true });
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
      results.push({ label: v.label, safeDesc: v.safeDesc, httpStatus: r.status, ...probe(text), rawXml: text.slice(0, 3000), isControl: false });
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
