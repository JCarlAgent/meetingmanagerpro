import {
  groupTeleDirectRosterByPrimary,
  parseTeleDirectRosterDetailed,
  TeleDirectRosterPrimary,
} from '../../../src/lib/teleDirectRoster';
import { getSupabaseAdmin, requireUserFromAuthHeader } from '../../_lib/supabaseAdmin.js';

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };

type ReplacePayload = {
  jobId: string;
  eventId: string;
  targetMeetingId?: string | null;
  rosterText: string;
  confirmReplace: boolean;
};

type ReplaceRecord = {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  guests: number;
  cancelled_guest_count: number;
  guest_name: string | null;
  guest_details: Array<{
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    status: string;
    is_cancelled: boolean;
  }>;
  status: string;
  notes: string;
};

const EXPECTED_INITIAL_MEETINGS: Record<string, { meetingId: string; primaryCount: number; guestCount: number; cancelledPrimaryCount: number; cancelledGuestCount: number; totalActiveAttendees: number }> = {
  '05cd651c-e005-42a1-a7de-fc1dee6fb624': {
    meetingId: '601425',
    primaryCount: 13,
    guestCount: 11,
    cancelledPrimaryCount: 0,
    cancelledGuestCount: 1,
    totalActiveAttendees: 23,
  },
  'cff031aa-6ec1-46ef-b153-16e35237fef1': {
    meetingId: '601426',
    primaryCount: 6,
    guestCount: 4,
    cancelledPrimaryCount: 1,
    cancelledGuestCount: 0,
    totalActiveAttendees: 9,
  },
};

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function normalizeNamePart(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');
  return normalized || null;
}

function normalizeContact(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeStatus(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized || 'registered';
}

function validatePayload(payload: any): { ok: true; value: ReplacePayload } | { ok: false; error: string } {
  const jobId = String(payload?.jobId ?? '').trim();
  const eventId = String(payload?.eventId ?? '').trim();
  const rosterText = String(payload?.rosterText ?? '');
  const targetMeetingId = payload?.targetMeetingId == null ? null : String(payload.targetMeetingId).trim();
  const confirmReplace = Boolean(payload?.confirmReplace);

  if (!jobId) return { ok: false, error: 'jobId is required' };
  if (!eventId) return { ok: false, error: 'eventId is required' };
  if (!rosterText.trim()) return { ok: false, error: 'rosterText is required' };
  if (!confirmReplace) return { ok: false, error: 'Explicit replacement confirmation is required.' };

  return {
    ok: true,
    value: {
      jobId,
      eventId,
      targetMeetingId,
      rosterText,
      confirmReplace,
    },
  };
}

async function canAccessJobEvent(args: { userId: string; email: string | null; jobId: string; eventId: string }) {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: job, error: jobErr } = await supabaseAdmin
    .from('jobs')
    .select('id, org_id, created_by_user_id')
    .eq('id', args.jobId)
    .maybeSingle();
  if (jobErr || !job?.id) return { ok: false as const, reason: 'job_not_found' };

  const { data: event, error: eventErr } = await supabaseAdmin
    .from('job_meetings')
    .select('id, job_id, teledirect_meeting_id, event_date')
    .eq('id', args.eventId)
    .eq('job_id', args.jobId)
    .maybeSingle();
  if (eventErr || !event?.id) return { ok: false as const, reason: 'event_not_found_for_job' };

  const { data: ma } = await supabaseAdmin
    .from('master_admins')
    .select('user_id')
    .eq('user_id', args.userId)
    .maybeSingle();
  if (ma?.user_id) return { ok: true as const, reason: 'master_admin', event };

  if (args.email) {
    const { data: adminEmail } = await supabaseAdmin
      .from('admins')
      .select('email')
      .ilike('email', args.email)
      .maybeSingle();
    if (adminEmail?.email) return { ok: true as const, reason: 'legacy_admin_email', event };
  }

  const { data: member } = await supabaseAdmin
    .from('org_members')
    .select('role')
    .eq('org_id', job.org_id)
    .eq('user_id', args.userId)
    .maybeSingle();

  if (!member?.role) return { ok: false as const, reason: 'not_org_member' };
  if (member.role === 'fmo_admin') return { ok: true as const, reason: 'fmo_admin', event };
  if (job.created_by_user_id === args.userId) return { ok: true as const, reason: 'job_owner', event };
  return { ok: false as const, reason: 'advisor_not_owner' };
}

export function buildReplacementRecords(groups: TeleDirectRosterPrimary[], meetingDate: string | null): ReplaceRecord[] {
  return groups.map((primary) => {
    const firstName = normalizeNamePart(primary.firstName);
    const lastName = normalizeNamePart(primary.lastName);
    if (!firstName || !lastName) {
      throw new Error(`Primary row ${primary.rowIndex + 1} is missing first/last name.`);
    }

    const normalizedGuests = primary.guests.map((guest) => ({
      first_name: normalizeNamePart(guest.firstName),
      last_name: normalizeNamePart(guest.lastName),
      full_name: normalizeNamePart(guest.fullName),
      status: normalizeStatus(guest.status),
      is_cancelled: Boolean(guest.isCancelled),
    }));

    const activeGuests = normalizedGuests.filter((guest) => !guest.is_cancelled).length;
    const cancelledGuestCount = normalizedGuests.filter((guest) => guest.is_cancelled).length;
    const firstNamedGuest = normalizedGuests.find((guest) => guest.full_name)?.full_name ?? null;
    const status = normalizeStatus(primary.status);
    const dateNote = meetingDate ? `MeetingDate=${meetingDate}` : 'MeetingDate=unknown';

    return {
      first_name: firstName,
      last_name: lastName,
      email: normalizeContact(primary.email),
      phone: normalizeContact(primary.phone),
      guests: activeGuests,
      cancelled_guest_count: cancelledGuestCount,
      guest_name: firstNamedGuest,
      guest_details: normalizedGuests,
      status,
      notes: `TeleDirect roster replacement import | ${dateNote}`,
    };
  });
}

