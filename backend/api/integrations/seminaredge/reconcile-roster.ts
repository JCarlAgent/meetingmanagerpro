import { getSupabaseAdmin, requireUserFromAuthHeader } from '../../_lib/supabaseAdmin.js';

type RosterRow = {
  attendeeType: 'A' | 'G';
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  isCancelled: boolean;
  primaryRosterIndex: number | null;
};

type ReconcilePayload = {
  jobId: string;
  eventId: string;
  roster: {
    meetingId: string | null;
    rows: RosterRow[];
  };
};

type ExistingResponder = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  guests: number | null;
  guest_name: string | null;
  status: string | null;
};

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function normalizeNamePart(value: string | null | undefined): string | null {
  const cleaned = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9'\- ]+/g, ' ')
    .replace(/\s+/g, ' ');
  return cleaned || null;
}

function normalizeFullName(firstName: string | null | undefined, lastName: string | null | undefined): string | null {
  const first = normalizeNamePart(firstName);
  const last = normalizeNamePart(lastName);
  if (!first || !last) return null;
  return `${first}|${last}`;
}

function normalizePhone(value: string | null | undefined): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 7 ? digits : null;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const cleaned = String(value ?? '').trim().toLowerCase();
  return cleaned || null;
}

function splitGuestNames(value: string | null | undefined): string[] {
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  return raw
    .split(/[;,/&]|(?:\sand\s)|\n/gi)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((name) => {
      const tokens = name.replace(/\s+/g, ' ').split(' ').filter(Boolean);
      if (tokens.length < 2) return '';
      return normalizeFullName(tokens[0], tokens.slice(1).join(' ')) ?? '';
    })
    .filter(Boolean);
}

function isCancelledStatus(value: string | null | undefined): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'cancelled' || normalized === 'canceled';
}

type PrimaryMatch = {
  matchedResponderIds: Set<string>;
  matchedPrimaryCount: number;
  newPrimaryCount: number;
  updateNeededCount: number;
  cancelledNeedsUpdateCount: number;
  ambiguousCount: number;
};

function evaluatePrimaryMatches(primaries: RosterRow[], responders: ExistingResponder[]): PrimaryMatch {
  const matchedResponderIds = new Set<string>();
  let matchedPrimaryCount = 0;
  let newPrimaryCount = 0;
  let updateNeededCount = 0;
  let cancelledNeedsUpdateCount = 0;
  let ambiguousCount = 0;

  for (const primary of primaries) {
    const rosterName = normalizeFullName(primary.firstName, primary.lastName);
    const rosterPhone = normalizePhone(primary.phone);
    const rosterEmail = normalizeEmail(primary.email);

    const strongMatches = responders.filter((existing) => {
      const existingPhone = normalizePhone(existing.phone);
      const existingEmail = normalizeEmail(existing.email);
      const existingLast = normalizeNamePart(existing.last_name);
      const rosterLast = normalizeNamePart(primary.lastName);
      const emailStrong = Boolean(rosterEmail && existingEmail && rosterEmail === existingEmail);
      const phoneStrong = Boolean(rosterPhone && existingPhone && rosterPhone === existingPhone && rosterLast && existingLast && rosterLast === existingLast);
      return emailStrong || phoneStrong;
    });

    if (strongMatches.length > 1) {
      ambiguousCount += 1;
      continue;
    }

    if (strongMatches.length === 0) {
      const weakNameMatches = responders.filter((existing) => rosterName && normalizeFullName(existing.first_name, existing.last_name) === rosterName);
      if (weakNameMatches.length > 0) {
        ambiguousCount += 1;
      } else {
        newPrimaryCount += 1;
      }
      continue;
    }

    const existing = strongMatches[0];
    matchedPrimaryCount += 1;
    matchedResponderIds.add(existing.id);

    const existingStatusCancelled = isCancelledStatus(existing.status);
    if (primary.isCancelled && !existingStatusCancelled) {
      cancelledNeedsUpdateCount += 1;
    }

    if (!primary.isCancelled) {
      const existingPhone = normalizePhone(existing.phone);
      const existingEmail = normalizeEmail(existing.email);
      const rosterHasContact = Boolean(rosterPhone || rosterEmail);
      const existingMissingContact = Boolean((rosterPhone && !existingPhone) || (rosterEmail && !existingEmail));
      if (rosterHasContact && existingMissingContact) {
        updateNeededCount += 1;
      }
    }
  }

  return {
    matchedResponderIds,
    matchedPrimaryCount,
    newPrimaryCount,
    updateNeededCount,
    cancelledNeedsUpdateCount,
    ambiguousCount,
  };
}

type GuestMatch = {
  representedGuestCount: number;
  guestAttachmentsNeededCount: number;
  guestAsPrimaryResponderIds: Set<string>;
  ambiguousCount: number;
};

