const fetch = require('node-fetch');

const data = {
  isochroneGeojson: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-115.0, 36.0],
              [-114.9, 36.0],
              [-114.9, 36.1],
              [-115.0, 36.1],
              [-115.0, 36.0]
            ]
          ]
        }
      }
    ]
  }
};

fetch('https://lccfprbtmsphesudrpqb.supabase.co/functions/v1/extract-zip-codes', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + process.env.VITE_SUPABASE_ANON_KEY // using local bash if exists, or I will use curl
  },
  body: JSON.stringify(data)
}).then(res => res.text()).then(console.log).catch(console.error);
