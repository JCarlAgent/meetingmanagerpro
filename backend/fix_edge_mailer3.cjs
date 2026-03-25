const fs = require('fs');

const file = '../supabase/functions/gemini-optimizer/index.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  `let inputFullText = \`User Query: "\${query}"\`;`,
  `let inputFullText = \`User Query: "\${query}"\`;
    if (campaignType === 'mailer') {
      inputFullText += \`\\nCRITICAL OVERRIDE FOR MAILER ONLY:
      1. DO NOT recommend a venue or restaurant. Set the recommended venue headline exactly to "Mailer Only Campaign - N/A".
      2. Set the recommended venue subtext to explain the ideal geographic mapping approach (e.g. driving distance from the advisor's office or targeting specific high-income zip codes).
      3. For optimalTiming, instead of discussing dinner meeting times, discuss the optimal day of the week for the direct mail piece to arrive in the prospect's mailbox.
      4. Ensure targetAudience still reflects the correct demographic profile based on the query.\`;
    }`
);

fs.writeFileSync(file,fs.writeFileSync(file,fs.writeFileSfufs.writeFileSync(file,fsn');