function evaluateGuestMatches(guests: RosterRow[], responders: ExistingResponder[], matchedPrimaryResponderIds: Set<string>): GuestMatch {
  const representedGuestCount = 0;
  let represented = 0;
  let guestAttachmentsNeededCount = 0;
  const guestAsPrimaryResponderIds = new Set<string>();
  let ambiguousCount = 0;

  const responderGuestNameIndex = new Map<string, Set<string>>();
  for (const responder of responders) {
    const guestNames = splitGuestNames(responder.guest_name);
    for (const guestName of guestNames) {
      const set = responderGuestNameIndex.get(guestName) ?? new Set<string>();
      set.add(responder.id);
      responderGuestNameIndex.set(guestName, set);
    }
  }

  for (const guest of guests) {
    const guestName = normalizeFullName(guest.firstName, guest.lastName);
    if (!guestName) {
      ambiguousCount += 1;
      continue;
    }

    const nameMatches = responders.filter((existing) => normalizeFullName(existing.first_name, existing.last_name) === guestName);
    const guestMetaMatches = responderGuestNameIndex.get(guestName) ?? new Set<string>();

    const nameMatchIds = new Set(nameMatches.map((row) => row.id));
    const combinedIds = new Set<string>([...nameMatchIds, ...Array.from(guestMetaMatches)]);

    if (combinedIds.size > 1 && guestMetaMatches.size === 0) {
      ambiguousCount += 1;
      continue;
    }

    if (combinedIds.size === 0) {
      guestAttachmentsNeededCount += 1;
      continue;
    }

    represented += 1;
    for (const responderId of nameMatchIds) {
      if (!matchedPrimaryResponderIds.has(responderId)) {
        guestAsPrimaryResponderIds.add(responderId);
      }
    }
  }

  return {
    representedGuestCount: representedGuestCount + represented,
    guestAttachmentsNeededCount,
    guestAsPrimaryResponderIds,
    ambiguousCount,
  };
}

function buildDuplicateSummary(responders: ExistingResponder[]) {
  const groupByIdentity = new Map<string, number>();
  for (const row of responders) {
    const nameKey = normalizeFullName(row.first_name, row.last_name) ?? 'name:unknown';
    const phoneKey = normalizePhone(row.phone);
    const emailKey = normalizeEmail(row.email);
    const key = phoneKey
      ? `${nameKey}|phone:${phoneKey}`
      : emailKey
        ? `${nameKey}|email:${emailKey}`
        : `${nameKey}|contact:none`;
    groupByIdentity.set(key, (groupByIdentity.get(key) ?? 0) + 1);
  }

  let rowsInDuplicateGroups = 0;
  let excessDuplicateRows = 0;
  for (const size of groupByIdentity.values()) {
    if (size > 1) {
      rowsInDuplicateGroups += size;
      excessDuplicateRows += size - 1;
    }
  }

  return {
    distinctIdentities: groupByIdentity.size,
    rowsInDuplicateGroups,
    excessDuplicateRows,
  };
}

