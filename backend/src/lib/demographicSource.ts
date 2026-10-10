// Advisor-facing label for where a responder's demographic values came from.
// Stored values: 'exact' (strong match), 'probable' (unique name match),
// 'fuzzy' (legacy manual match). Anything else with no data is unavailable.
export type DemographicSourceLabel =
  | 'Matched prospect'
  | 'Probable demographic match'
  | 'Possible match'
  | 'Demographics unavailable';

export function demographicSourceLabel(
  matchConfidence: string | null | undefined,
  hasDemographics: boolean,
): DemographicSourceLabel {
  if (!hasDemographics) return 'Demographics unavailable';
  if (matchConfidence === 'exact') return 'Matched prospect';
  if (matchConfidence === 'probable') return 'Probable demographic match';
  if (matchConfidence === 'fuzzy') return 'Possible match';
  return 'Demographics unavailable';
}
