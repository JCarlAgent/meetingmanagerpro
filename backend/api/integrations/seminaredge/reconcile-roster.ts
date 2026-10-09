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
  matchedPrimaryResponderIds: Set<string>;
  matchedPrimaryResponderIdByRosterIndex: Map<number, string>;
  matchedPrimaryCount: number;
  newPrimaryCount: number;
  updateNeededCount: number;
  cancelledNeedsUpdateCount: number;
  ambiguousPrimaryCount: number;
};

function evaluatePrimaryMatches(primaries: RosterRow[], responders: ExistingResponder[]): PrimaryMatch {
  const matchedPrimaryResponderIds = new Set<string>();
  const matchedPrimaryResponderIdByRosterIndex = new Map<number, string>();
  let matchedPrimaryCount = 0;
  let newPrimaryCount = 0;
  let updateNeededCount = 0;
  let cancelledNeedsUpdateCount = 0;
  let ambiguousPrimaryCount = 0;

  for (const primary of primaries) {
    const primaryRosterIndex = typeof primary.primaryRosterIndex === 'number' ? primary.primaryRosterIndex : null;
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
      ambiguousPrimaryCount += 1;
      continue;
    }

    if (strongMatches.length === 0) {
      const weakNameMatches = responders.filter((existing) => rosterName && normalizeFullName(existing.first_name, existing.last_name) === rosterName);
      if (weakNameMatches.length > 0) {
        ambiguousPrimaryCount += 1;
      } else {
        newPrimaryCount += 1;
      }
      continue;
    }

    const existing = strongMatches[0];
    matchedPrimaryCount += 1;
    matchedPrimaryResponderIds.add(existing.id);
    if (primaryRosterIndex != null) {
      matchedPrimaryResponderIdByRosterIndex.set(primaryRosterIndex, existing.id);
    }

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
    matchedPrimaryResponderIds,
    matchedPrimaryResponderIdByRosterIndex,
    matchedPrimaryCount,
    newPrimaryCount,
    updateNeededCount,
    cancelledNeedsUpdateCount,
    ambiguousPrimaryCount,
  };
}

type GuestMatch = {
  representedGuestCount: number;
  correctlyAttachedGuestCount: number;
  newGuestIdentityCount: number;
  guestRelationshipRepairCount: number;
  guestAttachmentsNeededCount: number;
  existingStandaloneGuestResponderIds: Set<string>;
  ambiguousGuestCount: number;
  cancelledGuestCount: number;
};

function getResponderIdentityKey(responder: ExistingResponder): string {
  const nameKey = normalizeFullName(responder.first_name, responder.last_name) ?? 'name:unknown';
  const phoneKey = normalizePhone(responder.phone);
  const emailKey = normalizeEmail(responder.email);
  if (phoneKey) return `${nameKey}|phone:${phoneKey}`;
  if (emailKey) return `${nameKey}|email:${emailKey}`;
  return `${nameKey}|contact:none`;
}

