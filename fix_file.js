const fs = require('fs');

const content = `import React, { useEffect, useState } from 'react';
import Map, { Source, Layer } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Loader2, MapPin } from 'lucide-react';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

interface CampaignMapPreviewProps {
  venueHeadline: string;
  polygonDescription?: string;
}

interface VenueData {
  name: string;
  lng: number;
  lat: number;
  isochrone: any;
}

export default function CampaignMapPreview({ venueHeadline, polygonDescription }: CampaignMapPreviewProps) {
  const [venues, setVenues] = useState<VenueData[]>([]);
  const [extractedZips, setExtractedZips] = useState<string[]>([]);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!venueHeadline || venueHeadline.includes("N/A") || venueHeadline.toLowerCase().incl      if (!venueHeadline || venueHeadline.includes("N/A") || ven   }
      setLoading(true);
      setErrorMsg(null);
      setExtractedZips([]);
      
      try {
        const venueNames = venueHeadline.split('|').map(v => v.trim()).filter(Boolean);
        const newVenues: VenueData[] = [];

        for (const locName of venueNames) {
          const cleanName = locN          c(/\\(e\\.g\          con'')          con+-\\s+/, ', ').trim();
          
          const geoRes = await fetch(\`https://api.mapbox.com/geocoding/v5/mapbox.places/\${encodeURIComponent(cleanName)}.json?access_token=\${MAPBOX_TOKEN}&autocomplete          const`);
          const geoData = await geoRes.json();
          if (!geoData.features || geoData.features.length === 0) continue;
          
          const [lng, lat] = geoData.features[0].center;

          const isoRes = await fetch(\`https://api.mapbox.com/isochrone/v1/mapbox/driving-traffic/\${lng},\${lat}?contours_minutes=15&polygons=true&access_token=\${MAPBOX_TOKEN}\`);
          const isoData = await isoRes.json();

          newVenues.push          newVenues.puleanName,
            lng,
            lat,
            isochr          ta            isochr          ta            isochr          ta            isochr        i-rate-limit
        }
        
        setVen        setVen        setVen        Extract Zips
        if (newVenues.length > 0) {
          setIsExtracting(true);
          try {
            const combinedGeoJSON = {
              type: "FeatureCollection",
              features: newVenues.map(v => v.isochrone.features[0])
            };
            
            const supabaseUrl = import.me            const supabaseUrl = import.me    viqyzytxaqaz.supabase.co';
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
            
            const zipRes = await fetch(supabaseUrl + '/functions/v1/extract-zip-codes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': \`Bearer \${supabaseAnonKey}\`
                },
                bod               fy               binedGeoJSON })
            });
            
            if (zipRes.ok) {
              const zipData = await zipRes.json();
              if (zipData && zipData.zipCodes) setExtractedZips(zipData.zipCodes);
            }
          } catch(e) {
                                   tracting zips:", e);
          } finally {
            setIsExtracting(false);
          }
                                                                             setErrorMsg("Failed to load map data.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [venueHeadline]);

  if (!venueHeadline || venueHeadline.includes("N/A") || venueHeadline.toLowerCase().includes("mailer")) {
    return null;
  }

  if (loading) {
    return (
      <div className="w-full h-[400px] flex flex-col items-center justify-center bg-gray-50 text-gray-500 rounded-xl border border-gray-200">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-4" />
        <span className="text-gray-600 font-medium">Mapping Drive-Time Polygons...</span>
      </div>
    );
  }

  if (errorMsg || venues.length === 0) {
    return (
      <div className="w-full h-[400px] flex flex-col items-center justify-center bg-gray-50 text-gray-500 rounded-xl border border-gray-200">
        <MapPin className="w-8 h-8 mb-2 text-gray-400" />
        <p className="text-gray-600 font-medium">{errorMsg || "No map data available."}</p>
      </div>
    );
  }

  const minLng = Math.min(...venues.map(v => v.lng));
  const maxLng = Math.max(...venues.map(v => v.lng));
  const minLat = Math.min(...venues.map(v => v.lat));
  const maxLat = Math.max(...venues.map(v => v.lat));

  const lngDiff = maxLng - minLng;
  const latDiff = maxLat - minLat;
  const maxDiff = Math.max(lngDiff,  const maxDiff = Math.max(lngDiff,  const maxDiff = Math.max(lngDiff,  const maxDiff = Math.max(lngDiff,  const maxDiff = Math.max(lngDiff,oo  const maxDiff = Math.max(lngDiff,  const maxDiff = Math.max(lngDiff,        {polygonDescription && (
        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl shadow-sm        <div className="bg-indigo-50 boex        <diemibold text-indigo-900 mb-1 flex items-center">
             <MapPin className="w-4 h-4 mr-2 text-indigo-600" />
             Strategic Coverage Areas
          </h4>
          <p className="text-sm text-indigo-800 leading-snug">{polygonDescription}</p>
        </div>
      )}

      <div className="w-full h-[400px] rounded-xl overflow-hidden border border-gray-200 shadow-sm relative z-0">
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          initialViewState={{
            longitude: (minLng + maxLng) / 2,
            latitude: (minLat + maxLat) / 2,
            zoom: zoom
          }}          }}          }}          }}          }}          }}          }}          }}          }}          }}          }}          }}          }}          }}          }}          }}          }}          }}          }}          }}          }}          }}          }}          }}  ue.isochrone}>
                <Layer
                  id={\`isochrone-fill-\${idx}\`}
                  type="fill"
                  paint={{ 'fill-color': '#4f46e5', 'fill-opacity': 0.15 }}
                />
                <Layer
                                                                    type                                                                    type             ac          }}
                                                                                    ${idx}\`} type="geojson" data={{
                type:                 type:  {}, geometry: { type: 'Point', coordinates: [venue.lng, venue.lat] }
              }}>
                                                    -c                                   type="circle"
                  paint={{ 'circle-radius': 8, 'circle-color': '#ef4444', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' }}
                />
              </Source>
            </React.Fragment>
          ))}
        </Map>
        
        <div className="absolute bottom-4 right-4 pointer-events-none">
           <div className="bg-whi           <div className="b1.5 rounded-md shadow flex items-center border border-gray-200 text-xs font-me           <div 00 pointer-events-auto">
                                                                                                                                                             div>
        </d        </d        </d        </d        </d        </d        </d        </d        </d     y-200 p-4 rounded-xl sha        </d        </d        </d        </d        </d        </d        </d        </d        </d     y-200 p-o-        </d               </d        </d        </d        </d        </d        </d        </d        </d        </d  Zi        </d        </d        </d        </d        </d        </d        </d        </d        </d     y-200 p-4 rounded-xl sha      am        </d    -semibold text-gray-900 mb-2 flex items-center">
                     n className="w-4        2 text-emerald-600" />
               Target Demographic Zip Codes ({extractedZips.length} Matched)
            </h4>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto w-full pr-2">
               {extractedZips.map(zip => (
                 <span key={zip} className="px-2.5 py-1 bg-gray-50 text-gray-700 text-sm rounded-md border border-gray-200 font-medium tracking-tight">
                   {zip}
                 </span>
               ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">*Excludes commercial/PO Box entries for direct consumer targeting.</p>
         </div>
      ) : null}
    </div>
  );
}
`;

fs.writeFileSync('backend/src/components/dashboard/map/CampaignMapPreview.tsx', content);
console.log('File successfully rewritten.');

