/**
 * CampaignMapView — Interactive Mapbox map for a single campaign.
 *
 * Current: Venue pin + target ZIP centroids.
 * Future: mailed-list heat-map, responder markers.
 */

import React, { useState, useEffect, useRef } from 'react';
import Map, { Marker } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { ArrowLeft, MapPin, Mail, Users, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const MAPBOX_TOKEN: string = (import.meta.env.VITE_MAPBOX_TOKEN as string) || '';

// Shared session-cache prefix with VenueStaticMap
const GEOCODE_CACHE_KEY_PREFIX = 'vsm_geocode_';

interface CampaignMapViewProps {
  jobId: string;
  campaignName?: string;
  venueName?: string;
  venueAddress?: string;
  venueLat?: number | null;
  venueLng?: number | null;
  onBack: () => void;
}

interface Coords { lat: number; lng: number }
interface ZipMarker { zip: string; lat: number; lng: number }

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

  // ZIP state
  const [zipMarkers, setZipMarkers] = useState<ZipMarker[]>([]);
  const [zipsLoading, setZipsLoading] = useState(false);
  const [zipsNote, setZipsNote] = useState<string | null>(null);
  const zipsLoadedRef = useRef(false);

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
    } catch { /* ignore */ }

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

  // Load target ZIP markers once venue coords are known
  useEffect(() => {
    if (!coords || zipsLoadedRef.current || !MAPBOX_TOKEN) return;
    zipsLoadedRef.current = true;

    let cancelled = false;
    setZipsLoading(true);
    setZipsNote(null);

    (async () => {
      try {
        // 1. Mapbox Isochrone — 20-min drive time
        const isoRes = await fetch(
          `https://api.mapbox.com/isochrone/v1/mapbox/driving/${coords.lng},${coords.lat}` +
            `?contours_minutes=20&polygons=true&access_token=${MAPBOX_TOKEN}`
        );
        const isoData = await isoRes.json();
        if (cancelled) return;

        if (!isoData?.features?.length) {
          setZipsNote('No target ZIPs available.');
          return;
        }

        const isochroneGeojson = { type: 'FeatureCollection', features: isoData.features };

        // 2. Extract ZIP codes within the isochrone
        const { data: extractData, error: extractErr } = await supabase.functions.invoke('extract-zip-codes', {
          body: { isochroneGeojson },
        });
        if (cancelled) return;

        if (extractErr || !extractData?.zip_codes?.length) {
          setZipsNote('No target ZIPs available.');
          return;
        }

        const zipCodes: string[] = extractData.zip_codes;

        // 3. Fetch centroids from us_zipcodes table
        const { data: centroidRows, error: centroidErr } = await supabase
          .from('us_zipcodes')
          .select('zip, lat, lng')
          .in('zip', zipCodes);

        if (cancelled) return;

        if (centroidErr || !centroidRows?.length) {
          // Fall back: show zip list note without map markers
          setZipsNote(`${zipCodes.length} target ZIP${zipCodes.length === 1 ? '' : 's'} found (centroids unavailable).`);
          return;
        }

        const markers: ZipMarker[] = centroidRows.map((r: any) => ({
          zip: r.zip,
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lng),
        })).filter((m: ZipMarker) => !isNaN(m.lat) && !isNaN(m.lng));

        setZipMarkers(markers);
        setZipsNote(markers.length === 0 ? 'No target ZIPs available.' : null);
      } catch {
        if (!cancelled) setZipsNote('No target ZIPs available.');
      } finally {
        if (!cancelled) setZipsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords]);

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
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-blue-400/70 border border-blue-500" />
          Target ZIPs
          {zipsLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
          {!zipsLoading && zipMarkers.length > 0 && <span className="text-slate-400">({zipMarkers.length})</span>}
          {!zipsLoading && zipsNote && zipMarkers.length === 0 && <span className="text-slate-400 italic">— {zipsNote}</span>}
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
              zoom: 10,
            }}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/streets-v12"
          >
            {/* ZIP centroid markers */}
            {zipMarkers.map(zm => (
              <Marker key={zm.zip} longitude={zm.lng} latitude={zm.lat} anchor="center">
                <div
                  title={zm.zip}
                  className="flex items-center justify-center rounded-full bg-blue-400/70 border border-blue-500 text-[9px] font-bold text-white shadow"
                  style={{ width: 32, height: 32 }}
                >
                  {zm.zip}
                </div>
              </Marker>
            ))}

            {/* Venue marker — rendered last so it sits on top */}
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
