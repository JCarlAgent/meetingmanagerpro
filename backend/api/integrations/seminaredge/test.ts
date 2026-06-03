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

  let payload: any;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    payload = {};
  }

  const meetingId = (payload?.meetingId ?? '').toString().trim();
  const seminarId = (payload?.seminarId ?? '').toString().trim();

  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from('user_seminaredge_credentials')
      .select('username_enc,password_enc')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      send(res, 500, { error: 'Failed to read credentials' });
      return;
    }

    if (!data?.username_enc || !data?.password_enc) {
      send(res, 400, {
        error: 'No Seminar Edge credentials saved yet',
        credentialSource: 'user_seminaredge_credentials',
      });
      return;
    }

    const username = decryptString(data.username_enc);
    const password = decryptString(data.password_enc);

    const diagnostics = {
      usernamePresent: username.trim().length > 0,
      passwordPresent: password.trim().length > 0,
      usernameLength: username.trim().length,
      passwordLength: password.trim().length,
      authParamNamesUsed: ['UserName', 'Password'],
      credentialSource: 'user_seminaredge_credentials',
      requestMethod: 'GET',
    };

    if (!diagnostics.usernamePresent || !diagnostics.passwordPresent) {
      send(res, 200, {
        ok: false,
        usernamePreview: usernamePreview(username),
        testedRemote: false,
        message: 'Saved Seminar Edge credentials are blank after decrypt. Re-save credentials in Settings.',
        ...diagnostics,
      });
      return;
    }

    if (!meetingId && !seminarId) {
      send(res, 200, {
        ok: true,
        testedRemote: false,
        usernamePreview: usernamePreview(username),
        message: 'Seminar Edge credentials are present and decrypted. Add a Meeting ID or Seminar ID to perform a remote auth test.',
        ...diagnostics,
      });
      return;
    }

    const baseUrl = 'https://client.teledirect.com/seminaredge/api';
    const byMeeting = !!meetingId;
    const endpoint = byMeeting ? 'get_AttendeesByMeetingID.asp' : 'get_AttendeesBySeminarID.asp';
    const idKey = byMeeting ? 'MeetingID' : 'SeminarID';
    const idValue = byMeeting ? meetingId : seminarId;

    const qs = [
      `UserName=${encodeURIComponent(username)}`,
      `Password=${encodeURIComponent(password)}`,
      `${idKey}=${encodeURIComponent(idValue)}`,
    ].join('&');

    const safeQs = [
      `UserName=${encodeURIComponent(usernamePreview(username))}`,
      'Password=***',
      `${idKey}=${encodeURIComponent(idValue)}`,
    ].join('&');

    const url = `${baseUrl}/${endpoint}?${qs}`;
    const safeUrl = `${baseUrl}/${endpoint}?${safeQs}`;

    const resp = await fetch(url, { method: 'GET' });
    const text = await resp.text();
    const normalized = stripXml(text);
    const lower = normalized.toLowerCase();
    const bodyHasError =
      lower.includes('<error>') ||
      lower.includes('login failed') ||
      lower.includes('invalid user') ||
      lower.includes('invalid password');

    if (!resp.ok || bodyHasError) {
      send(res, 200, {
        ok: false,
        testedRemote: true,
        endpoint,
        safeUrl,
        httpStatus: resp.status,
        usernamePreview: usernamePreview(username),
        errorInBody: bodyHasError,
        rawPreview: normalized.slice(0, 600),
        message: bodyHasError
          ? 'Seminar Edge returned an XML error body. Credentials are likely wrong or not Seminar Edge credentials.'
          : `HTTP ${resp.status} from Seminar Edge`,
        ...diagnostics,
      });
      return;
    }

    send(res, 200, {
      ok: true,
      testedRemote: true,
      endpoint,
      safeUrl,
      httpStatus: resp.status,
      usernamePreview: usernamePreview(username),
      errorInBody: false,
      rawPreview: normalized.slice(0, 600),
      message: 'Seminar Edge remote auth test returned XML with no error.',
      ...diagnostics,
    });
  } catch (e: any) {
    send(res, 500, { error: e?.message || 'Server error' });
  }
}
