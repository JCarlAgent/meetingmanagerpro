import React, { useEffect, useState } from 'react';
import { GoogleMap, useJsApiLoader, Marker, Circle } from '@react-google-maps/api';
import { MapPin, Loader2, AlertCircle } from 'lucide-react';

const containerStyle = {
  width: '100%',
  height: '100%'
};

const defaultCenter = {
  lat: 39.8283,
  lng: -98.5795 // Center of US
};

interface LocationMarker {
  name: string;
  position: google.maps.LatLngLiteral;
}

interface CampaignMapPreviewProps {
  venueHeadline: string;
  polygonDescription?: string;
}

const libraries: ("places" | "drawing" | "geometry" | "localContext" | "visualization")[] = ['places'];

export default function CampaignMapPreview({ venueHeadline, polygonDescription }: CampaignMapPreviewProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries
  });

  const [markers, setMarkers] = useState<LocationMarker[]>([]);
  const [center, setCenter] = useState(defaultCenter);
  const [mapZoom, setMapZoom] = useState(4);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Handle geocoding multiple locations separated by '|'
  useEffect(() => {
    if (!isLoaded || !venueHeadline) return;

    const geocodeLocations = async () => {
      setIsGeocoding(true);
      setErrorMsg('');
      setMarkers([]);

      // Split location by pipe '|' and clean up
      const locationNames = venueHeadline.split('|').map(l => l.trim()).filter(Boolean);
      
      const geocoder = new window.google.maps.Geocoder();
      const newMarkers: LocationMarker[] = [];
      const errorStatuses: string[] = [];

      try {
        for (const locName of locationNames) {
          // Remove things like "(e.g., ...)" which AI sometimes outputs, and convert " - " to ", " for better geocoding
          const cleanName = locName.replace(/\(e\.g\..*?\)/gi, '').replace(/\s+-\s+/, ', ').trim();
          
          try {
            // Modern Promise-based Geocoder approach without callbacks, wrapped in a strict 3-second timeout
            const geocodePromise = geocoder.geocode({ address: cleanName });
            const timeoutPromise = new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('TIMEOUT_3S')), 3000)
            );
            
            const response = await Promise.race([geocodePromise, timeoutPromise]) as google.maps.GeocoderResponse;
            
            if (response.results && response.results.length > 0) {
              const geom = response.results[0].geometry.location;
              newMarkers.push({
                name: cleanName,
                position: { lat: geom.lat(), lng: geom.lng() }
              });
            } else {
              errorStatuses.push('ZERO_RESULTS');
            }
          } catch (geoError: any) {
            console.error('Geocoding promise failed for', cleanName, ':', geoError);
            
            // Extract the Google Maps SDK error code (e.g. "REQUEST_DENIED")
            let code = 'NETWORK_ERROR';
            if (geoError && geoError.code) {
              code = geoError.code; 
            } else if (geoError && geoError.name === 'MapsRequestError') {
              code = 'MAPS_REQUEST_ERROR'; // Usually indicates adblocker or restricted key
            }
            errorStatuses.push(code);
          }
        }

        if (newMarkers.length > 0) {
          setMarkers(newMarkers);
          
          if (newMarkers.length === 1) {
            setCenter(newMarkers[0].position);
            setMapZoom(11); // localized view for 1 spot
          } else {
            // Calculate center of multiple markers
            const latSum = newMarkers.reduce((sum, m) => sum + m.position.lat, 0);
            const lngSum = newMarkers.reduce((sum, m) => sum + m.position.lng, 0);
            setCenter({
              lat: latSum / newMarkers.length,
              lng: lngSum / newMarkers.length
            });
            setMapZoom(9); // zoom out a bit for multiple
          }
        } else {
          setErrorMsg(`Could not pinpoint locations. Status: ${errorStatuses.join(', ')}`);
        }

      } catch (err: any) {
        console.error("Geocoding error", err);
        setErrorMsg(`Error rendering map locations: ${err.message || err.toString()}`);
      } finally {
        setIsGeocoding(false);
      }
    };

    geocodeLocations();
  }, [venueHeadline, isLoaded]);

  if (loadError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-red-50 text-red-500 p-4">
        <AlertCircle className="w-6 h-6 mb-2" />
        <p className="text-sm font-medium text-center">Error loading Google Maps</p>
      </div>
    );
  }

  if (!import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 text-gray-500 p-4 rounded-xl border border-gray-200">
        <MapPin className="w-8 h-8 mb-2 text-gray-400" />
        <p className="text-sm font-medium text-center text-gray-600">Google Maps Integration Ready</p>
        <p className="text-xs text-center mt-1 text-gray-500 max-w-xs">Map will appear here once the API key is configured.</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 relative overflow-hidden rounded-xl">
        <div className="absolute inset-0 bg-blue-500/5 pulse-ring"></div>
        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
        <p className="text-sm font-medium text-slate-600 animate-pulse">Loading Map Engine...</p>
      </div>
    );
  }

  if (isGeocoding) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 relative overflow-hidden rounded-xl">
        <div className="absolute inset-0 bg-blue-500/5 pulse-ring"></div>
        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
        <p className="text-sm font-medium text-slate-600 animate-pulse">Running spatial analysis...</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[400px] rounded-xl overflow-hidden shadow-inner">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={mapZoom}
        options={{
          disableDefaultUI: false,
          zoomControl: true,
          streetViewControl: false,
          mapTypeControl: false,
          styles: [
            {
              featureType: 'poi.business',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'transit',
              elementType: 'labels.icon',
              stylers: [{ visibility: 'off' }]
            }
          ]
        }}
      >
        {markers.map((marker, i) => (
          <React.Fragment key={i}>
            <Marker position={marker.position} title={marker.name} />
          </React.Fragment>
        ))}
      </GoogleMap>
      
      {errorMsg && (
        <div className="absolute top-4 left-4 right-4 bg-red-100 border border-red-200 text-red-700 px-4 py-2 rounded shadow-sm text-sm z-10 flex items-center">
          <AlertCircle className="w-4 h-4 mr-2" />
          {errorMsg}
        </div>
      )}
      
      {markers.length > 0 && !errorMsg && (
        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur border border-slate-200 px-3 py-2 rounded-lg shadow-sm z-10">
          <p className="text-xs font-semibold text-slate-700">
            {markers.length} Target Zone{markers.length > 1 ? 's' : ''} Mapped
          </p>
        </div>
      )}
      
      {/* Overlay gradient */}
      <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-slate-900/10 rounded-xl"></div>
    </div>
  );
}
