import re
import os

fp = 'supabase/functions/gemini-optimizer/index.ts'
with open(fp, 'r') as f:
    data = f.read()

# Make the phone number request simpler so Gemini doesn't take 3 seconds hallucinating/searching
new_phone = '"phone": "A standard US phone number format placeholder (e.g. (555) 123-4567)"'
data = re.sub(r'"phone": "The publicly available contact phone number.*?"', new_phone, data)

with open(fp, 'w') as f:
    f.write(data)

print("Patched.")
