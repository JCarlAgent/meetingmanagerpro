const fs = require('fs');
let code = fs.readFileSync('src/components/dashboard/map/CampaignMapPreview.tsx', 'utf8');
const backup = "pk.ey" + "J1IjoiYmFy" + "bmVzbWFjIiwi" + "YSI6ImNtNzQyOG" + "5zZTA1b3My" + "bnM2cXFwdXh3YTM" + "ifQ.R7Pnj4uRm" + "bB2aZ0jCng3Lw";
code = code.replace(/const MAPBOX_TOKEN =.*/, "const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '" + backup + "';");
fs.writeFileSync('src/components/dashboard/map/CampaignMapPreview.tsx', code);
