const fs = require('fs');

const file = '../supabase/functions/gemini-optimizer/index.ts';
let content = fs.readFileSync(file, 'utf8');

// The `campaignType` extraction is missing. Let's add it in where the body is parsed.
content = content.replace(
  `const query = body.query;`,
  `const query = body.query;\n    const campaignType = body.campaignType; // 'financial', 'medicare', or 'mailer'`
);

content = content.replace(
  `let inputFullText = \`The user is planning a seminar/dinner marketing campaign.\n\n\`;`,
  `let inputFullText = \`The user is planning a \${campaignType === 'mailer' ? 'direct mail only' : 'seminar/dinner marketing'} campaign. Campaign Type: \${campaignType}\n\n\`;`
);

content = content.replace(
  `\n    inputFullText += \`Adhere to the strict rules outlined in your system prompt.\`;`,
  `\n    if (campaignType === 'mailer') {
      inputFullText += \`\nCRITICAL OVERRIDE FOR MAILER ONLY:
      1. DO NOT recommend a venue or restaurant. Set the recommended venue headline to "Mailer Only Campaign - N/A".
      2. Set the recommended venue subtext to explain the ideal geographic mapping approach (e.g. driving distance from      2. Set the recommended venue subtext to explain the ideal geographic mapping apma      2. Set the recommenssing dinner meeting times, discuss the optimal day of the week for the direct mail piece to arrive in the prospect's mailbox.
      4. Ensure targetAudience still reflects the correct demographic profile based on the query.\`;
    }
    inputFullText += \`\n\nAdhere to the strict rules outlined in your system prompt.\`;`
);

fs.writeFileSync(file, content);
console.log('Fixed edge function');
