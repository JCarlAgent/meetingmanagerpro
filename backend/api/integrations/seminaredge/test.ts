import https from 'node:https';
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

function extractTeleDirectError(xml: string): string | null {
  const match = xml.match(/<Error[^>]*>([\s\S]*?)<\/Error>/i) || xml.match(/<error[^>]*>([\s\S]*?)<\/error>/i);
  if (!match || !match[1]) return null;
  return String(match[1]).replace(/<[^>]+>/g, '').trim();
}

function extractReturnedMeetingId(xml: string): string | null {
  const match = xml.match(/<MeetingID[^>]*>([\s\S]*?)<\/MeetingID>/i) || xml.match(/MeetingID\s*=\s*["']?([0-9A-Za-z-]+)["']?/i);
  if (!match || !match[1]) return null;
  return String(match[1]).replace(/<[^>]+>/g, '').trim();
}

function countAttendees(xml: string): number {
  const matches = xml.match(/<Attendee\b/gi) || [];
  return matches.length;
}

function legacyUrlEncodedBody(username: string, password: string, meetingId: string) {
  return new URLSearchParams({
    UserName: username,
    Password: password,
    MeetingID: meetingId,
  }).toString();
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
      requestMethod: 'GET',
      requestBodyType: 'application/x-www-form-urlencoded',
      credentialSource: 'user_seminaredge_credentials',
    };

    if (!username.trim() || !password.trim()) {
      send(res, 200, {
        ok: false,
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
        message: 'Seminar Edge credentials are present and decrypted. Add a Meeting ID or Seminar ID to perform a remote auth test.',
        ...diagnostics,
      });
      return;
    }

    const legacyUrl = 'https://client.teledirect.com/seminaredge/api/get_AttendeesByMeetingID.asp';
    const legacyBody = legacyUrlEncodedBody(username, password, meetingId || seminarId);
    const legacyBodyLength = Buffer.byteLength(legacyBody, 'utf8');

    let httpStatus = 0;
    let contentType = '';
    let responseText = '';
    let bodyWasSent = false;

    try {
      await new Promise<void>((resolve, reject) => {
        const req = https.request(
          legacyUrl,
          {
            method: 'GET',
            headers: {
              Accept: 'text/xml, application/xml, */*',
              'User-Agent': 'Mozilla/5.0 (compatible; MeetingsManagerPRO/1.0; diagnostics)',
              Connection: 'close',
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': String(legacyBodyLength),
            },
          },
          (res) => {
            httpStatus = res.statusCode ?? 0;
            contentType = String(res.headers['content-type'] || '');

            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
            res.on('end', () => {
              responseText = Buffer.concat(chunks).toString('utf8');
              resolve();
            });
            res.on('error', reject);
          },
        );

        req.on('error', reject);
        req.write(legacyBody);
        bodyWasSent = true;
        req.end();
      });
    } catch (e: any) {
      send(res, 200, {
        ok: false,
        testedRemote: true,
        requestMethod: 'GET',
        requestBodySent: bodyWasSent,
        requestBodyByteLength: legacyBodyLength,
        httpStatus: 0,
        contentType: null,
        returnedMeetingId: null,
        xmlReceived: false,
        teleDirectError: 'Request failed before receiving a response from TeleDirect.',
        attendeeCount: null,
        message: e?.message || 'Legacy Seminar Edge request failed',
      });
      return;
    }

    const normalized = stripXml(responseText);
    const lower = normalized.toLowerCase();
    const teleDirectError = extractTeleDirectError(normalized);
    const xmlReceived = normalized.length > 0 && (normalized.startsWith('<?xml') || normalized.startsWith('<'));
    const bodyHasError =
      !!teleDirectError ||
      lower.includes('<error>') ||
      lower.includes('login failed') ||
      lower.includes('invalid user') ||
      lower.includes('invalid password');
    const returnedMeetingId = extractReturnedMeetingId(normalized);
    const attendeeCount = xmlReceived && !bodyHasError ? countAttendees(normalized) : 0;

    if (bodyHasError || httpStatus >= 400) {
      send(res, 200, {
        ok: false,
        testedRemote: true,
        requestMethod: 'GET',
        requestBodySent: bodyWasSent,
        requestBodyByteLength: legacyBodyLength,
        httpStatus,
        contentType,
        returnedMeetingId: returnedMeetingId || null,
        xmlReceived,
        teleDirectError: teleDirectError ? `TeleDirect error: ${teleDirectError}` : (bodyHasError ? 'TeleDirect returned an XML error body.' : null),
        attendeeCount: null,
        message: teleDirectError ? `TeleDirect error: ${teleDirectError}` : 'Seminar Edge returned an XML error body.',
      });
      return;
    }

    send(res, 200, {
      ok: true,
      testedRemote: true,
      requestMethod: 'GET',
      requestBodySent: bodyWasSent,
      requestBodyByteLength: legacyBodyLength,
      httpStatus,
      contentType,
      returnedMeetingId: returnedMeetingId || null,
      xmlReceived,
      teleDirectError: null,
      attendeeCount: attendeeCount || 0,
      message: 'Legacy Seminar Edge request completed successfully.',
    });
  } catch (e: any) {
    send(res, 500, { error: e?.message || 'Server error' });
  }
}