export function reconcileRosterReadOnly(args: { rosterRows: RosterRow[]; responders: ExistingResponder[] }) {
  const rosterRows = args.rosterRows.filter((row) => row.attendeeType === 'A' || row.attendeeType === 'G');
  const primaries = rosterRows.filter((row) => row.attendeeType === 'A');
  const guests = rosterRows.filter((row) => row.attendeeType === 'G');

  const cancelledPrimaryCount = primaries.filter((row) => row.isCancelled).length;
  const cancelledGuestCount = guests.filter((row) => row.isCancelled).length;
  const activePrimaryCount = primaries.length - cancelledPrimaryCount;
  const activeGuestCount = guests.length - cancelledGuestCount;

  const duplicateSummary = buildDuplicateSummary(args.responders);
  const primaryMatch = evaluatePrimaryMatches(primaries, args.responders);
  const guestMatch = evaluateGuestMatches(guests, args.responders, primaryMatch.matchedResponderIds);

  const ambiguousCount = primaryMatch.ambiguousCount + guestMatch.ambiguousCount;

  return {
    readOnly: true,
    rosterSummary: {
      primaryRegistrants: primaries.length,
      guestRecords: guests.length,
      cancelledPrimaryCount,
      cancelledGuestCount,
      activeAttendees: activePrimaryCount + activeGuestCount,
    },
    databaseSummary: {
      responderRows: args.responders.length,
      distinctIdentities: duplicateSummary.distinctIdentities,
      rowsInDuplicateGroups: duplicateSummary.rowsInDuplicateGroups,
      excessDuplicateRows: duplicateSummary.excessDuplicateRows,
      guestAsPrimaryRecords: guestMatch.guestAsPrimaryResponderIds.size,
    },
    proposedReconciliation: {
      primaryAlreadyRepresented: primaryMatch.matchedPrimaryCount,
      newPrimaryRecordsNeeded: primaryMatch.newPrimaryCount,
      existingPrimaryNeedingUpdates: primaryMatch.updateNeededCount,
      guestRecordsToAttach: guestMatch.guestAttachmentsNeededCount,
      guestAsPrimaryRowsRequiringCleanup: guestMatch.guestAsPrimaryResponderIds.size,
      duplicateRowsRequiringCleanup: duplicateSummary.excessDuplicateRows,
      cancelledRecordsRequiringStatusUpdates: primaryMatch.cancelledNeedsUpdateCount,
      ambiguousMatchesRequiringManualReview: ambiguousCount,
      representedGuestRecords: guestMatch.representedGuestCount,
      expectedCanonicalPrimaryCount: primaries.length,
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
  if (jobErr || !job?.id) {
    return { ok: false as const, reason: 'job_not_found' };
  }

  const { data: event, error: eventErr } = await supabaseAdmin
    .from('job_meetings')
    .select('id, job_id')
    .eq('id', args.eventId)
    .eq('job_id', args.jobId)
    .maybeSingle();
  if (eventErr || !event?.id) {
    return { ok: false as const, reason: 'event_not_found_for_job' };
  }

  const { data: ma } = await supabaseAdmin
    .from('master_admins')
    .select('user_id')
    .eq('user_id', args.userId)
    .maybeSingle();
  if (ma?.user_id) return { ok: true as const, reason: 'master_admin', orgId: job.org_id };

  if (args.email) {
    const { data: adminEmail } = await supabaseAdmin
      .from('admins')
      .select('email')
      .ilike('email', args.email)
      .maybeSingle();
    if (adminEmail?.email) return { ok: true as const, reason: 'legacy_admin_email', orgId: job.org_id };
  }

  const { data: member } = await supabaseAdmin
    .from('org_members')
    .select('role')
    .eq('org_id', job.org_id)
    .eq('user_id', args.userId)
    .maybeSingle();

  if (!member?.role) return { ok: false as const, reason: 'not_org_member' };
  if (member.role === 'fmo_admin') return { ok: true as const, reason: 'fmo_admin', orgId: job.org_id };
  if (job.created_by_user_id === args.userId) return { ok: true as const, reason: 'job_owner', orgId: job.org_id };

  return { ok: false as const, reason: 'advisor_not_owner' };
}

function validatePayload(payload: any): { ok: true; value: ReconcilePayload } | { ok: false; error: string } {
  const jobId = String(payload?.jobId ?? '').trim();
  const eventId = String(payload?.eventId ?? '').trim();
  const rosterRows = Array.isArray(payload?.roster?.rows) ? payload.roster.rows : null;
  const meetingId = payload?.roster?.meetingId == null ? null : String(payload.roster.meetingId).trim() || null;

  if (!jobId) return { ok: false, error: 'jobId is required' };
  if (!eventId) return { ok: false, error: 'eventId is required' };
  if (!rosterRows) return { ok: false, error: 'roster.rows must be an array' };
  if (rosterRows.length === 0) return { ok: false, error: 'roster.rows cannot be empty' };
  if (rosterRows.length > 2000) return { ok: false, error: 'roster.rows exceeds maximum size' };

  const normalizedRows: RosterRow[] = [];
  for (const row of rosterRows) {
    const attendeeType = row?.attendeeType === 'A' || row?.attendeeType === 'G' ? row.attendeeType : null;
    if (!attendeeType) continue;
    normalizedRows.push({
      attendeeType,
      firstName: normalizeNamePart(row?.firstName) ? String(row.firstName).trim() : null,
      lastName: normalizeNamePart(row?.lastName) ? String(row.lastName).trim() : null,
      fullName: normalizeNamePart(row?.fullName) ? String(row.fullName).trim() : null,
      phone: normalizePhone(row?.phone),
      email: normalizeEmail(row?.email),
      status: String(row?.status ?? '').trim().toLowerCase() || 'registered',
      isCancelled: Boolean(row?.isCancelled) || isCancelledStatus(row?.status),
      primaryRosterIndex: typeof row?.primaryRosterIndex === 'number' ? row.primaryRosterIndex : null,
    });
  }

  if (!normalizedRows.length) {
    return { ok: false, error: 'roster.rows does not contain valid A/G attendee data' };
  }

  return {
    ok: true,
    value: {
      jobId,
      eventId,
      roster: {
        meetingId,
        rows: normalizedRows,
      },
    },
  };
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

  const { jobId, eventId, roster } = validated.value;
  const access = await canAccessJobEvent({ userId: user.id, email: user.email, jobId, eventId });
  if (!access.ok) {
    send(res, 403, { error: 'Not authorized for this event', reason: access.reason });
    return;
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: responders, error: responderErr } = await supabaseAdmin
    .from('responders')
    .select('id, first_name, last_name, phone, email, guests, guest_name, status')
    .eq('campaign_id', jobId)
    .eq('event_id', eventId);

  if (responderErr) {
    send(res, 500, { error: `Failed to query responders: ${responderErr.message}` });
    return;
  }

  const summary = reconcileRosterReadOnly({
    rosterRows: roster.rows,
    responders: Array.isArray(responders) ? (responders as ExistingResponder[]) : [],
  });

  send(res, 200, {
    ok: true,
    readOnly: true,
    eventId,
    jobId,
    rosterMeetingIdProvided: roster.meetingId,
    rosterMeetingIdVerified: false,
    ...summary,
  });
}
