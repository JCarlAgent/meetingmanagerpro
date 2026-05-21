/**
 * VenueStaticMap
 *
 * Renders a lightweight static map image for a single venue address using the
 * Mapbox Static Images API. No interactive map JS is loaded — just an <img> tag.
 *
 * Props:
 *   venueAddress  – full address string used for geocoding (e.g. "Olive Garden Las Vegas NV")
 *   width / height – pixel dimensions of the returned static image (default 600×240)
 *   onOpenFullMap – callback fired when the user clicks "Map Mailed List and Responders"
 */

import React, { useState, useEffect } from 'react';
import { MapPin, Loader2, Map as MapIcon } from 'lucide-react';

const HARDCODED_FALLBACK = (
  'pk.eyJ1IjoibW1wcm9hcHAiLCJhIjoiY21uNzBrcWJh' + 'MGJjYjJzb2ZsbWNnOGZpZyJ9.RdJ_H7ttFGZ-RyTK4uOCBA'
);
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || HARDCODED_FALLBACK;

interface VenueStaticMapProps {
  venueAddress: string;
  width?: number;
  height?: number;
  onOpenFullMap?: () => void;
}

export default function VenueStaticMap({ venueAddress, width = 600, height = 240, onOpenFullMap }: VenueStaticMapProps) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!venueAddress || venueAddress.trim().length < 3) {
      setLoading(false);
      setError('No venue address provided.');
      return;
    }

    setLoading(true);
    setError(null);
    setImgUrl(null);

    const controller = new AbortController();

    fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(venueAddress)}.json` +
      `?access_token=${MAPBOX_TOKEN}&autocomplete=false&limit=1&country=us&_cb=${Date.now()}`,
      { signal: controller.signal }
    )
      .then(r => r.json())
      .then(data => {
        const feature = data?.features?.[0];
        if (!feature) {
          setError('Venue location not found.');
          setLoading(false);
          return;
        }
        const [lng, lat] = feature.center as [number, number];
        // Sanity-check: must be within North America
        if (lat < 15 || lat > 72 || lng < -180 || lng > -50) {
          setError('Geocoded outside expected area.');
          setLoading(false);
          return;
        }
        // Mapbox Static Images API — pin marker at venue coords
        const pin = `pin-l+16a34a(${lng},${lat})`;
        const url =
          `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pin}/${lng},${lat},13,0/${width}x${height}@2x` +
          `?access_token=${MAPBOX_TOKEN}&_cb=${Date.now()}`;
        setImgUrl(url);
        setLoading(false);
      })
      .catch(err => {
        if (err?.name === 'AbortError') return;
        setError('Map unavailable.');
        setLoading(false);
      });

    return () => controller.abort();
  }, [venueAddress, width, height]);

  return (
    <div className="relative w-full rounded overflow-hidden bg-slate-100" style={{ height }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
          <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
        </div>
      )}

      {!loading && error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 gap-1">
          <MapPin className="w-5 h-5 text-slate-400" />
          <span className="text-xs text-slate-500">{error}</span>
        </div>
      )}

      {!loading && imgUrl && (
        <img
          src={imgUrl}
          alt={`Map: ${venueAddress}`}
          className="w-full h-full object-cover"
          style={{ display: 'block' }}
        />
      )}

      {/* "Map Mailed List and Responders" button — always visible over the map */}
      {onOpenFullMap && (
        <button
          type="button"
          onClick={onOpenFullMap}
          className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-1.5 bg-white/90 backdrop-blur-sm hover:bg-white text-slate-800 text-xs font-medium rounded-lg shadow border border-slate-200 transition-colors"
        >
          <MapIcon className="w-3.5 h-3.5 text-indigo-600" />
          Map Mailed List &amp; Responders
        </button>
      )}
    </div>
  );
}
