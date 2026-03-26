const fs = require('fs');

const path = 'backend/src/components/dashboard/map/CampaignMapPreview.tsx';
let txt = fs.readFileSync(path, 'utf8');

// 1. Add states
txt = txt.replace('const [venues, setVenues] = useState<VenueData[]>([]);', 
`const [venues, setVenues] = useState<VenueData[]>([]);
  const [extractedZips, setExtractedZips] = useState<string[]>([]);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);`);

// 2. Add traffic and 15 mins
txt = txt.replace(/mapbox\/driving\/\$\{lng\},\$\{lat\}\?contours_minutes=20/g, 'mapbox/driving-traffic/${lng},${lat}?contours_minutes=15');

// 3. Setup fetch zip codes
const fetchZips = `setVenues(newVenues);

        if (newVenues.length > 0) {
          setIsExtracting(true);
          try {
            const combinedGeoJSON = { type: "FeatureCollection", features: newVenues.map(v => v.isochrone.features[0]) };
            const supaUrl = import.meta.env.VITE_SUPABASE_URL || 'https://krsbgejnviqyzytxaqaz.supabase.co';            const supaUrl = immport.meta.env.VITE_SUPABASE_            const supaUrl = import.meta.env.VIfetch(supaUrl + '/functions/v1            const supaUrl = import.metamet            c                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + supaKey },
                body: JSON.stringify({ geojson: combinedGeoJSON })
            });
            if (res.ok) {
              const data = await res.json();
              if (data && data.zipCodes) setExtractedZips(data.zipCodes);
            }
          } catch(e) { } finally { setIsExtracting(false); }
        }`;
txt = txt.replace('setVenues(newVenues);', fetchZips);

// 4. Update the return block
const newReturn = `return (
    <div className="flex flex-col gap-4 text-left">
      {polygonDescri      {polygonDescri      {polygonDescrndigo-50 border border-indigo-100 p-4 rounded-xl shadow-sm">
          <h4 className="text-sm font-semibold text-indigo-900 mb-1 flex items-center">
             <MapPin className="w-4 h-4 mr-2 text-indigo-600" />
             Strategic Coverage Areas
          </h4>
          <p className="text-sm text-indigo-800 leading-snug">{polygonDescription}</p>
        </div>
      )}

      <div className="w-full h-[400px] rounded-xl overflow-hidden border border-gray-200 shadow-sm relat      <div className="w-full h-[400px] rounded-xl overflow-hidden
               al               al       (minLng + maxLng) / 2, latitude: (minLat + maxLat) / 2, zoom }}
          style={{ width: '100%', height: '100%' }}
          mapStyle=          mapStyle=          mapStyle=          mapStyle= ven es.map((venue, idx) => (
            <React.Fragment key={idx}>
              <Source id={\`isoch              <Source id={e="geojson" data={venue.isochrone}>
                <L                <L           idx}\`} type="fill" paint={{ 'fill-color': '#4f46e5', 'fill-opacity': 0.15 }} />
                <Layer id={\`isochrone-line-\${idx}\`} type="line" paint={{ 'line-color': '#4f46e5', 'line-width': 2, 'line-opacity': 0.5 }} />
              </Source>
              <Source id={\`venue-point-\${idx}\`} type="geojson" data={{
                type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [venue.lng, venue.lat] }
              }}>
                <Layer id={\`venue-circle-\${idx}\`} type="circle" paint={{ 'circle-radius': 8, 'circle-color': '#ef4444', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' }} />
              </Source>
            </React.Fragment>
          ))}
        </Map>
        
        <div className="absolute bottom-4 right-4 pointer-events-none">
           <div className="bg-white/90 backdrop-blur px-3 py-1.5 rounded-md shadow flex items-center border border-gray-200 text-xs font-medium text-gray-700 pointer-events-auto">
             <div className="w-3 h-3 bg-indigo-500 rounded mr-2 opacity-50 border border-indigo-600"></div>
             15-Min Drive (Traffic)
           </div>
        </div>
      </div>

      {isExtracting ? (
         <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm text-sm text-gray-600 flex items-center">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-500 mr-2" />
            Tracing geographic boundaries to Melissa Data ZIP zones...
         </div>
      ) : extractedZips.length > 0 ? (
         <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm text-left">
            <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center">
               <MapPin className="w-4 h-4 mr-2                <MapPin className="w-4 h-4 mr-2                <MapPin ra               <MapPin className="w-4 h-4 mr-2                <MapPin className="w-4 h-4 mr-2                <MapPin ra               <MapPin className="w-4 h-4 mr-2                              <MapPin className="w-4 h-4 mr-2                <MapPin className="w-4 h-4 mr-2             er               <MapPin cacking-tight                                             </span>
               ))}               ))}               ))}               ))}               ))}               ))}               ))}              on               ))}               ))}               ))}               ))}    nst oldReturnRegex = /return \(\s*<div className="w-full[\s\S]*?\);\n\}/m;
txt = txt.repltxt = txt.repltxt = txt.repltxt = tx');

fs.writeFileSync(path, txt);
console.log("File safely patched!");
