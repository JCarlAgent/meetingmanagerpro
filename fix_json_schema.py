import re

fp = 'supabase/functions/gemini-optimizer/index.ts'
with open(fp, 'r') as f:
    data = f.read()

# I noticed the previous schema edit left an invisible double-escape format or trailing whitespace error because of how it was typed.
# Let's cleanly rewrite just that block using simple find/replace on a known string context.

target_block = """  "recommendedVenue": {
    "headline": "Name of a popular, high-end restaurant in the requested area suitable for a seminar, MUST APPEND the City and State (e.g., Ruth's Chris Steak House - Tustin, CA)",
    "subtext": "Custom polygon detail tied to the specific sub-region requested. DO NOT mention avoiding anything. (e.g., Localized 12m drive-time polygon capturing affluent waterfront communities in NW Raleigh)",
    "phone": "A standard US phone number format placeholder (e.g. (555) 123-4567)"
  },"""

# Just in case there is some stray weird character in the parsed Deno code causing 500s.
