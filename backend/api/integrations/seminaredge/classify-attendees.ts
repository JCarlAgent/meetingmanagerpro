/**
 * Read-only classification of TeleDirect attendee rows into primaries and guests.
 *
 * 1. Active rows (not cancelled) keep API order. A nonempty phone or email marks a
 *    primary. Following active rows with neither are that primary's guests until the
 *    next primary. Surname differences do not invalidate this link.
 * 2. Cancelled rows are excluded from that adjacency pass. A cancelled row with contact
 *    data is its own primary, flagged cancelled. A cancelled contactless row keeps a
 *    supplied verified primary link; otherwise it links only when exactly one active
 *    primary shares its surname ('surname-inference'). Anything else stays unresolved
 *    with no parent.
 * 3. A cancelled row never changes a primary's status.
 *
 * Gender is not an input. Source indices are fixture/diagnostic references only.
 */

export type AttendeeStatusBucket = 'registered' | 'cancelled' | 'waitlist' | 'other';
export type AttendeeRole = 'primary' | 'guest' | 'unresolved';
export type LinkBasis = 'adjacency' | 'surname-inference' | 'verified';

export interface AttendeeClassificationInput {
  sourceIndex: number;
  lastName: string;
  phone: string;
  email: string;
  status: AttendeeStatusBucket;
  /** Existing verified primary, expressed as this payload's sourceIndex. */
  verifiedPrimarySourceIndex?: number | null;
}

export interface ClassifiedAttendee {
  sourceIndex: number;
  role: AttendeeRole;
  cancelled: boolean;
  primarySourceIndex: number | null;
  linkBasis: LinkBasis | null;
}

export interface AttendeeClassificationSummary {
  primaries: number;
  guests: number;
  registeredGuests: number;
  cancelledGuests: number;
  activeAttendees: number;
  inferredLinks: number;
  unresolved: number;
}

export interface AttendeeClassification {
  attendees: ClassifiedAttendee[];
  summary: AttendeeClassificationSummary;
}

const hasContact = (value: string): boolean => value.trim().length > 0;
const normalizeSurname = (value: string): string => value.trim().replace(/\s+/g, ' ').toLowerCase();
const isCancelled = (row: AttendeeClassificationInput): boolean => row.status === 'cancelled';
const hasAnyContact = (row: AttendeeClassificationInput): boolean => hasContact(row.phone) || hasContact(row.email);

export function classifyAttendees(inputs: readonly AttendeeClassificationInput[]): AttendeeClassification {
  const resolved = new Map<number, ClassifiedAttendee>();
  for (const row of inputs) {
    if (resolved.has(row.sourceIndex)) {
      throw new Error(`Duplicate sourceIndex ${row.sourceIndex}`);
    }
    resolved.set(row.sourceIndex, { sourceIndex: row.sourceIndex, role: 'unresolved', cancelled: isCancelled(row), primarySourceIndex: null, linkBasis: null });
  }

  // Pass 1: active rows in API order.
  let currentPrimary: number | null = null;
  for (const row of inputs) {
    if (isCancelled(row)) continue;
    if (hasAnyContact(row)) {
      currentPrimary = row.sourceIndex;
      resolved.set(row.sourceIndex, { sourceIndex: row.sourceIndex, role: 'primary', cancelled: false, primarySourceIndex: null, linkBasis: null });
    } else if (currentPrimary !== null) {
      resolved.set(row.sourceIndex, { sourceIndex: row.sourceIndex, role: 'guest', cancelled: false, primarySourceIndex: currentPrimary, linkBasis: 'adjacency' });
    }
  }

  const activePrimaries = inputs.filter((row) => !isCancelled(row) && resolved.get(row.sourceIndex)?.role === 'primary');

  // Pass 2: cancelled rows, processed separately from the adjacency pass.
  for (const row of inputs) {
    if (!isCancelled(row)) continue;
    if (hasAnyContact(row)) {
      resolved.set(row.sourceIndex, { sourceIndex: row.sourceIndex, role: 'primary', cancelled: true, primarySourceIndex: null, linkBasis: null });
      continue;
    }

    const verified = row.verifiedPrimarySourceIndex;
    if (verified != null && activePrimaries.some((primary) => primary.sourceIndex === verified)) {
      resolved.set(row.sourceIndex, { sourceIndex: row.sourceIndex, role: 'guest', cancelled: true, primarySourceIndex: verified, linkBasis: 'verified' });
      continue;
    }

    const surname = normalizeSurname(row.lastName);
    const candidates = surname === ''
      ? []
      : activePrimaries.filter((primary) => primary.sourceIndex !== row.sourceIndex && normalizeSurname(primary.lastName) === surname);

    if (candidates.length === 1) {
      resolved.set(row.sourceIndex, { sourceIndex: row.sourceIndex, role: 'guest', cancelled: true, primarySourceIndex: candidates[0].sourceIndex, linkBasis: 'surname-inference' });
    } else {
      resolved.set(row.sourceIndex, { sourceIndex: row.sourceIndex, role: 'unresolved', cancelled: true, primarySourceIndex: null, linkBasis: null });
    }
  }

  const attendees = inputs.map((row) => resolved.get(row.sourceIndex) as ClassifiedAttendee);
  const summary: AttendeeClassificationSummary = {
    primaries: attendees.filter((a) => a.role === 'primary').length,
    guests: attendees.filter((a) => a.role === 'guest').length,
    registeredGuests: attendees.filter((a) => a.role === 'guest' && !a.cancelled).length,
    cancelledGuests: attendees.filter((a) => a.role === 'guest' && a.cancelled).length,
    activeAttendees: attendees.filter((a) => !a.cancelled).length,
    inferredLinks: attendees.filter((a) => a.linkBasis === 'surname-inference').length,
    unresolved: attendees.filter((a) => a.role === 'unresolved').length,
  };

  return { attendees, summary };
}
