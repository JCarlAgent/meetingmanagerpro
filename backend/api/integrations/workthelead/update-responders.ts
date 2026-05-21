/**
 * POST /api/integrations/workthelead/update-responders
 *
 * Scaffold — NOT YET FULLY IMPLEMENTED.
 * This route will eventually pull the latest responder list directly from
 * the TeleDirect "Work The Lead" API so advisors don't need to manually
 * copy-paste TSV exports.
 *
 * ─────────────────────────────────────────────
 * REQUIRED INFORMATION FROM TELEDIRECT (TODO):
 * ─────────────────────────────────────────────
 * 1. API endpoint base URL (e.g. https://app.workthelead.com/api/... or similar)
 * 2. Authentication method:
 *    - UserName  (env: TELEDIRECT_USERNAME)
 *    - Password  (env: TELEDIRECT_PASSWORD)
 *    - OR API token/key (env: TELEDIRECT_API_TOKEN)
 * 3. Client Login identifier  (env: TELEDIRECT_CLIENT_LOGIN or per-org stored in DB)
 * 4. Location Login identifier (env: TELEDIRECT_LOCATION_LOGIN or per-meeting stored in DB)
 * 5. Campaign / Location ID used to scope the leads fetch
 * 6. get_Leads.asp (or equivalent) endpoint — full docs, required params, response format
 * 7. Field definitions for the XML/JSON response:
 *    - Which field maps to First Name, Last Name, Phone, Email, Address, City, State, ZIP
 *    - Guest / A-row vs G-row distinction (or equivalent in API response)
 *    - Party size field (if different from guest rows)
 * 8. "Updated since" / delta support:
 *    - Is there a date filter (e.g. updatedSince=YYYY-MM-DD) to fetch only new/changed leads?
 *    - Or does every call return the full list?
 * 9. Rate limits (calls/minute, calls/day)
 * 10. Webhook availability — can TeleDirect push new leads to us instead of polling?
 *
 * ─────────────────────────────────────────────
 * INTENDED FLOW (once implemented):
 * ─────────────────────────────────────────────
 * 1. Receive POST { jobId, eventId, replaceExisting? }
 * 2. Authenticate with TeleDirect API using env credentials
 * 3. Fetch leads for the campaign/location matching jobId/eventId
 * 4. Normalize records into the same shape as import-tsv.ts output:
 *    { first_name, last_name, phone, email, address, city, state, zip, guests, guest_name }
 * 5. Upsert responders into `responders` table (same logic as import-tsv.ts)
 * 6. Trigger match-responders enrichment for the job
 * 7. Return { ok, inserted, updated, skipped, errors[] }
 *
 * ─────────────────────────────────────────────
 * REUSE EXISTING LOGIC:
 * ─────────────────────────────────────────────
 * - Upsert / duplicate detection: see import-tsv.ts (groupByAttendee, upsertRecords)
 * - Enrichment / matching:        see match-responders.ts
 * - Auth header validation:       see _lib/supabaseAdmin.ts → requireUserIdFromAuthHeader
 * - Supabase admin client:        see _lib/supabaseAdmin.ts → getSupabaseAdmin
 */

import { requireUserIdFromAuthHeader, getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Method not allowed' });
  }

  // Validate caller is authenticated
  let _userId: string;
  try {
    _userId = await requireUserIdFromAuthHeader(req);
  } catch (err: any) {
    return send(res, 401, { error: err.message });
  }

  const { jobId, eventId } = req.body ?? {};

  if (!jobId) {
    return send(res, 400, { error: 'jobId is required' });
  }

  // ─── SCAFFOLD: credentials not yet configured ───────────────────────────────
  const tdUsername = process.env.TELEDIRECT_USERNAME;
  const tdPassword = process.env.TELEDIRECT_PASSWORD;
  const tdApiToken = process.env.TELEDIRECT_API_TOKEN;

  if (!tdUsername && !tdApiToken) {
    return send(res, 501, {
      error: 'TeleDirect credentials not configured.',
      hint: 'Set TELEDIRECT_USERNAME + TELEDIRECT_PASSWORD (or TELEDIRECT_API_TOKEN) in environment variables.',
      jobId,
      eventId: eventId ?? null,
    });
  }

  // ─── TODO: implement once TeleDirect API docs are available ─────────────────
  //
  // const leads = await fetchTeleDirectLeads({ tdUsername, tdPassword, tdApiToken, jobId, eventId });
  // const normalized = normalizeTeleDirectLeads(leads);
  // const result = await upsertResponders(supabase, jobId, eventId, normalized);
  // await triggerMatchResponders(supabase, jobId);
  // return send(res, 200, { ok: true, ...result });

  return send(res, 501, {
    ok: false,
    error: 'Not yet implemented — awaiting TeleDirect API documentation and credentials.',
    jobId,
    eventId: eventId ?? null,
  });
}
