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

function normalizeStatus(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
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

export function parseTeleDirectRosterText(text: string): TeleDirectRosterPreview {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((line) => line.trim());
  if (lines.length < 2) {
    return {
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
    };
  }

  const headers = lines[0].split('\t').map((h) => h.trim().replace(/^\uFEFF/, ''));
  const rows = lines.slice(1).map((line) => {
    const cells = line.split('\t');
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? '').trim();
    });
    return row;
  });

  let primaryCount = 0;
  let guestCount = 0;
  let cancelledPrimaryCount = 0;
  let cancelledGuestCount = 0;
  let unknownRows = 0;
  let meetingId: string | null = null;
  let meetingDate: string | null = null;

  for (const row of rows) {
    const marker = (getField(row, 'Attendee/Guest', 'AttendeeGuest', 'A/G', 'AG', 'Type') || '').trim().toUpperCase();
    const status = normalizeStatus(getField(row, 'Status', 'ReservationStatus', 'AttendeeStatus'));
    const isCancelled = status === 'cancelled' || status === 'canceled';
    if (!meetingId) meetingId = extractMeetingId(row);
    if (!meetingDate) meetingDate = extractMeetingDate(row);

    if (marker === 'A') {
      primaryCount += 1;
      if (isCancelled) cancelledPrimaryCount += 1;
    } else if (marker === 'G') {
      guestCount += 1;
      if (isCancelled) cancelledGuestCount += 1;
    } else if (row && Object.keys(row).length > 0) {
      unknownRows += 1;
    }
  }

  const activePrimaryCount = primaryCount - cancelledPrimaryCount;
  const activeGuestCount = guestCount - cancelledGuestCount;

  return {
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
  };
}
