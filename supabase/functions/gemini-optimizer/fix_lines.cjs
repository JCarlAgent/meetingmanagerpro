const fs = require('fs');
let code = fs.readFileSync('index.ts', 'utf8');

code = code.replace(/const query = body\.query;/, "const query = body.query;\n    const campaignType = body.campaignType; // 'financial', 'medicare', or 'mailer'");

fs.writeFileSync('index.ts', code);
