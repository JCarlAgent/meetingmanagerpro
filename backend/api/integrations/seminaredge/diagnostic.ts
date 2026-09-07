import { decryptString } from '../../_lib/crypto.js';
import { getSupabaseAdmin, requireUserIdFromAuthHeader } from '../../_lib/supabaseAdmin.js';

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function redact(text: string, username?: string, password?: string) {
  let out = String(text || '');
  if (username) out = out.split(username).join('[REDACTED_USERNAME]');
  if (password) out = out.split(password).join('[REDACTED_PASSWORD]');
  return out;
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
  } catch (e) {
    send(res, 401, { error: 'Unauthorized' });
    return;
  }

  let payload: any;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    payload = {};
  }

  const meetingId = (payload?.meetingId ?? '595037').toString().trim();
  const eventId = (payload?.eventId ?? null) || null;

  const supabaseAdmin = getSupabaseAdmin();
  const { data: credsData, error: credsError } = await supabaseAdmin
    .from('user_seminaredge_credentials')
    .select('username_enc,password_enc')
    .eq('user_id', userId)
    .maybeSingle();

  if (credsError) {
    send(res, 500, { error: 'Failed to read credentials' });
    return;
  }

  const credRecordFound = Boolean(credsData && (credsData.username_enc || credsData.password_enc));
  let username = '';
  let password = '';
  let usernamePresent = false;
  let passwordPresent = false;
  let passwordDecrypted = false;

  if (credRecordFound) {
    try {
      username = decryptString(credsData.username_enc);
      password = decryptString(credsData.password_enc);
      usernamePresent = username.trim().length > 0;
      passwordPresent = password.trim().length > 0;
      passwordDecrypted = true;
    } catch (e: any) {
      // decryption failed — surface safe diagnostic
      usernamePresent = false;
      passwordPresent = false;
      passwordDecrypted = false;
    }
  }

  if (!credRecordFound) {
    send(res, 200, {
      credentials_record_found: false,
      username_present: false,
      password_decrypted: false,
      meetingId: meetingId,
    });
    return;
  }

  // Build TeleDirect URL and call
  const baseUrl = 'https://client.teledirect.com/seminaredge/api/get_AttendeesByMeetingID.asp';
  const url = `${baseUrl}?UserName=${encodeURIComponent(username)}&Password=${encodeURIComponent(password)}&MeetingID=${encodeURIComponent(meetingId)}`;

  let resp: Response;
  let rawText = '';
  try {
    resp = await fetch(url, { method: 'GET' });
    rawText = await resp.text();
  } catch (e: any) {
    send(res, 502, {
      credentials_record_found: true,
      username_present: usernamePresent,
      password_decrypted: passwordDecrypted,
      meetingId,
      request_method: 'GET',
      error: 'Failed to call TeleDirect',
      message: e?.message || 'Unknown fetch error',
    });
    return;
  }

  const contentType = (resp.headers && resp.headers.get ? resp.headers.get('content-type') : '') || '';
  const looksXml = rawText.trim().startsWith('<?xml') || rawText.trim().startsWith('<');
  const lower = rawText.toLowerCase();
  const errorMatch = rawText.match(/<error[^>]*>([\s\S]*?)<\/error>/i);
  const xmlHasError = Boolean(errorMatch) || lower.includes('login failed') || lower.includes('invalid user') || lower.includes('invalid password');
  const xmlErrorMessage = errorMatch ? String(errorMatch[1]).trim() : (lower.includes('login failed') ? 'Login failed' : '');
  const meetingIdReturnedMatch = rawText.match(/\bMeetingID\s*=\s*["']?([0-9A-Za-z-]+)["']?/i);
  const meetingIdReturned = meetingIdReturnedMatch ? String(meetingIdReturnedMatch[1]).trim() : null;

  // Count attendee-like tags as a heuristic for record count
  const tagCandidates = ['Attendee','attendee','Record','record','Lead','lead','Row','row','Item','item'];
  let attendeeCount = 0;
  for (const t of tagCandidates) {
    const re = new RegExp(`<${t}[\\s>\\/]`, 'g');
    const matches = rawText.match(re);
    if (matches && matches.length) attendeeCount += matches.length;
  }

  const safePreview = redact(rawText, username, password).slice(0, 300);

  send(res, 200, {
    credentials_record_found: true,
    username_present: usernamePresent,
    password_decrypted: passwordDecrypted,
    meetingId,
    request_method: 'GET',
    http_status: resp.status,
    content_type: contentType,
    xml_received: looksXml,
    xml_contains_error: xmlHasError,
    xml_error_message: xmlErrorMessage || null,
    attendee_count: attendeeCount,
    meeting_id_returned: meetingIdReturned,
    xml_preview_redacted: safePreview.replace(/\n/g, '\n'),
  });
}
