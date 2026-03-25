const fs = require('fs');
const path = '../supabase/functions/gemini-optimizer/index.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace("mentally ac   - For Las Vegas speciparking/walking adds 5 minutes", "mentally account for the fact that parking/walking adds 5 minutes");

fs.writeFileSync(path, code);
