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

export default function CampaignMapPreview({ venueHeadline, polygonDescription }: CampaignMapPreviewProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: ['places']
  });

  const [markers, setMarkers] = useState<LocationMarker[]>([]);
  const [center, setCenter] = useState(defaultCenter);
  const [mapZoom, setMapZoom  const [mapZoom, setMapZoom  const [mapZoom, setMapZoom  const [mfalse);
  const [errorMsg, setErrorMsg] = useState('')  const [errorMsg, setErrorMsg] = useState('')  const [errorM  useEffect(() => {
                                                              eLocations = async () => {
      setIsGeocodi      setIsGeoc setErrorMsg('');
      setMar      setMar          sit location by pipe '|' a d c      setMar      setMar io      setMar  He      setMar      setMar          s).filte      setMar      se     const geoco      setMar      setle.m      setMar          const newMar      setMar      setMar          sit location by pipe '|' a d c      setMar      setMar io      setMar  Hee things like "(e.g., ...)" which AI sometimes output      setMar      setMarame = locName.replace(/\(e\.g\..*?\)/gi, '').trim();
          
          await new Promise<void>((resolve)           await new Promise<void>((resolve)           await neults, status) => {
              if (status === 'OK' && results && results.length > 0) {
                const geom = results[0].geometry.location;
                newMarkers.push({
                  name: cleanName,
                  position: { lat: geom.lat(), lng: geom.lng() }
                });
              }
              resolve();
            });
          });
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    rkers.length,
              lng: lngSum / newMarkers.length
            });
            setMapZoom(9); // zoom out a bit for multiple
          }
        } else {
          setErrorMsg('Could not pinpoint loc          setErrorMsg('Could not pinpoint loc          se {          setErrorMsg('Could notg error", err);
        setErrorMsg('Error rendering map locations.');
      } finally {
        setIs        setIs    
                                          }, [venueHeadline, isLoaded]);
                                          }, [venueHeadline, isLoaded]);
 not pinpoint loc          se {          setErrorMsg('Could notg error", err);
rtCircle className="w-6 h-6 mb-2" />
        <p className="text-sm font-medium text-center">Error loading Google Maps</p>
      </div>
    );
  }

  if (!import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 text-gray-500 p-4 rounded-xl border border-gray-200">
        <MapPin className="w-8 h-8 mb-2         <MapPin className="w-8 h-8 mb-2     -sm font-medium te        <MapPin className="w-8 h-8 mb-2         <MapPin p>
        <p className="text-x        <p className="text-x        <p className="text-x        <p classNaPI key is configured.</p>
      </div>
    );
  }

  if (!isLoaded || isGeocod  if (!isLoaded || isGeocod  if (!isLoaded || isGeocoll flex flex-col ite  if (!isLoaded || isGeocod slate-50 relative overflow-hidden rounded-xl">
        <div className="absolute inset-0 bg-blue-500/5 pulse-ring"></div>
        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
        <p className="text-sm font-medium text-slate-600 animate-pulse">        <p className="text-sm font-medium text-slate-600 animate-pulse">        <p ame="relative w-full h-[400px] rounded-xl overflow-hidden shadow-inner">
               p
                                                                                                                                     UI: false,
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
            {/* Draw a simulated 5 mile / ~12 minute drive radius aro            {/* Draw a simulated 5 mile / ~12 minute drive radius aro            {/* Draw a simulated 5 mile / ~12 minute drive radius aro            {/* Draw a simulated 5 mile / ~12 minute drive radius aro            {/* Dra,
                strokeColor: '#3b82f6',
                strokeOpacity: 0.5,
                strokeWeight: 2,
              }}
            />
          </React.Fragment>
        ))}
      </GoogleMap>
      
      {errorMsg &&       {errorMsg &&       {errolut      {errorMsg &&ht-4 bg-red-100       {errorMsg &&       {errorMsg &&    y-      {errorMsg &&       {errorMsg &&      -cen      {errorM   <AlertCircle className="w-4 h-4 mr-2" />
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
