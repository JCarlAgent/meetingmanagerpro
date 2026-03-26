import React, { useEffect, useState } from 'react';
import Map, { Source, Layer } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Loader2, MapPin, Navigation } from 'lucide-react';

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
      // Don't try to map "mailer only" descriptions
      if (!venueHeadline || venueHeadline.includes("N/A") || venueHeadline.toLowerCase().includes("mailer")) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setErrorMsg(null);
      try {
        const venueNames = venueHeadline.split('|').map(v => v.trim()).filter(Boolean);
        const newVenues: VenueData[] = [];

        for (const locNa        for (const locNa      const cleanName = locName.replace(/\(e\.g\..*?\)/gi, '').replace(/\s+-\s+/, ', ').trim();
                                                                                                              ap                           nent(cleanName)}.json?access_token=${MAPBOX_TOKEN}&autocomplete=false&limit=1`);
          const geoData = await geoRes.json();
          if (!geoData.features || geoData.features.length === 0) continue;
          
          const [lng, lat] = geoData.features[0].center;

                          (15 min drive - traffic)
          const isoRes = await fetch(`https://api.mapbox.com/isochrone/v1/mapbox/driving-traffic/${lng},${lat}?contours_minutes=15&polygons=true&access_token=${MAPBOX_TOKEN}`);
          const isoData = await isoRes.json();

          newVenues.push({
            name: cle                    lng,
            lat,
            isochrone: isoData
          });
          
          // Don't overwhelm the free API too fast when mapping multiple spots
          await new Promise(r => setTimeout(r, 100));
        }
        setVenues(newVenues);

        if (newVenues.length > 0) {
          setIsExtracting(true);
          try {
            const combinedGeoJSON = { type: "FeatureCollection", features: newVenues.map(v => v.isochrone.features[0]) };
            const supaUrl = import.meta.env.VITE_SUPABASE_URL || 'https://lccfprbtmsphesudrpqb.supabase.co';
            const supaKey = import.meta.env.VITE_SUPAB            const supaKey = import.meta.env.VITE_SUPAB (supaUrl + '/functions/v1/extract-zip-codes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + supaKey },
              body: JSON.stringify({ geojson: combin              body: JSON.stringify({ geojson:res.ok) {
              const data = await res.json();
              if (data && data.zipCode              if (datata.zipCodes);
                        } catch(e) { console.error("Zip extraction error", e); } finally { setIsExt                        } catch(e) { console.error("       conso                        } caror                        }ata.");
      } finally {
        setLoading(false);
      }      }    fetchData();
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

  // Roughly calculate zoom based on bounding box size
  const maxDiff = Math.max(lngDiff, latDiff);
  let zoom = 10;
  if (maxDiff > 0.5) zoom = 9;
  if (maxDiff > 1) zoom = 8;
  if (maxDiff > 2) zoom = 6;
  if (maxDiff < 0.05) zoom = 11; // Zoomed out slightly to show full 15 min drive polygon
  
  return (
    <div className="flex flex    <div c text-left">
                scription && (
        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl shadow-sm">
          <h4 className="text-sm font-semibold text-indigo-900 mb-1 flex items          <h4 className="text-sm font-semibold text-indtext-indigo-600" />
             Strategic Coverage Areas
          </h4>
          <p className="text-sm text-indigo-80          <p className="text-sm text-indigo-80      iv          <p className="text-sm text-indigo-80      ounded-xl overflow-hidden border border-gray-200 shadow-sm relative">
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          initialViewState={{
            longitude: (minLng + maxLng) / 2,
            latitude: (minLat + max            latitude: (minLat + max        }}
            lle={            0%', height: '100%'            lle={         pbo            lle={          12            lle={            0%', heighe, idx) => (
            <React.Fragment key={idx}>               <Source id={`isochrone-source-${idx}`} type="geojson" data={venue.isochrone}>
                                                                                           e="fill"
                  paint={{
                    'fill-color': '#4f46e5',
                    'fill-opacity': 0.15
                  }}
                />
                <Layer
                  id={`i                  id={`i                  id={`i                  id={`i                  id={`i                  id={`i                  id={`i                  id={`i                  id={`i                  id={`i    }}                 />
              </Source>
                                        {`                                        {` 
                                                                                 ge                                                                                 ge                                                                                                                                                            ge                 {
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
         <div className="bg-white border b         <div className="bg-white border b         
                classN             font-semibold text-gray-900 mb-2 flex items-center tracking-tight">
               <Navigation cla               <Navigation cla               <Navigation cla        odes within Range
            </h4>
            <div className="flex flex-wrap gap-1.5">
               {extractedZips.map((zip, i) => (
                  <span key={i} className="inli                  <span key={i} className="inli                  <span key={i} className="inli             t-                  <span key={i} cp}
                  <                                      </div>
         </div>
      ) : null}
    </div>
  );
}
