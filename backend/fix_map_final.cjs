const fs = require('fs');

const code = `import React, { useState, useEffect } from 'react';
import Map, { Source, Layer } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Loader2, MapPin, Navigation } from 'lucide-react';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoiYmFybmVzbWFjIiwiYSI6ImNtNzQyOG5zZTA1bHMybnM2cXFwdXh3YjMifQ.R7Pnj4uRmbB2aZ0jCng3Lw';

interface CampaignMapPreviewProps {
  venueHeadline?: string;
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
  const [errorMsg, setErrorMsg] = useState("");
  const [extractedZips, setExtractedZips] = useState<string[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);

  useEffect(() => {
    if (!venueHeadline     if (!venueHeadline  s("N/A") || venueHeadline.toLowerCase().includes("mailer")) {
      setLoading(false);
      return;
    }

    async function fetchData() {
      try {
        setLoading(true);
        setErrorMsg("");
        setExtractedZip        setExtractedZip        setExtractedZip        setExtractedZip        setExtractedZip        setExtractedZip        setExtractedZip        setExe of locNames) {
          const cleanName = locName.replace(/\\(e          const cleanName = l(/\\s+-\\s+/, ', ').trim();
          
          const geoRes = await fetch(\`https://api.mapb          const geoRes = await fetch(\`https://api.mapb          const geoRes = await fetch(\`https://api.mco          const geoRes = await fetch(\`https://api.mapbt geoRes.json();

          if (geoData.features && geoData.features.length > 0) {
            const [lng, lat] = geoData.features[0].center;

            const isoRes = await fetch(\`https://api.mapbox.com/isochrone/v1/mapbox/driving-traffic/\${lng},\${lat}?contours_minutes=15&polygons=true&access_token=\${MAPBOX_TOKEN}\`);
            const isoData = await isoRes.json();

            if (isoData.features) {
              newVenues.push({ name: cleanName, lng, lat, isochrone: isoData });
                                                                                                                                                                     const combinedGeoJSON = { typ                                                        sochrone.features[0]) };
            const supaUrl = import.meta.env.VITE_SUPABASE_URL || 'https://lccfprbtmsphesudrpqb.supabase.co';
            const supaKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
            
            if (supaKey) {
              const res = await fetch(supaUrl + '/functions/v1/extract-zip-codes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + supaKey },
                body: JSON.stringify({ geojson: combinedGeoJSON })
              });
              if (res.ok) {
                const data = await res.json();
                if (data && data.zipCodes) setExtractedZips(data.zipCodes);
              }
            }
          } catch(e) { 
            console.error("Zip extraction error", e); 
          } finally { 
            setIsExtracting(false); 
          }
        }
      } catch (err) {
        console.error("Geocoding error:", err);
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

  const maxDiff = Math.max(lngDiff, latDiff);
  let zoom = 10;
  if (maxDiff > 0.5) zoom = 9;
  if (maxDiff > 1) zoom = 8;
  if (maxDiff > 2) zoom = 6;
  if (maxDiff < 0.05) zoom = 11;

  const description = polygonDescription && !polygonDescription.includes("N/A") ? polygonDescription : null;

  return (
    <div className="flex flex-col gap-4 text-left">
      {description && (
        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl shadow-sm">
          <h4 className="text-sm font-semibold text-indigo-900 mb-1 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-indigo-600" /> Strategic Coverage Areas
          </h4>
          <p className="text-sm text-indigo-800 leading-relaxed">{desc          <p className="text-sm text-indigo-800 lelass          <p className="text-sm text-indigo-800 leadlo          <p className="text-sm text-indigo-800 lead
                                                   KEN}
          initialViewState={{
            longitude: (minLng + maxLng) / 2,
            latitude: (minLat + maxLat) / 2,
            zoom: zoom
          }}
          style={{ width: "100%", height: "100%" }}
          mapStyle="mapbox://styles/mapbox/light-v11"
        >
          {venues.map((venue, idx) => (
            <React.Fragment key={idx}>
              <Source id={              <Source id={              <So" data={venue.isochrone}>
                <Layer
                  id={\`isochrone-fill-\${idx}\`}
                  type="fill"
                  paint={{
                    "fill-color": "#4f46e5",
                    "fill-opacity": 0.15
                  }}
                />
                <Layer
                  id={\`isochrone-line-\${idx}\`}
                  type="line"
                  paint={{
                    "line-color": "#4338ca",
                    "line-width": 2,
                    "line-dasharray": [2, 2]
                  }}
                />
              </Source>
              </Source>
e{\`marker-source-\${idx}\`} type="geojson" data={{
                type: "FeatureCollection",
                features: [{ type: "Fe                features: [{ type: "Fe          [ven                features: [{ type: "Fe                }}>
                <Layer
                  id={\                  id={\                    type="circle"
                  paint={{
                    "circle-radius": 8,
                    "circle-color": "#ef4444",
                    "circle-stroke-width": 2,
                    "circle-stroke-color": "#ff                    "circle-stroke-color": />                    "circle-stroke-coloReact.Fragment>
          ))}
        </Map>
        
        <di        <di        <di        <di        <di    vents-none">
          <div className="bg-white/90 backdrop-blur px-3 py-1.5 rounded-md shadow flex items-center border border-gray-200 text-          <div className="bg-white/90 backd-a          <div clasdi          <div c h-3 bg-indigo-500 rounded           <div classNa b          <div className="bg-white/90 backdrop-blu(Traffic)
          </div>
        </div>
      </div>

      {isExtracting ? (
        <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm text-sm text-gray-600 flex items-center">
          <Lo          <Lo          <Lo          <Lo          <Lo          <Lo          <Long       phic boundaries to M          <Lo          <Lo        /div>
      ) : extractedZips.length > 0 ? (
        <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm">
          <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center tracking-tight">
            <Navigation className="w-4 h-4 text-indigo-            <Navigation className="w-4 h-4 text-indigo-            <Na  <div className="flex flex-wrap gap-1.5">
            {extractedZips.map((zip, i) => (
              <span key={i} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                {zip}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
`;

fs.writeFileSync('src/components/dashboard/map/CampaignMapPreview.tsx', code);
console.log("File properly written!");