export function validateExpectedCounts(args: {
  eventId: string;
  eventMeetingId: string | null;
  preview: {
    primaryCount: number;
    guestCount: number;
    cancelledPrimaryCount: number;
    cancelledGuestCount: number;
    totalActiveAttendees: number;
  };
}) {
  const expectation = EXPECTED_INITIAL_MEETINGS[args.eventId];
  if (!expectation) return;
  if ((args.eventMeetingId ?? '') !== expectation.meetingId) {
    throw new Error('Selected meeting does not match expected TeleDirect meeting ID for protected initial import.');
  }
  if (args.preview.primaryCount !== expectation.primaryCount) throw new Error(`Roster primary count mismatch. Expected ${expectation.primaryCount}.`);
  if (args.preview.guestCount !== expectation.guestCount) throw new Error(`Roster guest count mismatch. Expected ${expectation.guestCount}.`);
  if (args.preview.cancelledPrimaryCount !== expectation.cancelledPrimaryCount) throw new Error(`Roster cancelled primary count mismatch. Expected ${expectation.cancelledPrimaryCount}.`);
  if (args.preview.cancelledGuestCount !== expectation.cancelledGuestCount) throw new Error(`Roster cancelled guest count mismatch. Expected ${expectation.cancelledGuestCount}.`);
  if (args.preview.totalActiveAttendees !== expectation.totalActiveAttendees) throw new Error(`Roster active attendee count mismatch. Expected ${expectation.totalActiveAttendees}.`);
}

export async function executeRosterReplacement(args: {
  supabaseAdmin: any;
  jobId: string;
  eventId: string;
  rows: ReplaceRecord[];
  actorUserId: string;
  requestId: string;
}) {
  const { data: result, error: replaceErr } = await args.supabaseAdmin.rpc('replace_event_responders_from_teledirect', {
    p_job_id: args.jobId,
    p_event_id: args.eventId,
    p_rows: args.rows,
    p_actor_user_id: args.actorUserId,
    p_request_id: args.requestId,
  });

  if (replaceErr) {
    throw new Error(`Roster replacement failed: ${replaceErr.message}`);
  }

  const insertedCount = Number(result?.insertedCount ?? 0);
  if (insertedCount !== args.rows.length) {
    throw new Error(`Roster replacement inserted ${insertedCount} rows; expected ${args.rows.length}.`);
  }

  return result ?? null;
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

  let user: { id: string; email: string | null };
  try {
    user = await requireUserFromAuthHeader(req);
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

  const validated = validatePayload(payload);
  if (!validated.ok) {
    send(res, 400, { error: validated.error });
    return;
  }

  const { jobId, eventId, targetMeetingId, rosterText } = validated.value;
  const access = await canAccessJobEvent({ userId: user.id, email: user.email, jobId, eventId });
  if (!access.ok) {
    send(res, 403, { error: 'Not authorized for this event', reason: access.reason });
    return;
  }

  const eventMeetingId = normalizeContact(access.event.teledirect_meeting_id);
  const eventDate = normalizeContact(access.event.event_date);
  if (targetMeetingId && eventMeetingId && targetMeetingId !== eventMeetingId) {
    send(res, 400, { error: `Selected meeting mismatch. Expected TeleDirect meeting ID ${eventMeetingId}.` });
    return;
  }

  let parsed;
  try {
    parsed = parseTeleDirectRosterDetailed(rosterText);
  } catch (error: any) {
    send(res, 400, { error: error?.message || 'Unable to parse TeleDirect roster text.' });
    return;
  }

  if (!parsed.attendees.length || !parsed.preview.primaryCount) {
    send(res, 400, { error: 'Roster file did not contain attendee rows.' });
    return;
  }

  let groups: TeleDirectRosterPrimary[];
  try {
    groups = groupTeleDirectRosterByPrimary(parsed.attendees);
  } catch (error: any) {
    send(res, 400, { error: error?.message || 'Roster contains malformed attendee/guest relationships.' });
    return;
  }

  try {
    validateExpectedCounts({
      eventId,
      eventMeetingId,
      preview: parsed.preview,
    });
  } catch (error: any) {
    send(res, 400, { error: error?.message || 'Roster count validation failed.' });
    return;
  }

  let records: ReplaceRecord[];
  try {
    records = buildReplacementRecords(groups, eventDate);
  } catch (error: any) {
    send(res, 400, { error: error?.message || 'Unable to build roster replacement records.' });
    return;
  }

  const requestId = `${eventId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const supabaseAdmin = getSupabaseAdmin();
  let result: any;
  try {
    result = await executeRosterReplacement({
      supabaseAdmin,
      jobId,
      eventId,
      rows: records,
      actorUserId: user.id,
      requestId,
    });
  } catch (error: any) {
    send(res, 500, { error: error?.message || 'Roster replacement failed.' });
    return;
  }

  send(res, 200, {
    ok: true,
    eventId,
    jobId,
    targetMeetingId: eventMeetingId,
    targetMeetingDate: eventDate,
    rosterMeetingIdProvided: parsed.preview.meetingId ?? null,
    rosterMeetingIdVerified: parsed.preview.meetingId != null && eventMeetingId != null && String(parsed.preview.meetingId).trim() === String(eventMeetingId).trim(),
    rosterSummary: parsed.preview,
    replacementSummary: result ?? null,
    readOnly: false,
  });
}
