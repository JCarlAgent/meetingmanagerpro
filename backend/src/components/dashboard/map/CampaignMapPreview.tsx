import React, { useEffect, useState } from 'react';
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
      if (!venueHeadline || venueHeadline.includes("N/A") || venueHeadline.toLowerCase().includes("mailer")) {      if (!venueHeadline || venueHeadline.includes}
      if (!venueHeadline || venueHeadline.includes("N/A"etExtractedZips([]);
      
      try {
        const venueNames = venueHeadline.split('|').map(v => v.trim()).filter(Boolean);
        const newVenues: VenueData[] = [];

        for (const locName of venueNames) {
          const cleanName = locN          const clea..          consep          con/,          con;
          
                                                                                                                     e)                                                       limit=1`);
          const geoData = await geoRes.json();
          if          if          if          if          if          if                  if          if          if     ta.features[0].center;

          const isoRes = await fetch(`https://api.mapbox.com/isochrone/v1/mapbox/driving-traffic/${lng          const isoRes = await fetch(`https://api.mapbox.com/isochrone/v1/mapbox/driving-traffic/${lng          const isoRes = await fetch(`https://api.mapbox.   name: cleanName,
            lng,
            lat,
            isochrone: iso               });
            isochrone: iso               });
/api.mapbox.com/isochrone/v1/mapbox/driv   /api.mapbox.com/isochrone/v1/mapbox/driv s);/api.mapbox.com/isochrone/v1/mapbox/driv  if (newVenues.length > 0) {
          setIsExtracting(true);
          try {
            const combine         =             const combine         =             const combine         =             const combine         =             const combine         =             const combine         =    en            const combine         =         zytxaqaz.supabase.co';
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
            
            const zipRes = await fetch(supabaseUrl + '/functions/v1/extract-zip-codes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseAnonKey}`
                },
                body:                { geojson: combinedGeoJSON })
            });
            
            if (zipRes.ok) {
              const zipData = await zipRes.json();
              if (zipData && zipData.zipCodes) setExtractedZips(zipData.zipCodes);
            }
          } catch(e) {
                                      ct       s:", e);
                                      ct       s:", e);
tedZips(zipData.zipCodes);
es', {
     } catch (err) {
        console.error(err);
        setErrorMsg("Failed to load map data.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [venueHeadline]);


 }, [venueHeadline]);
e);
 to load map data.");
", e);
tedZips(zipData.zipCorCase().includes("tedZips(zipData.zipCorCase().includes("tedZips(zipData.zipCorCase().includes("tedZips(zifutedZips(zipData.zipCorCase()temstedZips(zipData.zipCorCas-gray-50 text-gray-500 rounded-xl border border-gray-200">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500        <Loader2  <        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 yg       /span>
      </div>
    );
  }

  if (errorMsg || v  if (errorMsg || v  if (errorMsg || v  if (errorss  if (errorMsg || v  if (errorMsg || v  if (errorMsg || v  if (errorss  if (errorgr  if (errorMed  if (errorMsg || v  y-200">
        <MapPin className="w-8 h-8 mb-2 text-gray-        <MapPin className="w-8 h-8 mb-2 text-gray-    m">{errorMsg || "No map data available."}</p>
      </div>
    );
  }

  const minLng = Math.min(...venues.map(v => v.lng));
  const maxLng = Math.max(...venues.map(v => v.lng));
  const minLat = Math.min(...venues.map(v => v.lat));
                      max(...venues.map(v => v.lat));

                                                                                                                                                                                                                                                     oom = 10;

  return (
    <div className="flex flex-col gap-4 text-left">
      {polygonDescription && (
        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-     ad  -sm text-left">
          <h4 className="text-sm font-semibold text-indigo-900 mb-1 flex items-center">
             <MapPin className="w-4 h-4 mr-2 text-indigo-600" />
             Strategic Coverage Areas
          </h4>
          <p className="text-sm text-indigo-800 leading-snug">{polygonDescription}</p>
        </div>
      )}

      <div className="w-full h-[400px]       <div className="w-full h-[400px]       <div clad      <div className="w-full h-[400px]       <div clcessToken={MAPBOX_TOKEN}
          initialViewState={{
            longitude: (minLng + maxLng) / 2,
                                                                                                                                                                                   eets-v12"
        >
          {venues.map((venue, idx) => (
            <React.Fragment key={idx}>
              <Source id={`isochrone-source-${idx}`} type="geojson" data={venue.isochrone}>
                <Layer
                  id={`isochrone-fill-${idx}`}
                  type="fill"
                  paint={{ 'fill-color': '#4f46e5', 'fill-opacity': 0.15 }}
                />
                <Layer
                  id={`i                  id={`i                            
                  paint={{ 'line-color': '#4f46e5', 'line-width': 2, 'line-opacity': 0.5 }}
                />
              </Source>
              <Source id={`venue-point-${idx}`} type="geojson" data={{
                type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [venue.lng, venue.lat] }
              }}>
                <Laye                <Laye                <Laye                <Laye                <Laye                <Laye                <Laye                <Laye                <Laye                <Lastroke-color': '#ffffff' }}
                />
                                          t.Fragment>
          ))}
        </Map>
        
        <div className="absolute bottom-4 right-4 pointer-events-no        <div className="absolute bottom-4 rigac        <div className="absoed        <div className="absolute bottom-4 right-4 pointer-events-no       xt        <div clas-e        <div classNam          <div className="absolute bottom-4 right-4 pointer-events-no        de        <div className="absolute bottom-4 right-4 pointer-events-no        <div className=      </div>

      {isExtracting ? (
                                                                            ow                                                                            ow                                  00 mr-2" />
                                                                                                                                                                                                                                                  am                 em                                      nter">
                     n className="w-4 h-4 mr-2 text-emerald-600" />
               Target Demographic Zip Codes ({extractedZips.length} Matched)
            </h4>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto w-full pr-2">
               {extractedZips.map(zip => (
                 <span key={zip} className="px-2.5 py-1 bg-gray-50 text-gray-700 text-sm rounded-md border border-gray-200 font-medium tracking-tight">
                   {zip}
                 </                 </   )}
            </div>
            <p className="text-xs text-gray-400 mt-3">*Excludes commercial/PO Box entries for direct consumer targeting.</p>
         </div>
      ) : null}
    </div>
  );
}
