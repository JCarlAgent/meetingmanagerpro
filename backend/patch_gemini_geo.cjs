const fs = require('fs');
const file = '../supabase/functions/gemini-optimizer/index.ts';
let code = fs.readFileSync(file, 'utf8');

const oldStr = `4. Drive-time Polygons: Use precise "drive-time" phrasing (e.g. "20-minute drive-time radius") rather than just static mile radius, using google maps routing logic hypothetically.
5. Formatted Venues`;

const newStr = `4. Drive-time Polygons: Use precise "15-minute drive-time" phrasing rather than just static mile radius, using google maps routing logic hypothetically. CRITICAL: When describing the covered neighborhoods in the \`subtext\`, be geographically hyper-accurate. E.g. in Las Vegas, if you choose a venue near MacDonald Highlands, do NOT hallucinate coverage of Anthem if it's >15 mins away. Trace the literal real-world 15-minute drive time.
5. Formatted Venues`;

code = code.replace(oldStr, newStr);
fs.writeFileSync(file, code);
console.log("Patched Edge Function!");
