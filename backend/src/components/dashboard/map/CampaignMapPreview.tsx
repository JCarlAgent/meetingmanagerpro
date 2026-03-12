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
  const [isLoading, setIsLoading] = useState(true);

  // Parse the city name out of the venue or just search the venue
  useEffect(() => {
    async function geocode() {
      setIsLoading(true);
      try {
        // Strip out the restaurant name, search for the area if possible, or just search the raw venue string.
        const queryMatch = venueHeadline.split(' - ')[1] || venueHeadline; 
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(queryMatch)}&count=1&format=json`);
        const data = await res.json();
        
        if (data.results && data.results.length > 0) {
          setCoordinates([data.results[0].latitude, data.results[0].longitude]);
        } else {
          // Default fallback (e.g. Dallas TX) if geocoding fails
          setCoordinates([32.7767, -96.7970]);
        }
      } catch (e) {
        setCoordinates([32.7767, -96.7970]); // Fallback
      } finally {
        setIsLoading(false);
      }
    }
    geocode();
  }, [venueHeadline]);

  if (isLoading) {
    return (
      <div className="w-full h-64 bg-gray-100 rounded-xl flex items-center justify-center border border-gray-200">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!coordinates) return null;

  // Generate a mock jagged polygon to simulate an isochrone drive-time shape
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

  return (
    <div className="w-full h-80 rounded-xl overflow-hidden shadow-inner border border-gray-200 relative z-0">
      <MapContainer center={coordinates} zoom={11} scrollWheelZoom={false} className="w-full h-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        <Polygon positions={mockIsochrone} pathOptions={{ color: '#4f46e5', fillColor: '#4f46e5', fillOpacity: 0.2, weight: 2 }} />
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
