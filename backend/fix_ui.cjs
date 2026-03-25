const fs = require('fs');

const code = `import React, { useEffect, useState } from 'react';
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
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      // Don't try to map "mailer only" descriptions
      if (!venueHeadline || venueHeadline.includes("N/A") || venueHeadline.toLowerCase().includes("mailer")) {
        setLoa        setLoa       return        setLoa        sing(true);
      setErrorMsg(null);
      try {
        const venueNam        const venueNam        const venueNam        consBoolean);
        const newVenues: VenueData[] = [];

        for (const locName of venueNames) {
          const cleanName = locName.replace(/\\(e\\.g\\..*?\\)/gi, '').replace(/\\s+-\\s+/, ', ').trim();
          
          // 1. Geocode
          const geoRes = await fetch(\`https://          ccom/geocoding/v5/ma          const ncode          const geoRes = await fetch(\`https://          ccom/geocoding/v5/ma          const ncode      st geoData = await geoRes.json();
          if (!geoData.features || geoData.features.length === 0) continue;
          
          const [lng, lat] = geoData.features[0].center          const [l I          const [lng, lat] = ge   const isoRes = await fetch(\`https://api.mapbox.com/          const [lng, lat] = geoData.features[0].center          const [l I          const [lng, lat] = ge   );
          const isoData = await isoRes.json();

          newVenues.push({          newVenues.pusnN                 lng,
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
      <div className="w-      <div className="w-      <div className="w-      <div className="w-      <div className="w-      <div className="w-      <div className="w-      <div className="w-      <div className="w-      <div className="w-      <div className="w-      <div className="w-      <medium">Mapping Drive-Time Polygons...</span>
                                                                            0               (
                             fl            en          bg-gray-50 text-gray-500 rounded-xl border border-gray-200">
        <div className="flex flex-col items-center">
            <MapPin className="w-8 h-8 mb-2 text-gray-400" /            <MapPin ssName="text-gray-600 font-medium">{errorMsg || "No map data available."}</p>
        </div>
                             nst minLng = Math.min(...venues.m                     nst                             nst minLng = Math.min(...venues.m                     nst                   nst maxLat = Math.max  ..venues.map(v => v.lat));

  const lngDiff = maxLng - minLng;
  const latDiff = maxLat - minLat;

  // Roughly calculate zoom based on bounding box size
  const maxDiff = Math.max(lngDiff, latDiff);
  let zoom = 10;
  if (maxDiff > 0.5) zoom = 9;
  if (maxDiff > 1) zoom = 8;
  if (maxDiff > 2) zoom = 6;
  if (maxDiff < 0.05) zoom = 8.8; // Zoomed out significantly to ens  if (maxDiff < 0.05) zoom = 8.8; // Zoomed out significantly to ens  if (maxDiff < 0.05) zo     {/* Description separated from the map so the map can stay perfectly centered */}
        {polygonDescription &&         {polygonDescription &&         {polygonDesc-w        {polygonDescription &&         {polygonDescription &&         {polygonDesc-w        {polygonDescription &&         {polygonDescription &&         {pcenter">
                  <MapPin className="w-4 h-4 mr-2 text-indigo-500" />
                  Visualizing Coverage Areas
               </h4>
               <p className="text-sm text-gray-600 leading-snug">
                  {polygonDescription}
                                                                             ssN                                               n border                                                <Map
            mapboxAccessToken={MAPBOX_TOK            mapboxAccessTokSt            mapboxAccessTokude: (minLng + maxLng) / 2,
              latitude: (minLat + maxLat) / 2,
              zoom: zoom
            }}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/streets-v12"
          >
                                                                                                                                                                                                                                                                                                                                                                                                       l-opacity': 0.15
                    }}
                  />
                  <Layer
                    id=                    id=                    id=                    id=                    id=                    id=                    id=                    id=                    id=              'line-opacity': 0.5
                    }}
                  />
                </Source>
                
                                                     type="geojson" data={{
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'Point',
                    coordinates: [venue.lng, venue.lat]
                  }
                }}>
                  <Layer
                    id={\`venue-circle-\${idx}\`}
                    type="circle"
                    paint={{
                      'circle-radius': 8,
                      'circle-color': '#ef4444',
                      'circle-stroke-width': 2,
                      'circle-stroke-color':                                                                                           'circle-stroke-color':                                                                                           'circle-stroke-color':                                                                                  sm border border-indigo-5                   uto text-xs text-white font-medium flex items-center">
                <div className="w-3 h-3 bg-indigo-500 rounded border border-white/50 mr-2 opacity-60"></div>
                20-Minute                 20-Minute                     20-Minute       </d                20-Minute                 20-Minuashboar                20review.tsx', code);
