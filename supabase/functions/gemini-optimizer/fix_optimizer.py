import re
with open("/Users/jack/Desktop/Documents/CURRENT WORK/Goals/2025/MeetingsManagerPRO/supabase/functions/gemini-optimizer/index.ts", "r") as f:
    text = f.read()

# Replace condition 3 with dynamic logic depending on type
# Wait, the prompt string is constant. We need to inject the logic into the system prompt.
# Let's search for "const systemPrompt" or similar.
