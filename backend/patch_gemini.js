const fs = require('fs');
const path = 'supabase/functions/gemini-optimizer/index.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  /For Las Vegas specifically: NEVER recommend restaurants on the Las Vegas Strip or inside major megacasinos due to 10\+ minute parking\/walking friction\. Use off-strip high-end spots instead\./,
  `For Las Vegas specifically: NEVER recommend restaurants on the Las Vegas Strip or inside major megacasinos due to 10+ minute parking/walking friction. Use off-strip high-end spots instead. DO NOT HALLUCINATE LOCATIONS. (e.g. There is NO Ruth's Chris in Henderson). ONLY use verified off-strip high-end venues like: 'Vintner Grill - Las Vegas, NV', 'Echo & Rig - Las Vegas, NV', 'Hank's Fine Steaks - Henderson, NV', or 'Hawthorn Grill - Las Vegas, NV'.`
);

fs.writeFileSync(path, code);
console.log("Patched Gemini");