function evaluateGuestMatches(args: {
  guests: RosterRow[];
  responders: ExistingResponder[];
  matchedPrimaryResponderIds: Set<string>;
  matchedPrimaryResponderIdByRosterIndex: Map<number, string>;
}): GuestMatch {
  let representedGuestCount = 0;
  let correctlyAttachedGuestCount = 0;
  let newGuestIdentityCount = 0;
  let guestRelationshipRepairCount = 0;
  let guestAttachmentsNeededCount = 0;
  const existingStandaloneGuestResponderIds = new Set<string>();
  let ambiguousGuestCount = 0;
  let cancelledGuestCount = 0;
  const respondersById = new Map<string, ExistingResponder>();
  for (const responder of args.responders) {
    respondersById.set(responder.id, responder);
  }

  const responderGuestNameIndex = new Map<string, Set<string>>();
  const responderNameIndex = new Map<string, ExistingResponder[]>();
  for (const responder of args.responders) {
    const guestNames = splitGuestNames(responder.guest_name);
    for (const guestName of guestNames) {
      const set = responderGuestNameIndex.get(guestName) ?? new Set<string>();
      set.add(responder.id);
      responderGuestNameIndex.set(guestName, set);
    }
    const responderName = normalizeFullName(responder.first_name, responder.last_name);
    if (responderName) {
      const rows = responderNameIndex.get(responderName) ?? [];
      rows.push(responder);
      responderNameIndex.set(responderName, rows);
    }
  }

  for (const guest of args.guests) {
    if (guest.isCancelled) {
      cancelledGuestCount += 1;
    }

    const guestName = normalizeFullName(guest.firstName, guest.lastName);
    if (!guestName) {
      ambiguousGuestCount += 1;
      continue;
    }

    const primaryRosterIndex = typeof guest.primaryRosterIndex === 'number' ? guest.primaryRosterIndex : null;
    const matchedPrimaryResponderId = primaryRosterIndex == null ? null : (args.matchedPrimaryResponderIdByRosterIndex.get(primaryRosterIndex) ?? null);
    const attachmentResponderIds = responderGuestNameIndex.get(guestName) ?? new Set<string>();
    const isAttachedToMatchedPrimary = Boolean(matchedPrimaryResponderId && attachmentResponderIds.has(matchedPrimaryResponderId));
    const nameCandidates = responderNameIndex.get(guestName) ?? [];

    const guestPhone = normalizePhone(guest.phone);
    const guestEmail = normalizeEmail(guest.email);
    const contactStrongMatches = nameCandidates.filter((candidate) => {
      const emailStrong = Boolean(guestEmail && normalizeEmail(candidate.email) === guestEmail);
      const phoneStrong = Boolean(guestPhone && normalizePhone(candidate.phone) === guestPhone);
      return emailStrong || phoneStrong;
    });
    const candidateRows = contactStrongMatches.length > 0 ? contactStrongMatches : nameCandidates;

    const standaloneRows = candidateRows.filter((candidate) => !args.matchedPrimaryResponderIds.has(candidate.id));
    const standaloneByIdentity = new Map<string, ExistingResponder[]>();
    for (const standalone of standaloneRows) {
      const key = getResponderIdentityKey(standalone);
      const rows = standaloneByIdentity.get(key) ?? [];
      rows.push(standalone);
      standaloneByIdentity.set(key, rows);
    }
    const standaloneIdentityCount = standaloneByIdentity.size;
    if (standaloneIdentityCount === 1) {
      for (const rows of standaloneByIdentity.values()) {
        for (const row of rows) {
          existingStandaloneGuestResponderIds.add(row.id);
        }
      }
    }

    if (isAttachedToMatchedPrimary) {
      representedGuestCount += 1;
      correctlyAttachedGuestCount += 1;
      if (standaloneIdentityCount === 1 && standaloneRows.length > 0) {
        guestRelationshipRepairCount += 1;
      }
      continue;
    }

    if (attachmentResponderIds.size > 0) {
      representedGuestCount += 1;
      if (matchedPrimaryResponderId) {
        guestRelationshipRepairCount += 1;
      } else {
        ambiguousGuestCount += 1;
      }
      continue;
    }

    if (standaloneIdentityCount > 1) {
      ambiguousGuestCount += 1;
      continue;
    }

    if (standaloneIdentityCount === 1 && standaloneRows.length > 0) {
      representedGuestCount += 1;
      guestRelationshipRepairCount += 1;
      guestAttachmentsNeededCount += 1;
      continue;
    }

    const matchedPrimaryResponder = matchedPrimaryResponderId ? respondersById.get(matchedPrimaryResponderId) : null;
    if (matchedPrimaryResponder) {
      guestAttachmentsNeededCount += 1;
      continue;
    }

    newGuestIdentityCount += 1;
    guestAttachmentsNeededCount += 1;
  }

  return {
    representedGuestCount,
    correctlyAttachedGuestCount,
    newGuestIdentityCount,
    guestRelationshipRepairCount,
    guestAttachmentsNeededCount,
    existingStandaloneGuestResponderIds,
    ambiguousGuestCount,
    cancelledGuestCount,
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
  const guestMatch = evaluateGuestMatches({
    guests,
    responders: args.responders,
    matchedPrimaryResponderIds: primaryMatch.matchedPrimaryResponderIds,
    matchedPrimaryResponderIdByRosterIndex: primaryMatch.matchedPrimaryResponderIdByRosterIndex,
  });

  const ambiguousCount = primaryMatch.ambiguousPrimaryCount + guestMatch.ambiguousGuestCount;

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
      guestAsPrimaryRecords: guestMatch.existingStandaloneGuestResponderIds.size,
      existingStandaloneGuestRecords: guestMatch.existingStandaloneGuestResponderIds.size,
    },
    proposedReconciliation: {
      primaryAlreadyRepresented: primaryMatch.matchedPrimaryCount,
      newPrimaryRecordsNeeded: primaryMatch.newPrimaryCount,
      existingPrimaryNeedingUpdates: primaryMatch.updateNeededCount,
      guestRecordsToAttach: guestMatch.guestAttachmentsNeededCount,
      guestAlreadyCorrectlyAttached: guestMatch.correctlyAttachedGuestCount,
      newGuestIdentitiesNeedingAttachment: guestMatch.newGuestIdentityCount,
      guestRelationshipsNeedingRepair: guestMatch.guestRelationshipRepairCount,
      guestAsPrimaryRowsRequiringCleanup: guestMatch.existingStandaloneGuestResponderIds.size,
      duplicateRowsRequiringCleanup: duplicateSummary.excessDuplicateRows,
      cancelledRecordsRequiringStatusUpdates: primaryMatch.cancelledNeedsUpdateCount,
      cancelledGuestRecords: guestMatch.cancelledGuestCount,
      ambiguousPrimaryMatchesRequiringManualReview: primaryMatch.ambiguousPrimaryCount,
      ambiguousGuestMatchesRequiringManualReview: guestMatch.ambiguousGuestCount,
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
