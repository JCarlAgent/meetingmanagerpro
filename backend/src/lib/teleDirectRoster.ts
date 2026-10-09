export type TeleDirectRosterPreview = {
  meetingId: string | null;
  meetingDate: string | null;
  primaryCount: number;
  guestCount: number;
  cancelledPrimaryCount: number;
  cancelledGuestCount: number;
  activePrimaryCount: number;
  activeGuestCount: number;
  totalActiveAttendees: number;
  rowsRead: number;
  unknownRows: number;
};

export type TeleDirectRosterAttendeeType = 'A' | 'G';

export type TeleDirectRosterAttendee = {
  rowIndex: number;
  attendeeType: TeleDirectRosterAttendeeType;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  isCancelled: boolean;
  primaryRosterIndex: number | null;
};

export type TeleDirectRosterDetailed = {
  preview: TeleDirectRosterPreview;
  attendees: TeleDirectRosterAttendee[];
};

function normalizeStatus(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 ? digits : null;
}

function getField(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const match = Object.keys(row).find((header) => header.trim().toLowerCase() === key.trim().toLowerCase());
    if (match && row[match]) {
      return String(row[match]).trim();
    }
  }
  return '';
}

function extractMeetingDate(row: Record<string, string>): string | null {
  const raw = getField(row, 'TimeStamp', 'Timestamp', 'MeetingDate', 'Date', 'EventDate');
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toISOString().slice(0, 10);
}

function extractMeetingId(row: Record<string, string>): string | null {
  const raw = getField(row, 'MeetingID', 'Meeting Id', 'MeetingId', 'TeleDirectMeetingID', 'MeetingID#', 'EventID', 'Event Id');
  return raw ? String(raw).trim() : null;
}

function parseTeleDirectRows(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split('\t').map((h) => h.trim().replace(/^\uFEFF/, ''));
  return lines.slice(1).map((line) => {
    const cells = line.split('\t');
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? '').trim();
    });
    return row;
  });
}

export function parseTeleDirectRosterDetailed(text: string): TeleDirectRosterDetailed {
  const rows = parseTeleDirectRows(text);
  if (!rows.length) {
    return {
      preview: {
        meetingId: null,
        meetingDate: null,
        primaryCount: 0,
        guestCount: 0,
        cancelledPrimaryCount: 0,
        cancelledGuestCount: 0,
        activePrimaryCount: 0,
        activeGuestCount: 0,
        totalActiveAttendees: 0,
        rowsRead: 0,
        unknownRows: 0,
      },
      attendees: [],
    };
  }

  let primaryCount = 0;
  let guestCount = 0;
  let cancelledPrimaryCount = 0;
  let cancelledGuestCount = 0;
  let unknownRows = 0;
  let meetingId: string | null = null;
  let meetingDate: string | null = null;
  const attendees: TeleDirectRosterAttendee[] = [];
  let currentPrimaryRosterIndex: number | null = null;
  let nextPrimaryRosterIndex = 0;

  rows.forEach((row, rowIndex) => {
    const marker = (getField(row, 'Attendee/Guest', 'AttendeeGuest', 'A/G', 'AG', 'Type') || '').trim().toUpperCase();
    const status = normalizeStatus(getField(row, 'Status', 'ReservationStatus', 'AttendeeStatus'));
    const isCancelled = status === 'cancelled' || status === 'canceled';
    if (!meetingId) meetingId = extractMeetingId(row);
    if (!meetingDate) meetingDate = extractMeetingDate(row);

    if (marker === 'A') {
      primaryCount += 1;
      if (isCancelled) cancelledPrimaryCount += 1;
      currentPrimaryRosterIndex = nextPrimaryRosterIndex;
      nextPrimaryRosterIndex += 1;

      const firstName = getField(row, 'FirstName', 'First Name', 'FName', 'First_Name') || null;
      const lastName = getField(row, 'LastName', 'Last Name', 'LName', 'Last_Name') || null;
      const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
      const phone = normalizePhone(getField(row, 'PhoneNumber', 'Phone', 'Phone1', 'CellPhone', 'HomePhone'));
      const email = (getField(row, 'Email', 'EmailAddress', 'EmailAddr') || '').toLowerCase() || null;
      attendees.push({
        rowIndex,
        attendeeType: 'A',
        firstName,
        lastName,
        fullName,
        phone,
        email,
        status: status || 'registered',
        isCancelled,
        primaryRosterIndex: currentPrimaryRosterIndex,
      });
    } else if (marker === 'G') {
      guestCount += 1;
      if (isCancelled) cancelledGuestCount += 1;
      const firstName = getField(row, 'FirstName', 'First Name', 'FName', 'First_Name') || null;
      const lastName = getField(row, 'LastName', 'Last Name', 'LName', 'Last_Name') || null;
      const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
      const phone = normalizePhone(getField(row, 'PhoneNumber', 'Phone', 'Phone1', 'CellPhone', 'HomePhone'));
      const email = (getField(row, 'Email', 'EmailAddress', 'EmailAddr') || '').toLowerCase() || null;
      attendees.push({
        rowIndex,
        attendeeType: 'G',
        firstName,
        lastName,
        fullName,
        phone,
        email,
        status: status || 'registered',
        isCancelled,
        primaryRosterIndex: currentPrimaryRosterIndex,
      });
    } else if (row && Object.keys(row).length > 0) {
      unknownRows += 1;
    }
  });

  const activePrimaryCount = primaryCount - cancelledPrimaryCount;
  const activeGuestCount = guestCount - cancelledGuestCount;

  return {
    preview: {
      meetingId,
      meetingDate,
      primaryCount,
      guestCount,
      cancelledPrimaryCount,
      cancelledGuestCount,
      activePrimaryCount,
      activeGuestCount,
      totalActiveAttendees: activePrimaryCount + activeGuestCount,
      rowsRead: rows.length,
      unknownRows,
    },
    attendees,
  };
}

export function parseTeleDirectRosterText(text: string): TeleDirectRosterPreview {
  return parseTeleDirectRosterDetailed(text).preview;
}
