import re

with open('../supabase/functions/gemini-optimizer/index.ts', 'r') as f:
    text = f.read()

# Make sure we use raw strings to avoid escape issues
old_age = r'Focus strictly on Age (e.g. Ages 64 yrs 8 mo to 65 yrs old, or whatever the user requested) and Income (e.g. $25k+ or $50k+).'
new_age = r'Focus strictly on Age and Income based exactly on the user\'s input. The age bounds must be flexible (e.g. some want 3 months out, some 6 months out) so just use their input parameters. NEVER ignore their stated income limit.'
text = text.replace(old_age, new_age)

old_head = r'"Short description focusing on exact Age and Income ONLY (e.g., Ages 64 yrs 8 mo - 65 yrs, $25k+ Annual Income)",'
new_head = r'"Short description focusing on dynamically capturing the exact Age and Income requested by the user, WITHOUT limitations (e.g., Ages 64.5 - 65, $25k+ Annual Income)",'
text = text.replace(old_head, new_head)

old_rate1 = r'assume a realistic response rate of 1.0% to 1.5%.'
new_rate1 = r'use EXACTLY a 1.0% response rate as the strict guideline.'
text = text.replace(old_rate1, new_rate1)

old_rate2 = r'based on a 1.0% response rate for Medicare lists.'
new_rate2 = r'based mathematically on exactly a 1.0% response rate for Medicare lists.'
text = text.replace(old_rate2, new_rate2)

with open('../supabase/functions/gemini-optimizer/index.ts', 'w') as f:
    f.write(text)

