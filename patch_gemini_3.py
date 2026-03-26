import re

with open('supabase/functions/gemini-optimizer/index.ts', 'r') as f:
    text = f.read()

text = text.replace(
    "WEALTH/ANNUITY: If standard financial, recommend high-end restaurants (Ruth's Chris, Capital Grille)",
    "WEALTH/ANNUITY: If standard financial, recommend high-end restaurants (e.g. Capital Grille, Eddie V's)"
)

with open('supabase/functions/gemini-optimizer/index.ts', 'w') as f:
    f.write(text)

