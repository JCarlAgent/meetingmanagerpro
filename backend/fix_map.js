const fs = require('fs');
const file = 'src/components/dashboard/map/CampaignMapPreview.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /if \(\!venueHeadline.*?rrorMsg\(null\);/gs;

const fix = `if (!venueHeadline || venueHeadline.includes("N/A") || venueHeadline.toLowerCase().includes("mailer")) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setErrorMsg(null);`;

content = content.replace(regex, fix);
fs.writeFileSync(file, content);
console.log('Fixed file');
