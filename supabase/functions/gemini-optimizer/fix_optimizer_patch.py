import re

path = "/Users/jack/Desktop/Documents/CURRENT WORK/Goals/2025/MeetingsManagerPRO/supabase/functions/gemini-optimizer/index.ts"

with open(path, "r") as f:
    text = f.read()

# Make the response rate instruction dynamic
new_instruction = """3. Response Rate & Math: 
   - If the campaign is Medicare (Medicare Dinner Seminar or Medicare Retail Seminar), you MUST use a strict 1.0% response rate (e.g. 60 attendees = 6,000 mailers). 
   - If the campaign is Financial/Annuity (Financial Dinner Seminar), you MUST use a 0.6% - 0.75% response rate range (e.g. 60 attendees = ~8,000 - 10,000 mailers).
   EXPLICITLY state these math assumptions and the expected response rate in the mailStrategy subtext."""

text = re.sub(
    r"3\. Response Rate & Math: You MUST use a strict 1\.0% response rate for all direct mail calculations.*?in the mailStrategy subtext\.",
    new_instruction,
    text,
    flags=re.DOTALL
)

json_schema_replace_1 = """"headline": "Number of mailers (Based on Expected Attendees and the correct respojson_schema_replace_1 = """"headline": "Number of mailers (Based on Expected Attendees and the correct respojson_schema_replaFinancial)." """

text = re.sutext = re.sutext =": text = re.sutext = re.sutext =": text = rendees / 0\.01\)",\s*"subtext": "Explain the 1\.0% expected response rate strictly and the math\."',
    json_schema_replace_1,
    text,
    flags=re.DOTALL
)

with open(path, "w") as f:
    f.write(text)

