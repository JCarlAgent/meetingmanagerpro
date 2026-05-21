/**
 * VenueStaticMap
 *
 * Renders a lightweight static map image for a single venue using the
 * Mapbox Static Images API. No interactive map JS is loaded — just an <img> tag.
 *
 * Props:
 *   venueLat / venueLng  – pre-computed coordinates (preferred; skips geocoding)
 *   venueAddress         – address string used only when lat/lng are absent
 *   width / height       – pixel dimensions of the returned static image
 *   onOpenFullMap        – callback fired when "Map Mailed List and Responders" is clicked
 *
 * Optimisations:
 *   • When venueLat+venueLng are supplied the static URL is built synchronously —
 *     zero network calls at render time.
 *   • Geocode results are cached in sessionStorage so each unique address is
 *     only geocoded once per browser session.
 *   • The static image URL has no cache-busting query param, so the browser
 *     caches the tile image normally.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

// Use the same env var as CampaignMapPreview — no hardcoded fallback token.
const MAPBOX_TOKEN: string = (import.meta.env.VITE_MAPBOX_TOKEN as string) || '';

const GEOCODE_CACHE_KEY_PREFIX = 'vsm_geocode_';

function buildStaticUrl(lng: number, lat: number, width: number, height: number): string {
  const pin = `pin-l+16a34a(${lng},${lat})`;
  return (
    `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pin}/${lng},${lat},13,0/${width}x${height}@2x` +
    `?access_token=${MAPBOX_TOKEN}`
  );
}

interface VenueStaticMapProps {
  /** Pre-computed latitude from stored data — skips geocoding when provided alongside venueLng. */
  venueLat?: number | null;
  /** Pre-computed longitude from stored data — skips geocoding when provided alongside venueLat. */
  venueLng?: number | null;
  /** Full address string — only used to geocode when lat/lng are absent. */
  venueAddress?: string;
  width?: number;
  height?: number;
  onOpenFullMap?: () => void;
  /**
   * ID of the job_meetings row this map represents.
   * When provided together with onCoordinatesResolved, the resolved lat/lng will be
   * reported back exactly once per mount (only when geocoding was required — not when
   * coordinates were already supplied via venueLat/venueLng).
   */
  meetingId?: string;
  /** Called at most once per mount with the geocoded coordinates. */
  onCoordinatesResolved?: (meetingId: string, lat: number, lng: number) => void;
}

export default function VenueStaticMap({
  venueLat,
  venueLng,
  venueAddress,
  width = 600,
  height = 240,
  onOpenFullMap,
  meetingId,
  onCoordinatesResolved,
}: VenueStaticMapProps) {
  // Track whether we already fired the callback this mount to avoid duplicate writes.
  const resolvedRef = React.useRef(false);
  const hasCoords = typeof venueLat === 'number' && typeof venueLng === 'number';

  // When coordinates are already known, compute the URL synchronously — no effect needed.
  const immediateUrl = useMemo(() => {
    if (!hasCoords || !MAPBOX_TOKEN) return null;
    return buildStaticUrl(venueLng as number, venueLat as number, width, height);
  }, [hasCoords, venueLat, venueLng, width, height]);

  const [geocodedUrl, setGeocodedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(!hasCoords);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Coords were passed in — nothing to geocode.
    if (hasCoords) return;

    const address = venueAddress?.trim() ?? '';
    if (!address || address.length < 3) {
      setLoading(false);
      setError('Venue map unavailable.');
      return;
    }
    if (!MAPBOX_TOKEN) {
      setLoading(false);
      setError('Map token not configured.');
      return;
    }

    // Check session cache first.
    const cacheKey = GEOCODE_CACHE_KEY_PREFIX + address.toLowerCase();
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { lng, lat } = JSON.parse(cached) as { lng: number; lat: number };
        setGeocodedUrl(buildStaticUrl(lng, lat, width, height));
        setLoading(false);
        return;
      }
    } catch {
      // sessionStorage unavailable — proceed to geocode.
    }

    setLoading(true);
    setError(null);
    setGeocodedUrl(null);

    const controller = new AbortController();

    fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json` +
        `?access_token=${MAPBOX_TOKEN}&autocomplete=false&limit=1&country=us&_cb=${Date.now()}`,
      { signal: controller.signal }
    )
      .then(r => r.json())
      .then(data => {
        const feature = data?.features?.[0];
        if (!feature) {
          setError('Venue map unavailable.');
          setLoading(false);
          return;
        }
        const [lng, lat] = feature.center as [number, number];
        // Sanity-check: must be within North America.
        if (lat < 15 || lat > 72 || lng < -180 || lng > -50) {
          setError('Venue map unavailable.');
          setLoading(false);
          return;
        }
        // Persist to session cache so subsequent mounts skip this network call.
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({ lng, lat }));
        } catch {
          // ignore — non-fatal
        }
        setGeocodedUrl(buildStaticUrl(lng, lat, width, height));
        setLoading(false);
        // Notify parent so it can persist coordinates to the DB (once per mount).
        if (meetingId && onCoordinatesResolved && !resolvedRef.current) {
          resolvedRef.current = true;
          onCoordinatesResolved(meetingId, lat, lng);
        }
      })
      .catch(err => {
        if (err?.name === 'AbortError') return;
        setError('Venue map unavailable.');
        setLoading(false);
      });

    return () => controller.abort();
  }, [hasCoords, venueAddress, width, height]);

  const imgUrl = immediateUrl ?? geocodedUrl;

  return (
    <div className="relative w-full rounded overflow-hidden bg-slate-100" style={{ height }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
          <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
        </div>
      )}

      {!loading && !imgUrl && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 gap-1">
          <MapPin className="w-5 h-5 text-slate-400" />
          <span className="text-xs text-slate-500">{error ?? 'Venue map unavailable.'}</span>
        </div>
      )}

      {imgUrl && (
        <img
          src={imgUrl}
          alt={venueAddress ? `Map: ${venueAddress}` : 'Venue map'}
          className="w-full h-full object-cover"
          style={{ display: 'block' }}
        />
      )}

    </div>
  );
}

