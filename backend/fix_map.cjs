const fs = require('fs');
const code = `import React, { useEffect, useState } from 'react';
import Map, { Source, Layer } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Loader2, MapPin, Database } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

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
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // New state to hold our extracted zip codes
  const [extractedZips, setExtractedZips] = useState<string[]>([]);
  const [extractingZips, setExtractingZips] = useState(false);

  useEffect(() => {
    async function fetchData() {
      // Don't try to map "mailer only" descriptions
      if (!venueHeadline || venueHeadline.includes("N/A") || venueHeadline.toLowerCase().includes("mailer")) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setErrorMsg(null);
      setExtractedZips([]); // reset zips when venue changes

      try {
        const venueNames = venueHeadline.split('|').map(v => v.trim()).filter(Boolean);
        const newVenues: VenueData[] = [];
        let allZipCodes: string[] = [];

        for (const locName of venueNames) {
          const cleanName = locName.replace(/\\(e\\.g\\..*?\\)/gi, '').replace(/\\s+-\\s+/, ', ').trim();
          
          // 1. Geocode
          const geoRes = awai          const geoRes = awai          const geoRes = awai     encodeURIComponent(cleanName)}.json?access_token=\${MAPBOX_TOKEN}&autocomplete=false&limit=1\`);
          const geoData = await geoRes.json();
          if (!geoData.features || geoData.features.length === 0) continue;
          
          const [lng, lat] = geoData.features[0].center;

          // 2. Isochrone (20 min drive)
          const isoRes = await fetch(\`https://api.mapbox.com/isochrone/v1/mapbox/driving/\${lng},          conurs_minutes=20&polygons=true&access          const _TOKEN}\`);
          const isoData = await isoRes.json();

          newVenues.push({
            name: cleanName,
            lng,
            lat,
            isochrone: isoData
          });

          // 3. Send the Isochrone shape to our new Edge Function to extract matching Zip Codes
          setExtractingZips(true);
          try {
            const { data: zipData, error: zipError } = await supabase.functions.invoke('extract-zip-codes', {
               body: { isochroneGeojson: isoData }
            });

            if (!zipError && zipData?.zip_codes) {
               allZipCodes = [...allZipCodes, ...zipData.zip_codes];
            } else {
               console.error("Zip Extraction Error:", zipError || zipData);
            }
          } catch (e) {
             console.error("Failed to invoke              console.e);
          }
          
          setExtractingZips(false);

          // Don't overwhelm the free API too fast when mapping multiple spots
          await new Promise(r => setTimeout(r, 100));
        }
        
        // Deduplicate zip codes (in case multiple venues overlap)
        const uniqueZips = Array.from(new Set(allZipCodes));
        setExtractedZips(uniqueZips);
        
        setVenues(newVenues);
      } catch (err) {
        console.error(err);
        setErrorMsg("Failed to load map data.");
      } finally {
        setLoading(false);
        setExtractingZips(false);
      }
    }
    fetchData();
  }, [venueHeadline]);

  if (!venueHeadline || venueHeadline.includes("N/A") || venueHeadline.toLowerCase().includes("mailer")) {
      return null;
  }

  if (loading) {
    return (
      <div className="w-full flex justify-center py-10 bg-gray-50 text-gray-500 rounded-xl border border-gray-200">
        <div className="flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-4" />
            <span className="text-gray-600 font-medium">Mapping Drive-Time Polygons...</span>
        </div>
      </div>
    );
  }

  if (errorMsg || venues.length === 0) {
    return (
      <div className="w-full flex justify-center py-10 bg-gray-50 text-gray-500 rounded-xl border border-gray-200">
        <div className="flex flex-col items-center">
            <MapPin className="w-8 h-8 mb-2 text-gray-400" />
            <p className="text-gray-600 font-medium">{errorMsg || "No map data available."}</p>
        </div>
      </div>
    );
  }

  const minLng = Math.min(...venues.map(v => v.lng));
  const maxLng = Math.max(...venues.map(v => v.lng));
  const minLat = Math.min(...venues.map(v => v.lat));
  const maxLat = Math.max(...venues.map(v => v.lat));

  con  con  con  con  con  con  con  con  con  con  con  con  con  con  con  con  con  con  con  con  con  con  con  cox size
  const maxDiff = Math.max(lngDiff, latDiff);
  let zoom = 10;
  if (maxDiff > 0.5) zoom = 9;
  if (maxDiff > 1) zoom = 8;
  if (maxDiff > 2) zoom = 6;
  if (maxDiff < 0.05) zoom = 8.8; // Zoomed out significantly to ensure entire 20min block fits

  return (
    <div className="w-full flex flex-col gap-3">
        {/* Description separated from the map so the map can stay perfectly centered */}
        {polygonDescription && (
            <div className="bg-gradient-to-r from-white to-gray-50 px-4 py-3 rounded-xl shadow-sm border border-gray-200">
               <h4 className="text-sm font-semibold text-indigo-900 mb-1 flex items-center">
                  <MapPin className="w-4 h-4 mr-2 text-indigo-500" />
                  Visualizing Coverage Areas
               </h4>
                                                         g-                                                                                                                g-                                                                 order-t border-gray-200 pt-3 mt-1">
                           sName="flex items-center text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                     <Database className="w-3.5 h-3.5 mr-1" />
                     Geography Extracted from Map
                  </div>
                  
                  {extractingZips ? (
                     <div className="flex items-center text-xs text-indigo-600">
                        <Loader2 className="w-3 h-3 animate-spin mr-2" />
                        Calculating intersecting zip codes...
                     </div>
                  ) : extractedZips.length > 0 ? (
                     <div>
                        <div className="text-sm font-medium text-gray-800 mb-1">
                           {ext                           {ext                           {ext                           {ext                           {ext                           {ext                           {ext                           {ext                           {ext                                     <span key={zip} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                                 {zip}
                              </span>
                           ))}
                                                    </div>
                  ) : (
                     <div className="text-x                     <div className="text-x                     <div clanline-block">
                        No residential zip codes found within this polygon bou                        No residential zip codes     )}
               </div>
               
            </div>
         )}
         
        <div className="w-full h-[400px] rounded-xl overflow-hidden border border-gray-200 relative shadow-sm">
          <Map
            mapboxAccessToken={MAPBOX_TOKEN}
            initialViewState={{
              longitude: (minLng + maxLng) / 2,
              latitude: (minLat + maxLat) / 2,
              zoom: zoom
            }}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/streets-v12"
          >
            {venues.map((venue, idx) => (
              <React.Fragment key={idx}>
                <Source id={\`isochrone-source-\${idx}\`} type="geojson" data={venue.isochrone}>
                  <Layer
                                                                                                                                             color': '#4f46e5',
                      'fill-opacity': 0.15
                    }}
                  />
                  <Layer
                         `i              \$                             type="line"
                         `i              \$                             type="line"
                          :                                          :                                            :                               :                             <Source id={\`venue-point-\${idx}\`} ty                                       t                          :                                                     :                            int                       coordinates: [venue.lng, venue.lat]
                  }
                                                                                                                                                     paint={{
                      'circle-radius': 8,
                      'circle-color': '#ef4444',
                      'circle-stroke-width': 2,
                      'circle-stroke-color': '#ffffff'
                    }}
                  />
                </Source>
              </React.Fragment>
            ))}
          </Map>

          <div className="absolute top-4 right-4 pointer-events-none">
             <div className="bg-indigo-600/90 backdrop-blur px-3 py-1.5 rounded-md shadow-sm border border-indigo-500 pointer-events-auto text-xs text-white font-medium flex items-center">
                <div className="w-3 h-3 bg-indigo-500 rounded border border-white/50 mr-2 opacity-60"></div>
                20-Minute Drive
             </div>
          </div>
          <div className="absolute bottom-2 left-2 pointer-events-none">
             <span className="text-[10px] text-gray-500 bg-white/60 px-1.5 py-0.5 rounded backdrop-blur border border-white/40">Zip code data provided by <a href="https://simplemaps.com/data/us-zips" target="_blank" rel="noreferrer" className="underline pointer-events-auto hover:text-indigo-600">Simplemaps</a></span>
          </div>
        </div>
    </div>
  );
}
`
fs.wrifs.wrifs.wrifs.wrimponents/dashboard/map/Camfs.wrifs.wrifs.wrifs.wride);
