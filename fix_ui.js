const fs = require('fs');
const path = 'backend/src/components/dashboard/map/CampaignMapPreview.tsx';
let txt = fs.readFileSync(path, 'utf8');

// 1. the state variables
txt = txt.replace('const [venues, setVenues] = useState<VenueData[]>([]);',
  'const [venues, setVenues] = useState<VenueData[]>([]);\n  const [extractedZips, setExtractedZips] = useState<string[]>([]);\n  const [isExtracting, setIsExtracting] = useState<boolean>(false);');

// 2. The mapbox fetch call for traffic/15min
txt = txt.replace(/https:\/\/api.mapbox.com\/isochrone\/v1\/mapbox\/driving\/\$\{lng\},\$\{lat\}\?contours_minutes=20/g,
  'https://api.mapbox.com/isochrone/v1/mapbox/driving-traffic/${lng},${lat}?contours_minutes=15');

// 3. adding zip extraction logic
txt = txt.replace('setVenues(newVenues);', `setVenues(newVenues);
        
        // --- ZIP CODE EXTRACTION ---
        if (newVenues.length > 0) {
          setIsExtracting(true);
          try {
            const combinedGeoJSON = {
              type: "FeatureCollection",
              features: newVenues.map(v => v.isochrone.features[0])
            };
            
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://krsbgejnviqyzytxaqaz.supabase.co';
            const supabaseAnonKey =             const supabaseAnonKey =             const supabaseAnonKey =             const supabaseAnonKey =             const supabaseAnonKey =             const supabaseAnonKey =             cons method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + supabaseAnonKey
                },
                body: JSON.stringify({ geojson: combinedGeoJSON })
            });
                                  s.ok                                  s.ok                                  (zipData && zipData.zipCodes) setExtractedZips(zipData.zipCodes);
            } else {
              console.er              ction error response:", await zipRes.text());
            }
          } catch(e) {
            console.error("Error extracting zips:", e);
          } finally {
            setI            setI            setI            setI            setI            setI            setI            setla            setI            setI            setI            setI            setI            setI            setI            setla            setI            setI            setI            setI            setI            setI            setI      -2            setI          &            setI            setI            setI      kd            setI            setI            setI             border-indigo-500 point            setI            setI            setI            setI \s            ame=            setI            setI            setI            setI            setI            setI            setI            setla            setI            setI           Name="flex flex-col gap-4">
      {/* 1. The Description Card above Map */}
      {polygonDescription && (
        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl shadow-sm text-left">
          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 clas          <h4 nue, idx) => (
            <React.Fragment key={idx}>
              <S              <S             \$              <S              <S             \$              <S              <S             \$   ochrone-fill-\${idx}\`}
                  type="fill"
                  paint={{ 'fill-color': '#4f46e5', 'fill-opacity': 0.15 }}
                />
                <Layer
                  id={\`isochrone-line-\${idx}\`}
                  type="line"
                  paint={{ 'line-color': '#4f46e5', 'line-width': 2, 'line-opacity': 0.5 }}
                />
              </Source>
              <Source id={\`venue-point-\${idx}\`} type="geojson" data={{
                type: 'Feature', geometry: { type: 'Point', coordinates: [venue.lng, venue.lat] }, properties: {}
              }}>
                <Layer
                  id={\`venue-circle-\${idx}\`}
                  type="circle"
                  paint={{ 'circle-radius': 8, 'circle-color': '#ef4444', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' }}
                />
              </Source>
            </React.Fragment>
          ))}
        </Map>
        
        {/* Isochrone Legend Overlay (Bottom Right) */}
        <div className="absolute bottom-4 right-4 pointer-events-none">
           <div className="bg-white/90 backdrop-blur px-3 py-1.5 rounded-md shadow            <div c border border-gray-200 text-xs font-medium text-gray-700 pointer-events-auto">
             <div className="w-3 h-3 bg-indigo-500 rounded mr-2 opacity-50 border border-indigo-600"></div>
                          (6                          </div>
        </div>
      </div>

      {/* 3. Zip Codes Extracted */}      {/* 3. Zip Codes Extracted */}      {/* 3. Zip Codes Extracted */}      {/* 3. Zip Codes Extracted */}    sm      {/* 3.00 flex items-center">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-500 mr-2" />
            Tracing geographic boundaries to Melissa Data ZIP zones...
         </div>
      ) : extractedZips.length > 0 ? (
         <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm text-left">
            <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center">
               <MapPin className="w-4 h-4 mr-2 text-emerald-600" />
               Target Demographic Zip Codes ({extractedZips.length} Matched)
            </h4>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto w-full">
               {extractedZips.map(zip => (
                 <span key={zip} className="px-2.5 py-1 bg-gray-50 text-gray-700 text-sm rounded-md border border-gray-200 font-medium">
                   {zip}
                 </span>
               ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">*Excludes commercial/PO Box entries for direct consumer targeting.</p>
         </div>
      ) : null}
    </div>
  );`);

fs.writeFileSync(path, txt);
console.log("Success");
