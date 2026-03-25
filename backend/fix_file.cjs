const fs = require('fs');

const code = `import React, { useEffect, useState } from 'react';
import Map, { Source, Layer } from 'react-map-gl';
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
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      // Don't try to map "mailer only" descriptions
      if (!venueHeadline || venueHeadline.includes("N/A") || venueHeadline.toLowerCase().includes("mailer")) {
        setLoading(        setLoading(  n;
      }
      setLoading(true);
      setErrorMsg(null);
      try {
        const venueNames = venueHeadline.split('|').map(v => v.trim()).filter(Boolean);
        const newVenues: VenueData[] = [];

        for (const locName of venueNames) {
          const cleanName = locName.replace(/\\(e\\.g\\..*?\\)/gi, '').replace(/\\s+-\\s+/, ', ').trim();
          
          // 1. Geocode
          const geoRes = await fetch(\`https://api.mapbox.com/geocoding/v5/mapbox.places/\${encode          const geoRes = await fetch(\`https://api.mapbox.com/geocoding/v5/mapbox.places/\${encode         geoData = await geoRes.json();
          if (!geoData.features || geoData.features.length === 0) continue;
          
          const [lng, lat] = geoData.features[0].center;

          // 2. I          // 2. I          // 2            // 2. I  it fetch(\`https://api.mapbox.com/isochrone/v1/mapbox/driving/\${lng},\${lat}?contours_minutes=10&polygons=true&access_token=\${MAPBOX_TOKEN}\`);
          const isoData = await isoRes.json();

          newVenues.push({
            name: cleanName,
            lng,
            lat,
            isochrone: isoData
          });
          
          // Don't overwhelm the free API too fast when mapping multiple spots
          await new Promise(r => setTimeout(r, 100));
        }
        setVenues(newVenues);
      } catch (err) {
        console.error(err);
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
  const maxLng = Math.max  const maxLng = Math.max))  cononst minLat = Math.min(...venues.map(v => v.lat));
  const maxLat = Math.max(...venues.map(v => v.lat));

  const lngDiff = maxLng - minLng;
  const latDiff = maxLat - minLat;

  //  //  //  //  /at  //  //  /d on bounding box size
  const maxDiff = Math.max(lngDiff, latDiff);
  let zoom = 10;
  if (maxDiff > 0.5) zoom = 9;
  if (maxDiff > 1) zoom = 8;
  if (maxDiff > 2) zoom = 6;
  if (maxDiff < 0.05) zoom = 12; // zoom in  if (maxDiff < 0.05) zoom = 12; // zoom in  if (maxDiff < 0.05) zoom = 12; // zoom in  rf  if (maxDibo  if bo der-  if (maxDiff < 0.05) zoom = 12; // <Map
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{
          longitude: (minLng + maxLng) / 2,
          latitude: (minLat + maxLat) / 2,
          zoom: zoom
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/light-v11"
      >
        {venues.map((venue, idx)        {venues.map((venue, idx)      dx}>
                                                                                                                                                                                  type="fill"
                pai                pai              or': '#4f46e5',
                  'fill-opacity': 0.15
                                                  <Layer
                id={\`isochrone-line-\${                id={\`isoche=                       paint=                id={\`isochrone-line-\${                id={\`isoche=                       paint=                id={\`isochrone-line-\${                id={\`isoche=                       paint=      <Source id={\`venue-point-\${idx}\`} t                id={\`isoc                  id={\`isochrone-line-\${  pe                id={\`isochrone-line-\${                   'Point',
                coordinates: [venue.lng, venue.lat]
              }
            }}>
              <Layer
                                                                                                                                                                                                                                                                                   ff'
                }}
              />
            </Source>
                                              <                                              <      ght-4 pointer-events-none flex flex-col gap-2">
         {polygonDescription && (
            <div className="bg-white/90 backdrop-blur px-4 py-3 rounded-lg shadow-sm border border-gray-100 max-w-lg pointer-events-auto">
               <h4 className="text-sm font-semibold text-indigo-900 mb-1 flex items-center">
                  <MapPin className="w-4 h-4 mr-2 text-indigo-500" />
                  Visualizing Coverage Areas
               </h4>
               <p className="tex               <p className="tex               <    {polygonDescription}
               </p>
            </div>
         )}
         <div className="bg-indigo-600/90 backdrop-blur px-3 py-1.5 rounded-md shadow-sm self-start border border-indigo-500 pointer-events-auto text-xs text-white font-medium flex items-center">
            <div className="w-3 h-3 bg-indigo-500 rounded border border-white/50 mr-2 opacity-60"></            <div claMinute Drive Isochrone
         </div>
      </div>
    </div>
  );
}
`;

fs.writeFileSync('src/components/dashboard/map/CampaignMapPreview.tsx', code);
