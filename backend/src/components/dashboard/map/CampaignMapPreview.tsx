import React, { useEffect, useState } from 'react';
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
        setLoading(false);
        return;
      }
      setLoading(true);
      setErrorMsg(null);
      try {
        const venueNames = venueHeadline.split('|').map(v => v.trim()).filter(Boolean);
        const newVenues: VenueData[] = [];

        for (const locName of venueNames) {
          const cleanName = locName.replace(/\(e\.g\..*?\)/gi, '').replace(/\s+-\s+/, ', ').trim();
          
          // 1. Geocode
          const geoRes = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleanName)}.json?access_token=${MAPBOX_TOKEN}&autocomplete=false&limit=1`);
          const geoData = await geoRes.json();
          if (!geoData.features || geoData.features.length === 0) continue;
          
          const [lng, lat] = geoData.features[0].center;

          // 2. Isochrone (10 min drive)
          const isoRes = await fetch(`https://api.mapbox.com/isochrone/v1/mapbox/driving/${lng},${lat}?contours_minutes=10&polygons=true&access_token=${MAPBOX_TOKEN}`);
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
        if (newVenues.length === 0 && venueNames.length > 0) {
            setErrorMsg("Could not pinpoint locations.");
        }
      } catch (err: any) {
        console.error(err);
        setErrorMsg(err.message);
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

  if (errorMsg || venues.le  if (err0)  if (errorMsg || venues.le  if (err0)  if (errorMsg || venues.le  if (err0) nt  if (errorMsg || venues.le  if (err0)  if (errorMsged-xl border  if (errorMsg || venues.le MapPin className="w-8 h-8 mb-2 text-gray-400" />
        <p class        <p class        <p class        <p class         Visualizati        <p class        <          <p class        <p-c        <p class        <p classs">{errorMsg || "Vir        <p class        <s.   /p>
      </      </      }

  const minLng = Math.mi  const minLng = Math.mi  const minLng = Math.mi  const minLng = Math.mi  const minLng = Math.mi  const m.m  const minLng = v => v.  const minLng maxLat = Math.max(...venues.map(v => v.lat));

  const lngDiff = maxLng - minLng;
  const latDiff = maxLat - minLat;

  // Roughly calculate zoom based on bounding box size
  const maxDiff = Math.max(lngDiff, latDiff);
  let zoom = 10;
  if (maxDiff > 0.5) zoom = 9;
  if (maxDiff > 1) zoom = 8;
  if (maxDiff > 2) zoom = 6;
  if (maxDiff < 0.05)  if (maxDiff < 0.05)  if (maxDiff < 0.05)  if (maxDiff < 0.05)  if (maxDiff < 0.05)  if (maxDiff < 0.05)  if (maxDiff < 0.05)  if (maxDiff < 0.05)  if (maxDiff < 0.05)  if (maxDiff < 0.05)  if (maxDiff < 0.05)  if (maxDiff < 0.05)  if (maxDiff < 0.05)  if2,  if (maxDiff < 0.05)  if (maxDiff < 0.05)  if (maxDiff < 0.05)  if (maxDiff < 0.05)  if (maxDiff < 0.05)  if (maxDiff < 0.05)  if (maxDiff < 0.05)  if (maxDiff < 0.05)  if (maxDiff < 0.05)  if (maxDiff < 0.05)  if (maxDi<Sou  if (maxDiff < 0.05) a={venue.isochrone}>
              <Layer
                id={`isochrone-fill-${idx}`}
                type="fill"
                paint={{
                  'fill-color': '#4f46e5',
                  'fill-opacity': 0.2
                }}
              />
              <Layer
                                                                  "l                                                'line-color': '#4f46e5',
                  'line-width': 2,
                  'line-opacity': 0.6
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       ',                   'circle-stroke-width': 3,
                  'circle-stroke-color': '#ffffff                  'circ                    'circle-stroke-color':     </React.Fragment>
        ))}
                     iv className="absolute top-4 left-4 right-                     iv className="absolute top-4 left-4 right-                     iv className="absolute top-4 left-4 right-             -3                     iv classNarder                     iv className="am                      iv className="absolute top-4 left-4 right-                     iv className="absolute top-4 left-4 right-                     iv className="absolute top-4 left-4 right-             -3                     iv classNarder                     iv className="am                      iv className="absolute top-4 left-4 right-                     iv className="absolute top-4 left-4 right-                     iv className="absolute top-4 left-4 right-             -3                     iv classNarder                     iv className="am                      iv className=-3 bg-indigo-500 rounded border border-white/50 mr-2 opacity-60"></div>
            10-Minute Drive Isochrone
         </div>
      </div>
    </div>
  );
}
