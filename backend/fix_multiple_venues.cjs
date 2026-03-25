const fs = require('fs');
const path = '../supabase/functions/gemini-optimizer/index.ts';
let code = fs.readFileSync(path, 'utf8');

const newVenueRules = `2. Venue Geolocation & Proximity:
   - Provide exactly 2 or 3 REAL venues that actually exist. You MUST provide multiple venues to allow for A/B testing and to generate multiple overlaid polygons. 
   - General Venue Rule (All Types/Regions): Golf course clubhouses/bars are excellent considerations across ALL cities if they have capable dining/meeting rooms. However, carefully consider/note their operating hours.
   - Keep the multiple locations geographically balanced but separated so the overall map area isn't overlapping too much.
   ***STRICT GEOGRAPHY & PARKING FRICTION RULES***:
   - For Las Vegas specifically: NEVER recommend restaurants on the Las Vegas Strip or inside major megacasinos due to 10+ minute parking/walking friction. Use off-strip high-end spots instead. If recommending "local" casinos (like Red Rock or Green Valley Ranch), mentally ac   - For Las Vegas speciparking/walking adds 5 minutes to the "drive time". 
   - For all major cities (e.g., Houston Medical Center, San Antonio Riverwalk, Los Angeles metro, downtown districts): Avoid high-density tourist or downtown centers where complex parking ramps or long walks are required. Only select easily accessible suburban or premium restaurants with standard parking access.`;

// We'll replace the existing "2. Venue Geolocation & Proximity" section with the new robust one.
code = code.replace(/2\. Venue Geolocation & Proximity: Provide REAL venues that actually exist.*?(?=3\. Response Rate & Math:)/s, newVenueRules + "\n   ");

fs.writeFileSync(path, code);
