import re

with open('../supabase/functions/gemini-optimizer/index.ts', 'r') as f:
    text = f.read()

# Update Rule 1 bounds
# Old: Focus strictly on Age (e.g. Ages 64 yrs 8 mo to 65 yrs old, or whatever the user requested)
# New: Ensure the Age bounds are highly flexible and dynamically reflect the exact input of the advisor (whether they want 3 months out, 6 months out, etc.).
text = text.replace(
    'Focus strictly on Age (e.g. Ages 64 yrs 8 mo to 65 yrs old, or whatever the user requested) and Income (e.g. $25k+ or $50k+).',
    'Focus strictly on Age and Income based exactly on the user\\'s input. The age bounds must be flexible (e.g. some want 3 months out, some 6 months out) so just use their input parameters. NEVER ignore their stated income limit.'
)

text = text.replace(
    '"Short description focusing on exact Age and Income ONLY (e.g., Ages 64 yrs 8 mo - 65 yrs, $25k+ Annual Income)",',
    '"Short description focusing on dynamically capturing the exact Age and Income    '"Sted by the user, WITHOUT limitations (e.g., Ages 64.5 - 65, $25k+ Annual Income)",'
)

# Update Rule 6 response rate from "1.0% to 1.5%" to "exactly 1.0%"
text = text.replace(
    'assume a realistic response rate of 1.0% to 1.5%.',
    'use EXACTLY a 1.0% response rate as the strict guideline.'
)

text = text.replace(
    'based on a 1.0% response rate for Medicare lists.',
    'based mathematically on exactly a 1.0% response rate for Medicare lists.'
)

with open('../supabase/functions/gemini-optimizer/index.ts', 'w') as f:
    f.write(text)

print("done")
