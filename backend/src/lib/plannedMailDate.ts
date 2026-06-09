/**
 * plannedMailDate.ts
 *
 * Pure utility — no DB access, no side effects.
 *
 * Calculates a recommended mail drop date given the first event date:
 *   1. Start at firstEventDate − 14 calendar days.
 *   2. If result is Saturday (6), move back to Friday (−1 day).
 *      If result is Sunday  (0), move back to Friday (−2 days).
 *   3. Count full weekends (Sat + Sun pairs) strictly between the
 *      candidate mail date and firstEventDate.
 *   4. If fewer than 2 full weekends exist, subtract 7 days and repeat
 *      from step 2 until the condition is met.
 */

/** Returns the number of full (Sat+Sun) weekends strictly between two dates. */
function countFullWeekendsBetween(mailDate: Date, eventDate: Date): number {
  let count = 0;
  // Start from the day after mailDate
  const cursor = new Date(mailDate);
  cursor.setDate(cursor.getDate() + 1);

  while (cursor < eventDate) {
    const day = cursor.getDay();
    if (day === 6) {
      // Check that Sunday also falls before eventDate
      const sunday = new Date(cursor);
      sunday.setDate(sunday.getDate() + 1);
      if (sunday < eventDate) count++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/** Move a date back to the prior Friday if it lands on a weekend. */
function alignToWeekday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  if (day === 6) d.setDate(d.getDate() - 1); // Saturday → Friday
  if (day === 0) d.setDate(d.getDate() - 2); // Sunday   → Friday
  return d;
}

/**
 * Returns the recommended planned mail date for a given first event date.
 * The result is always a weekday (Monday–Friday) with at least 2 full
 * weekends between it and the event.
 */
export function calcPlannedMailDate(firstEventDate: Date): Date {
  // Work with a clean copy at midnight to avoid timezone drift
  const eventMidnight = new Date(firstEventDate);
  eventMidnight.setHours(0, 0, 0, 0);

  let candidate = new Date(eventMidnight);
  candidate.setDate(candidate.getDate() - 14);
  candidate = alignToWeekday(candidate);

  while (countFullWeekendsBetween(candidate, eventMidnight) < 2) {
    candidate.setDate(candidate.getDate() - 7);
    candidate = alignToWeekday(candidate);
  }

  return candidate;
}
