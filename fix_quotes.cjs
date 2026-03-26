const fs = require('fs');
let code = fs.readFileSync('supabase/functions/gemini-optimizer/index.ts', 'utf8');
code = code.replace("describe the covered neighborhoods in the `subtext`", "describe the covered neighborhoods in the 'subtext'");
code = code.replace("describing the covered neighborhoods in the `subtext`", "describing the covered neighborhoods in the 'subtext'");
fs.writeFileSync('supabase/functions/gemini-optimizer/index.ts', code);
console.log("Quotes fixed!");
