import fs from 'fs';
const code = fs.readFileSync('supabase/functions/gemini-optimizer/index.ts', 'utf8');
const lines = code.split('\n');
console.log("Checking schema string starting from line 25...");
for(let i=20; i<45; i++) {
    console.log(`${i+1}: ${lines[i]}`);
}
