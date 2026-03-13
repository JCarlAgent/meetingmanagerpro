import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Loader2 } from 'lucide-react';

// Fix Leaflet's default icon path issues with Next/Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface CampaignMapPreviewProps {
  venueHeadline: string;
  polygonDescription: string;
}

export default function CampaignMapPreview({ venueHeadline, polygonDescription }: CampaignMapPreviewProps) {
  const [coordinates, setCoordinates] = useState<[number, number] | null>(null);
  const [isochroneData, setIsochroneData] = useState<[number, number][] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Parse the city name out of the venue or just search the venue
  useEffect(() => {
    const fetchIsochrone = async (lat: number, lon: number) => {
      try {
        // extract time from description (e.g. "15m" or "20 mins") defaulting to 15
        const match = polygonDescription.match(/(\d+)\s*(?:m\b|min|minute)/i);
        const minutes = match ? Math.min(Math.max(parseInt(match[1], 10), 5), 60) : 15;

        const reqUrl = `https://valhalla1.openstreetmap.de/isochrone?json=` + encodeURIComponent(JSON.stringify({
          locations: [{lat, lon}],
          costing: "auto",
          contours: [{time: minutes}]
        }));
        const res = await fetch(reqUrl);
        const geojson = await res.json();
        
        if (geojson?.features?.length > 0) {
          const geom = geojson.features[0].geometry;
          if (geom.type === 'LineString') {
            setIsochroneData(geom.coordinates.map((c: number[]) => [c[1], c[0]]));
          } else if (geom.type === 'Polygon') {
            setIsochroneData(geom.coordinates[0].map((c: number[]) => [c[1], c[0]]));
          }
        }
      } catch (e) {
        console.error("Isochrone fetch failed", e);
      }
    };

    async function geocode() {
      setIsLoading(true);
      setIsochroneData(null);
      try {
        // Try Nominatim with the exact headline first (high success rate if formatted like "Restaurant - City, CA")
        const cleanHeadline = venueHeadline.replace(' - ', ', ');
        try {
          const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanHeadline)}&format=json&limit=1&email=app@meetingmanagerpro.com`);
          const nomData = await nomRes.json();
          if (nomData && nomData.length > 0) {
            const lat = parseFloat(nomData[0].lat);
            const lon = parseFloat(nomData[0].lon);
            setCoordinates([lat, lon]);
            await fetchIsochrone(lat, lon);
            setIsLoading(false);
            return;
          }
        } catch(e) {
          // ignore
        }

        // If that fails, try to extract just the city/state part
        let cityMatch = venueHeadline;
        if (venueHeadline.includes(' - ')) {
          cityMatch = venueHeadline.split(' - ').pop() || venueHeadline;
        } else if (venueHeadline.includes(', ')) {
          const parts = venueHeadline.split(', ');
          cityMatch = parts.slice(parts.length >= 2 ? parts.length - 2 : 0).join(', '); // grab last two parts e.g. "Tustin, CA"
        }

        // Expand common abbreviations
        let queryMatch = cityMatch.trim();
        if (queryMatch.toUpperCase() === 'LA') {
          queryMatch = 'Los Angeles';
        } else if (queryMatch.toUpperCase() === 'NY' || queryMatch.toUpperCase() === 'NYC') {
          queryMatch = 'New York City';
        } else if (queryMatch.toUpperCase() === 'SF') {
          queryMatch = 'San Francisco';
        } else if (queryMatch.toUpperCase() === 'VEGAS') {
          queryMatch = 'Las Vegas';
        }

        // Try Nominatim with just the city
        try {
          const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(queryMatch)}&format=json&limit=1&email=app@meetingmanagerpro.com`);
          const nomData = await nomRes.json();
          if (nomData && nomData.length > 0) {
            const lat = parseFloat(nomData[0].lat);
            const lon = parseFloat(nomData[0].lon);
            setCoordinates([lat, lon]);
            await fetchIsochrone(lat, lon);
            setIsLoading(false);
            return;
          }
        } catch(e) {
          // Ignore and fall back to open-meteo
        }

        // Fallback to Open-Meteo with just the city (Open-Meteo hates states, so we take just the word before any comma)
        const openMeteoQuery = queryMatch.split(',')[0].trim();
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(openMeteoQuery)}&count=1&format=json`);
        const data = await res.json();
        
        if (data.results && data.results.length > 0) {
          const lat = data.results[0].latitude;
          const lon = data.results[0].longitude;
          setCoordinates([lat, lon]);
          await fetchIsochrone(lat, lon);
        } else {
          // Default fallback (e.g. Dallas TX) if geocoding entirely fails
          setCoordinates([32.7767, -96.7970]);
          await fetchIsochrone(32.7767, -96.7970);
        }
      } catch (e) {
        setCoordinates([32.7767, -96.7970]); // Fallback
        await fetchIsochrone(32.7767, -96.7970);
      } finally {
        setIsLoading(false);
      }
    }
    geocode();
  }, [venueHeadline, polygonDescription]);

  if (isLoading) {
    return (
      <div className="w-full h-64 bg-gray-100 rounded-xl flex items-center justify-center border border-gray-200">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!coordinates) return null;

  // Generate a fallback mock jagged polygon to simulate an isochrone drive-time shape if API fails
  const baseLat = coordinates[0];
  const baseLng = coordinates[1];
  const r = 0.05; // rough radius degree scale
  const mockIsochrone: [number, number][] = [
    [baseLat + r, baseLng],
    [baseLat + r*0.8, baseLng + r*0.6],
    [baseLat + r*0.2, baseLng + r],
    [baseLat - r*0.3, baseLng + r*0.7],
    [baseLat - r*0.7, baseLng + r*0.4],
    [baseLat - r, baseLng],
    [baseLat - r*0.6, baseLng - r*0.5],
    [baseLat - r*0.2, baseLng - r],
    [baseLat + r*0.5, baseLng - r*0.8],
  ];

  const polygonToDraw = isochroneData || mockIsochrone;

  return (
    <div className="w-full h-80 rounded-xl overflow-hidden shadow-inner border border-gray-200 relative z-0">
      <MapContainer key={`${coordinates[0]}-${coordinates[1]}`} center={coordinates} zoom={11} scrollWheelZoom={false} className="w-full h-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        <Polygon positions={polygonToDraw} pathOptions={{ color: '#4f46e5', fillColor: '#4f46e5', fillOpacity: 0.2, weight: 2 }} />
        <Marker position={coordinates}>
          <Popup>
            <div className="font-semibold">{venueHeadline}</div>
            <div className="text-xs text-gray-500 mt-1">{polygonDescription}</div>
          </Popup>
        </Marker>
      </MapContainer>
      
      {/* Overlay label */}
      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-4 py-2 rounded-lg shadow-sm border border-gray-100 z-[1000] max-w-xs pointer-events-none">
        <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-1">AI Generated Drive-Time</p>
        <p className="text-sm text-gray-700 leading-tight">{polygonDescription}</p>
      </div>
    </div>
  );
}
