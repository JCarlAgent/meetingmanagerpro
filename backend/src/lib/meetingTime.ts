export const MEETING_TIMEZONE_OPTIONS = [
  { label: 'Eastern — America/New_York', value: 'America/New_York' },
  { label: 'Central — America/Chicago', value: 'America/Chicago' },
  { label: 'Mountain — America/Denver', value: 'America/Denver' },
  { label: 'Pacific — America/Los_Angeles', value: 'America/Los_Angeles' },
] as const;

export function getMeetingTimeZone(value?: string | null): string {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return MEETING_TIMEZONE_OPTIONS.some((option) => option.value === candidate)
    ? candidate
    : '';
}

export function inferMeetingTimezoneFromState(state?: string | null, currentValue?: string | null): string {
  const candidate = getMeetingTimeZone(currentValue);
  if (candidate) return candidate;

  const normalized = typeof state === 'string' ? state.trim().toUpperCase() : '';
  if (normalized === 'NC' || normalized === 'NORTH CAROLINA') {
    return 'America/New_York';
  }

  return '';
}

function getDateTimeParts(date: Date, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }

  return values;
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = getDateTimeParts(date, timeZone);
  const asWallClockUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  return (asWallClockUtc - date.getTime()) / 60000;
}

export function wallClockTimeToUtcIso(date: string, time: string, timeZone: string): string {
  if (!date || !time || !timeZone) {
    throw new Error('Meeting date, time, and timezone are required.');
  }

  const [year, month, day] = date.split('-').map((segment) => Number(segment));
  const [hour, minute] = time.split(':').map((segment) => Number(segment));

  const localUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const offsetMinutes = getTimeZoneOffsetMinutes(new Date(localUtcMs), timeZone);

  return new Date(localUtcMs - offsetMinutes * 60000).toISOString();
}

export function formatVenueLocalDateTime(isoUtcValue: string | null, timeZone: string | null) {
  if (!isoUtcValue || !timeZone) {
    return { date: '', time: '' };
  }

  const value = new Date(isoUtcValue);
  if (Number.isNaN(value.getTime())) {
    return { date: '', time: '' };
  }

  const parts = getDateTimeParts(value, timeZone);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}
