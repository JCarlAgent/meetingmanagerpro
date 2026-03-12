import "https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) throw new Error('Unauthorized')

    // 1. Get all upcoming meetings for this user.
    const { data: meetings, error: dbError } = await supabase
      .from('job_meetings')
      .select('id, job_id, starts_at, city, state, jobs!inner(title, created_by_user_id, status)')
      .eq('jobs.created_by_user_id', user.id)
      .neq('jobs.status', 'cancelled')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })

    if (dbError) throw dbError;
    if (!meetings || meetings.length === 0) {
      return new Response(JSON.stringify({ alerts: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const alertsReport = [];
    const geoCache = new Map();

    for (const meeting of meetings) {
      if (!meeting.city) continue;

      const cacheKey = `${meeting.city}-${meeting.state}`.toLowerCase();
      let lat, lon;

      if (geoCache.has(cacheKey)) {
        const cached = geoCache.get(cacheKey);
        lat = cached.lat; lon = cached.lon;
      } else {
        // Geocode accurately
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(meeting.city)}&count=3&format=json`);
        const geoData = await geoRes.json();
        
        let bestMatch;
        if (geoData.results && meeting.state) {
           bestMatch = geoData.results.find((r: any) => 
               r.admin1 && (r.admin1.toLowerCase() === meeting.state.toLowerCase() || r.admin1.substring(0,2).toLowerCase() === meeting.state.toLowerCase().substring(0,2))
           ) || geoData.results[0];
        } else if (geoData.results) {
           bestMatch = geoData.results[0];
        }

        if (bestMatch) {
          lat = bestMatch.latitude;
          lon = bestMatch.longitude;
          geoCache.set(cacheKey, { lat, lon });
        }
      }

      if (lat && lon) {
        try {
          const nwsRes = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`, {
            headers: {
              'User-Agent': 'MeetingManagerPro/1.0',
              'Accept': 'application/geo+json'
            }
          });
          
          if (nwsRes.ok) {
            const nwsData = await nwsRes.json();
            if (nwsData.features && nwsData.features.length > 0) {
              const severeAlerts = nwsData.features.filter((f: any) => {
                  const severity = f.properties.severity;
                  const event = f.properties.event || '';
                  // Filter to only flag major warnings
                  return ['Severe', 'Extreme'].includes(severity) || 
                         event.includes('Hurricane') || 
                         event.includes('Tornado') || 
                         event.includes('Blizzard') ||
                         event.includes('Warning') ||
                         event.includes('Tropical Storm');
              }).map((f: any) => ({
                  event: f.properties.event,
                  headline: f.properties.headline,
                  severity: f.properties.severity,
                  description: f.properties.description
              }));

              if (severeAlerts.length > 0) {
                 alertsReport.push({
                    jobId: meeting.job_id,
                    meetingId: meeting.id,
                    jobTitle: meeting.jobs.title,
                    city: meeting.city,
                    state: meeting.state,
                    startsAt: meeting.starts_at,
                    alerts: severeAlerts
                 });
              }
            }
          }
        } catch (e) {
          console.error('NWS fetch error', e);
        }
      }
    }

    return new Response(JSON.stringify({ alerts: alertsReport }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error('Weather Alerts Error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Unknown error' }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})