const fs = require('fs');
const path = '../supabase/functions/gemini-optimizer/index.ts';
let code = fs.readFileSync(path, 'utf8');

const oldVenueInstruction = `2. Venue Requirements: Find 2 actual, real mid-to-high-end restaurants in the requested city. Provide the location name, city, and state (e.g. "Ruth's Chris Steak House - Raleigh, NC"). They must be real places. If the campaign is a mailer only, return "N/A - Mailer Only" for the venue headline.`;

const newVenueInstruction = `2. Venue Requirements: Find 2 actual, real mid-to-high-end restaurants in the requested city. Provide the location name, city, and state.
   ***STRICT GEOGRAPHY & PARKING FRICTION RULES***:
   - For Las Vegas specifically: NEVER recommend restaurants on the Las Vegas Strip or inside major megacasinos due to 10+ minute parking/walking friction. Use off-strip high-end spots instead. If recommending "local" casinos (like Red Rock or Green Valley Ranch), mentally account for the fact that parking/walking adds 5 minutes to the "drive time". 
   - For all major cities (e.g., Houston Medical Center, San Antonio Riverwalk, Los Angeles metro, downtown districts): Avoid high-density tourist or downtown centers where complex parking ramps or long walks are required. Only select easily accessible suburban or premium restaurants with standard parking access.
   If the campaign is a mailer only, return "N/A - Mailer Only".`;

if(code.includes(oldVenueInstruction)) {
   code = code.replace(oldVenueInstruction, newVenueInstruction);
   fs.writeFileSync(path, code);
   console.log("Successfully updated Vegas/Parking logic in optimizer");
} else {
   console.log("Could not find exact venue instruction match! Let's do a more robust regex...");
   code = code.replace(/2\. Venue Requirements: Find 2 actual, real mid-to-high-end restaurants.*?return "N\/A - Mailer Only" for the venue headline\./s, newVenueInstruction);
   fs.writeFileSync(path, code);
   console.log("Used Regex to update Vegas/Parking logic in optimizer");
}
