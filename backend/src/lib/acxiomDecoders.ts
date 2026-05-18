/**
 * Acxiom / Claritas code decoders for MeetingsManagerPRO.
 *
 * Raw codes are always preserved in campaign_mailed_list_records.
 * These helpers decode them to human-readable labels for display,
 * exports, AI analysis, filters, and reports.
 *
 * Safe fallback: unknown/unmapped codes are returned as-is.
 */

/** Acxiom Claritas IPA (Investment Portfolio Assets) code → human-readable range */
const IPA_MAP: Record<string, string> = {
  '1': '$2M–$2.999M',
  '2': '$1M–$1.999M',
  '3': '$750k–$999k',
  '4': '$500k–$749k',
  '5': '$250k–$499k',
  '6': '$100k–$249k',
  '7': '$75k–$99k',
  '8': '$50k–$74k',
  '9': '$25k–$49k',
  'A': 'Less than $25k',
  'B': '$3M+',
};

/** Acxiom estimated income code → human-readable range */
const INCOME_MAP: Record<string, string> = {
  '1': 'Under $15k',
  '2': '$15k–$19,999',
  '3': '$20k–$29,999',
  '4': '$30k–$39k',
  '5': '$40k–$49k',
  '6': '$50k–$59k',
  '7': '$60k–$69k',
  '8': '$70k–$79k',
  '9': '$80k–$89k',
  'A': '$90k–$99k',
  'B': '$100k–$124k',
  'C': '$125k–$149k',
  'D': '$150k+',
};

/**
 * Decode an Acxiom Claritas IPA code to a human-readable investment
 * portfolio assets range (e.g. '3' → '$750k–$999k').
 * Returns null for null/empty input. Returns the raw code for unknowns.
 */
export function decodeIPA(code: string | null | undefined): string | null {
  if (!code) return null;
  return IPA_MAP[code.trim().toUpperCase()] ?? code;
}

/**
 * Decode an Acxiom estimated income code to a human-readable range
 * (e.g. 'D' → '$150k+').
 * Returns null for null/empty input. Returns the raw code for unknowns.
 */
export function decodeIncome(code: string | null | undefined): string | null {
  if (!code) return null;
  return INCOME_MAP[code.trim().toUpperCase()] ?? code;
}
