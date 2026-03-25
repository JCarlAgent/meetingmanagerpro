const fs = require('fs');
const path = '../supabase/functions/extract-zip-codes/index.ts';
let code = fs.readFileSync(path, 'utf8');

// Ensure we parse lat and lng as floats in case the database driver returns them as strings
code = code.replace(
  "const pt = turf.point([zipObj.lng, zipObj.lat]);",
  "const pt = turf.point([parseFloat(zipObj.lng), parseFloat(zipObj.lat)]);"
);

// We should also check for Turf.js bounding box failures and wrap in better try/catch 
// to return explicit errors we can debug in the UI or console
code = code.replace(
  "const exactZips = [];",
  `const exactZips = [];\n    console.log(\`Found \${rawZips.length} zips in bounding box\`);`
)

fs.writeFileSync(path, code);
