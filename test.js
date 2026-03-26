import fs from 'fs';
import ts from 'typescript';

const code = fs.readFileSync('supabase/functions/gemini-optimizer/index.ts', 'utf8');
const result = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
console.log("No syntax errors during transpile.");
