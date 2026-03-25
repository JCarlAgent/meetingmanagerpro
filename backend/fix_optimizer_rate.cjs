const fs = require('fs');
const path = '../supabase/functions/gemini-optimizer/index.ts';
let code = fs.readFileSync(path, 'utf8');

// The current prompt has: "3. Response Rate & Math: You MUST use a strict 1.0% response rate for all direct mail calculations."
code = code.replace(
  "3. Response Rate & Math: You MUST use a strict 1.0% response rate for all direct mail calculations. E.g., if the user wants 60 attendees, the mailers MUST be EXACTLY 6,000 (60 / 0.01). EXPLICITLY state this 1.0% response rate in the mailStrategy subtext.",
  "3. Response Rate & Math: If the campaign is Medicare (Medicare Dinner Seminar, etc), use a strict 1.0% response rate (e.g., 60 attendees = 6,000 mailers). If the campaign is Financial/Annuity (Financial Dinner Seminar, etc), use a realistic response rate range of 0.6% to 0.75% (e.g., 60 attendees = ~8,000 to 10,000 mailers). EXPLICITLY state this mathematical assumption and expected response rate directly in the mailStrategy subtext."
);

// Also fix the example subtext requirement lower down in the json format expectation:
code = code.replace(
  /"subtext": "Explain the 1\.0% expected response rate strictly and the math\."/g,
  '"subtext": "Explain the expected response rate strictly (1% for Medicare, 0.6%-0.75% for Financial) and the math."'
);

fs.writeFileSync(path, code);
