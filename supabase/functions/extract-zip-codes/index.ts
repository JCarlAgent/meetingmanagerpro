import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as turf from "https://esm.sh/@turf/turf@6.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { isochroneGeojson } = await req.json();

    if (!isochroneGeojson || !isochroneGeojson.features || isochroneGeojson.features.length === 0) {
       return new Response(JSON.stringify({ error: "Invalid or missing isochrone GeoJSON" }), { 
         headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
         status: 400 
       });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Get the polygon feature from the Mapbox Isochrone
    // Create a feature collection of all polygons to get the master bounding box for the DB query
    const allPolygons = turf.featureCollection(isochroneGeojson.features);
    const bbox = turf.bbox(allPolygons);
    const minLng = bbox[0];
    const minLat = bbox[1];
    const maxLng = bbox[2];
    const maxLat = bbox[3];

    // 3. Query our Zip Code table for ANY zip codes inside that large generic square
    const { data: rawZips, error: dbError } = await supabase
      .from('us_zipcodes')
      .select('zip, lat, lng')
      .gte('lat', minLat - 0.05)
      .lte('lat', maxLat + 0.05)
      .gte('lng', minLng - 0.05)
      .lte('lng', maxLng + 0.05);

    if (dbError) throw dbError;

    // 4. Trace the jagged edges: Use Turf.js to check if the specific center point 
    // of each Zip Code falls EXACTLY inside the 20-minute drive-time polygon shape.
    const exactZips = [];
    console.log(`Found ${rawZips.length} zips in bounding box`);
    
    for (const zipObj of rawZips) {
      // Turf expects [longitude, latitude]
      const pt = turf.point([parseFloat(zipObj.lng), parseFloat(zipObj.lat)]);
      
      // Check if point is inside ANY of the provided polygons
      let isInside = false;
      for (const poly of isochroneGeojson.features) {
        if (turf.booleanPointInPolygon(pt, poly)) {
          isInside = true;
          break;
        }
      }
      if (isInside) {
        exactZips.push(zipObj.zip);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        bounds_matched: rawZips.length,
        exact_matches: exactZips.length,
        zip_codes: exactZips 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
