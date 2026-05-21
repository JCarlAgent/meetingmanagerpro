/**
 * CampaignMapView — Interactive Mapbox map for a single campaign.
 *
 * Step 1: Venue pin only.
 * Future steps will add mailed-list heat-map and responder markers.
 */

import React, { useState, useEffect, useRef } from 'react';
import Map, { Marker } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { ArrowLeft, MapPin, Mail, Users, Loader2 } from 'lucide-react';

const MAPBOX_TOKEN: string = (import.meta.env.VITE_MAPBOX_TOKEN as string) || '';

// Shared session-cache prefix with VenueStaticMap — reuse geocoded coords from card
const GEOCODE_CACHE_KEY_PREFIX = 'vsm_geocode_';

interface CampaignMapViewProps {
  jobId: string;
  campaignName?: string;
  /** Display name of the venue (e.g. "Olive Garden") */
  venueName?: string;
  /** Full formatted address string for display and geocoding fallback */
  venueAddress?: string;
  /** Pre-resolved latitude — skips geocoding when provided with venueLng */
  venueLat?: number | null;
  /** Pre-resolved longitude — skips geocoding when provided with venueLat */
  venueLng?: number | null;
  onBack: () => void;
}

interface Coords { lat: number; lng: number }

export default function CampaignMapView({
  jobId,
  campaignName,
  venueName,
  venueAddress,
  venueLat,
  venueLng,
  onBack,
}: CampaignMapViewProps) {
  const hasCoords = typeof venueLat === 'number' && typeof venueLng === 'number';

  const [coords, setCoords] = useState<Coords | null>(
    hasCoords ? { lat: venueLat as number, lng: venueLng as number } : null
  );
  const [geocoding, setGeocoding] = useState(!hasCoords);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);

  // Only geocode once per mount
  const geocodedRef = useRef(false);

  useEffect(() => {
    if (hasCoords || geocodedRef.current) return;

    const address = venueAddress?.trim() ?? '';
    if (!address || address.length < 3) {
      setGeocoding(false);
      setGeocodeError('Venue location unavailable.');
      return;
    }
    if (!MAPBOX_TOKEN) {
      setGeocoding(false);
      setGeocodeError('Map token not configured.');
      return;
    }

    // Check session cache (shared with VenueStaticMap)
    const cacheKey = GEOCODE_CACHE_KEY_PREFIX + address.toLowerCase();
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { lng, lat } = JSON.parse(cached) as { lng: number; lat: number };
        setCoords({ lat, lng });
        setGeocoding(false);
        geocodedRef.current = true;
        return;
      }
    } catch {
      // sessionStorage unavailable — proceed
    }

    geocodedRef.current = true;
    setGeocoding(true);
    setGeocodeError(null);

    const controller = new AbortController();

    fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json` +
        `?access_token=${MAPBOX_TOKEN}&autocomplete=false&limit=1&country=us`,
      { signal: controller.signal }
    )
      .then(r => r.json())
      .then(data => {
        const feature = data?.features?.[0];
        if (!feature) { setGeocodeError('Venue location unavailable.'); return; }
        const [lng, lat] = feature.center as [number, number];
        if (lat < 15 || lat > 72 || lng < -180 || lng > -50) {
          setGeocodeError('Venue geocoded outside expected area.');
          return;
        }
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ lng, lat })); } catch { /* ignore */ }
        setCoords({ lat, lng });
      })
      .catch(err => {
        if ((err as Error).name !== 'AbortError') setGeocodeError('Venue location unavailable.');
      })
      .finally(() => setGeocoding(false));

    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayAddress = [venueName, venueAddress].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Campaigns
        </button>
        <span className="text-slate-300">|</span>
        <MapPin className="w-4 h-4 text-indigo-500" />
        <h2 className="text-sm font-semibold text-slate-800 truncate">
          {campaignName ? `${campaignName} — Campaign Map` : 'Campaign Map'}
        </h2>
        <span className="ml-auto text-xs text-slate-400">Job #{jobId}</span>
      </div>

      {/* Legend bar */}
      <div className="flex items-center gap-5 px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs text-slate-600 shrink-0">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-indigo-600" />
          Venue
        </span>
        <span className="flex items-center gap-1.5 opacity-40">
          <Mail className="w-3 h-3 text-blue-500" />
          Mailed List
          <span className="italic">— coming soon</span>
        </span>
        <span className="flex items-center gap-1.5 opacity-40">
          <Users className="w-3 h-3 text-emerald-500" />
          Responders
          <span className="italic">— coming soon</span>
        </span>
      </div>

      {/* Venue info strip */}
      {displayAddress && (
        <div className="px-4 py-2 bg-white border-b border-slate-100 text-xs text-slate-600 flex items-center gap-1.5 shrink-0">
          <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span className="truncate">{displayAddress}</span>
        </div>
      )}

      {/* Map area — explicit height so the map is never 0×0 inside a non-flex parent */}
      <div className="relative" style={{ height: '70vh', minHeight: 400 }}>
        {geocoding && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 z-10 gap-2">
            <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
            <p className="text-sm text-slate-500">Locating venue…</p>
          </div>
        )}

        {!geocoding && geocodeError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 z-10 gap-3">
            <MapPin className="w-10 h-10 text-slate-300" />
            <p className="text-sm text-slate-500 font-medium">{geocodeError}</p>
            {venueAddress && (
              <p className="text-xs text-slate-400 max-w-xs text-center">{venueAddress}</p>
            )}
          </div>
        )}

        {!geocoding && !geocodeError && !coords && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 z-10 gap-3">
            <MapPin className="w-10 h-10 text-slate-300" />
            <p className="text-sm text-slate-500 font-medium">Venue location unavailable.</p>
          </div>
        )}

        {!geocoding && coords && !MAPBOX_TOKEN && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 z-10 gap-3">
            <MapPin className="w-10 h-10 text-slate-300" />
            <p className="text-sm text-slate-500 font-medium">Map token not configured.</p>
          </div>
        )}

        {!geocoding && coords && MAPBOX_TOKEN && (
          <Map
            mapboxAccessToken={MAPBOX_TOKEN}
            initialViewState={{
              longitude: coords.lng,
              latitude: coords.lat,
              zoom: 13,
            }}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/streets-v12"
          >
            <Marker longitude={coords.lng} latitude={coords.lat} anchor="bottom">
              <div className="flex flex-col items-center" title={venueName ?? venueAddress ?? 'Venue'}>
                <div className="w-8 h-8 rounded-full bg-indigo-600 border-2 border-white shadow-lg flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-white" />
                </div>
                {venueName && (
                  <div className="mt-1 px-2 py-0.5 bg-white border border-slate-200 rounded shadow text-[10px] font-semibold text-slate-800 whitespace-nowrap max-w-[160px] truncate">
                    {venueName}
                  </div>
                )}
              </div>
            </Marker>
          </Map>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-400 text-right shrink-0">
        Campaign #{jobId} · Map Mailed List &amp; Responders
      </div>
    </div>
  );
}
