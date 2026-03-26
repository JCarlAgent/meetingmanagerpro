const fs = require('fs');
const path = 'supabase/functions/gemini-optimizer/index.ts';
let code = fs.readFileSync(path, 'utf8');

// 1. Remove Ruth's Chris completely from the generic example to avoid bias.
code = code.replace(
  /WEALTH\/ANNUITY: If standard financial, recommend high-end restaurants \(Ruth's Chris, Capital Grille\)/,
  `WEALTH/ANNUITY: If standard financial, recommend high-end restaurants (e.g. Capital Grille, Eddie V's)`
);

// 2. Add an even stricter geography instruction for Vegas venues.
code = code.replace(
  /DO NOT HALLUCINATE LOCATIONS\. \(e\.g\. There is NO Ruth's Chris in Henderson\)\. ONLY use verified off-strip high-end venues like: 'Vintner Grill - Las Vegas, NV', 'Echo & Rig - Las Vegas, NV', 'Hank's Fine Steaks - Henderson, NV', or 'Hawthorn Grill - Las Vegas, NV'\./,
  `DO NOT HALLUCINATE LOCATIONS. (e.g. There is NO Ruth's Chris in Henderson). ONLY use verified off-strip high-end venues like: 'Vintner Grill - Las Vegas, NV', 'Echo & Rig - Las Vegas, NV', 'Hank's Fine Steaks - Henderson, NV', or 'Hawthorn Grill - Las Vegas, NV'. THIS IS AN ABSOLUTE REQUIREMENT.  `DO NOT nerate fake chains.`
);

fs.writeFileSync(path, code);
console.log("Patched Gemini 2");
