import re

filepath = '../supabase/functions/gemini-optimizer/index.ts'
with open(filepath, 'r') as f:
    content = f.read()

# Replace the malformed const SYSTEM_PROMPT = \` with const SYSTEM_PROMPT = `
content = content.replace("const SYSTEM_PROMPT = \`", "const SYSTEM_PROMPT = `")
content = content.replace("\`;", "`;")
content = content.replace("\\\`\`\`json", "\`\`\`json")

with open(filepath, 'w') as f:
    f.write(content)

print("Fixed syntax")
