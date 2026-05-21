/**
 * CampaignMapView — Scaffold
 *
 * Full interactive map view for a campaign, opened from the "Map Mailed List
 * and Responders" button in CampaignCard. Rendered as a separate top-level view
 * inside Dashboard (case 'campaign-map') instead of loading a heavy Mapbox
 * component inside each campaign card.
 *
 * ─── TODO: implement these data layers ───────────────────────────────────────
 * 1. VENUE PIN — geocode the campaign venue address (reuse VenueStaticMap logic
 *    or call Mapbox geocoding once; show a distinct marker).
 * 2. MAILED LIST RECORDS — load from `campaign_mailed_list_records` (filter by
 *    campaign_id / job_id). Geocode zip codes (batch) or use stored lat/lng.
 *    Render as a heat-map or cluster layer.
 * 3. RESPONDERS — load from `responders` (filter by campaign_id). Show as
 *    individual accent-coloured markers. Clicking one shows the responder card.
 * 4. ISOCHRONE RING — optionally render the drive-time polygon (reuse the
 *    Valhalla isochrone logic from CampaignMapPreview.tsx).
 *
 * ─── Interactive Mapbox component ────────────────────────────────────────────
 * CampaignMapPreview is imported here (not in CampaignCard) so the heavy
 * react-map-gl bundle only loads when this view is opened.
 */

import React from 'react';
import { ArrowLeft, MapPin, Users, Mail } from 'lucide-react';

interface CampaignMapViewProps {
  /** ID of the campaign (job) to map */
  jobId: string;
  /** Human-readable campaign name for the header */
  campaignName?: string;
  /** Venue address string — used to pin the venue */
  venueAddress?: string;
  /** Called when user clicks the back button */
  onBack: () => void;
}

export default function CampaignMapView({ jobId, campaignName, venueAddress, onBack }: CampaignMapViewProps) {
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
          <Mail className="w-3 h-3 text-blue-500" />
          Mailed List
          <span className="text-slate-400 italic">— TODO</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="w-3 h-3 text-emerald-500" />
          Responders
          <span className="text-slate-400 italic">— TODO</span>
        </span>
      </div>

      {/* Map area — replace with <CampaignMapPreview> (or Map component) when ready */}
      <div className="flex-1 relative bg-slate-100 flex flex-col items-center justify-center gap-3">
        <MapPin className="w-10 h-10 text-slate-300" />
        <p className="text-sm text-slate-500 font-medium">Interactive map coming soon</p>
        {venueAddress && (
          <p className="text-xs text-slate-400 max-w-xs text-center">{venueAddress}</p>
        )}

        {/* ── TODO: render Mapbox interactive map ───────────────────────────
            1. import CampaignMapPreview from './CampaignMapPreview'  (or new Map component)
            2. Load mailed list records via:
               supabase.from('campaign_mailed_list_records').select('*').eq('campaign_id', jobId)
            3. Load responders via:
               supabase.from('responders').select('*').eq('campaign_id', jobId)
            4. Geocode unique zip codes (batch) or use address lat/lng if stored.
            5. Render three layers:
               - Venue pin (indigo)
               - Mailed list heatmap / cluster (blue)
               - Responder individual markers (emerald)
            6. (Optional) Isochrone polygon around venue (reuse Valhalla logic).
        ──────────────────────────────────────────────────────────────────── */}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-400 text-right shrink-0">
        Campaign #{jobId} · Map Mailed List &amp; Responders
      </div>
    </div>
  );
}
