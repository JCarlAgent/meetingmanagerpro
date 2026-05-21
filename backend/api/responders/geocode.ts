/**
 * POST /api/responders/geocode
 *
 * Geocodes responders for a campaign that are missing lat/lng.
 * Accessible to any authenticated user who is a member of the campaign's org
 * or is a master admin.
 *
 * Geocoding is done server-side using MAPBOX_TOKEN (or VITE_MAPBOX_TOKEN as fallback).
 * The token is never sent to the browser.
 *
 * Body:   { campaignId: string }
 * Returns: { ok, total, processed, geocoded, skipped, failed }
 */

import { getSupabaseAdmin, requireUserIdFromAuthHeader } from '../_lib/supabaseAdmin.js';

const BATCH_LIMIT = 50;

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/** Returns true if userId may access the given job/campaign. */
async function canAccessCampaign(userId: string, campaignId: string): Promise<boolean> {
  const supabaseAdmin = getSupabaseAdmin();

  // Master admin always allowed
  const { data: ma } = await supabaseAdmin
    .from('master_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (ma?.user_id) return true;

  // Look up the job to get its org
  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select('id, org_id, created_by_user_id')
    .eq('id', campaignId)
    .maybeSingle();

  if (!job?.id) return false;

  // Job owner always allowed
  if (job.created_by_user_id === userId) return true;

  // Any org member allowed (advisor, fmo_admin, org_admin, member)
  const { data: member } = await supabaseAdmin
    .from('org_members')
    .select('role')
    .eq('org_id', job.org_id)
    .eq('user_id', userId)
    .maybeSingle();

  return !!member?.role;
}

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed' }); return; }

  // Auth
  let userId: string;
  try { userId = await requireUserIdFromAuthHeader(req); }
  catch { send(res, 401, { error: 'Unauthorized' }); return; }

  // Body
  let payload: any;
  try { payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { send(res, 400, { error: 'Invalid JSON body' }); return; }

  const { campaignId } = payload ?? {};
  if (!campaignId || typeof campaignId !== 'string') {
    send(res, 400, { error: 'campaignId is required' }); return;
  }

  // Access check
  const allowed = await canAccessCampaign(userId, campaignId);
  if (!allowed) { send(res, 403, { error: 'Access denied' }); return; }

  // Mapbox token — server-side only, never sent to browser
  const mapboxToken = process.env.MAPBOX_TOKEN ?? process.env.VITE_MAPBOX_TOKEN ?? '';
  if (!mapboxToken) {
    send(res, 500, { error: 'Mapbox token not configured on server' }); return;
  }

  const supabaseAdmin = getSupabaseAdmin();

  // Fetch responders missing coordinates, up to BATCH_LIMIT
  const { data: rows, error: fetchErr } = await supabaseAdmin
    .from('responders')
    .select('id, address, city, state, zip')
    .eq('campaign_id', campaignId)
    .or('lat.is.null,lng.is.null')
    .limit(BATCH_LIMIT);

  if (fetchErr) {
    send(res, 500, { error: 'Failed to fetch responders: ' + fetchErr.message }); return;
  }

  const total = rows?.length ?? 0;
  let processed = 0, geocoded = 0, skipped = 0, failed = 0;

  for (const row of (rows ?? [])) {
    processed++;

    // Skip rows without enough address data to geocode
    const addressParts = [row.address, row.city, row.state, row.zip].filter(
      (p): p is string => typeof p === 'string' && p.trim().length > 0
    );
    if (addressParts.length < 2) {
      skipped++;
      continue;
    }

    const query = addressParts.join(', ');

    try {
      const geoUrl =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
        `?access_token=${mapboxToken}&autocomplete=false&limit=1&country=us`;

      const geoRes = await fetch(geoUrl);
      if (!geoRes.ok) { failed++; continue; }

      const geoData = await geoRes.json() as { features?: Array<{ center: [number, number] }> };
      const feature = geoData?.features?.[0];
      if (!feature) { failed++; continue; }

      const [lng, lat] = feature.center;

      // Basic US bounds sanity check
      if (lat < 15 || lat > 72 || lng < -180 || lng > -50) {
        failed++;
        continue;
      }

      const { error: updateErr } = await supabaseAdmin
        .from('responders')
        .update({ lat, lng })
        .eq('id', row.id);

      if (updateErr) { failed++; continue; }

      geocoded++;
    } catch {
      failed++;
    }
  }

  send(res, 200, { ok: true, total, processed, geocoded, skipped, failed });
}
