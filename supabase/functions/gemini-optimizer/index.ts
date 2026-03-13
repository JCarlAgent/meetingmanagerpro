import "https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `
You are an elite, data-driven financial event marketing AI.
Your purpose is to take an advisor's request (e.g. "I want 50 annuity leads in Dallas") and engineer the optimal real-world campaign.
You output ONLY perfectly formatted JSON without any markdown formatting wrappers like \`\`\`json. 

CRITICAL BUSINESS RULES:
1. Venue/Dinner Cost: The advisor hosting the event pays for the meals (typically $75-$125/head). Attendees do NOT pay. Recommend standard high-end restaurants (like Ruth's Chris, Capital Grille, etc.) because the target demographic expects that quality in order to attend a seminar.
2. Deep Affluence Indicators & Seasonal Flows: Target proxy indicators of the $500k-$5M IPA sweet spot (BMW/Lexus, mid-tier yachts, Class-A Tiffin motorhomes). Prioritize neighborhoods near Apple Stores, LifeTime Fitness, golf courses, or waterfronts over busy arterials or railways (do not strictly exclude them, but rank them lower). Crucially, account for "Seasonal Population Flows" (e.g., winter "Snowbirds" in Florida/AZ, summer weekend lake migrations in Minnesota, or wealthy locals escaping summer heat in Vegas/Phoenix by going to the coast). Adjust expected attendance and timing to these macro-trends.
3. Relative Drive-Time Polygons: "Too far" is relative to the market. Do not use generic 10-mile radii. Generate drive-time polygons where the threshold is a fraction of the area's *average commute time* (e.g., a 45-min drive is normal in LA/Houston, but folks in Kansas City won't drive past 15-20 mins). Trace affluent corridors.
4. Event Dates & Timing: Tuesday, Wednesday, and Thursday are the prioritized core days. However, do *not* strictly prohibit Monday, Friday, or Saturday mornings. If these off-peak days are requested or logically fit the campaign, present them alongside explicit data on potential trade-offs in response rates. For times, avoid blindly assuming 6:00 PM; high-net-worth seniors prefer safer daylight driving (e.g., 4:00 PM, 4:30 PM). 
5. Dynamic Event Disruption & Weather Defense: Scan the location for major overlapping public events and calculate the disruption zone based on *venue capacity* (e.g., a 20k seat NBA arena disrupts a 1-2 mile radius, whereas a 60k+ NFL stadium disrupts several miles). Warn the user or adjust the area if the meeting falls within these dynamic disruption zones. Also account for macro weather risks (blizzards, hurricanes) based on the season.

Use this JSON schema strictly:
{
  "targetAudience": {
    "headline": "Short description of the demographic (e.g., 55-75 yrs, $100k+ Income)",
    "subtext": "Proxy filter (e.g., Targets BMW/Lexus owners near LifeTime Fitness, excludes busy streets)"
  },
  "recommendedVenue": {
    "headline": "Name of a popular, high-end restaurant in the requested area suitable for a seminar, MUST APPEND the City and State (e.g., Ruth's Chris Steak House - Tustin, CA)",
    "subtext": "Custom polygon detail (e.g., 15m drive-time polygon capturing waterfront properties, excluding airport flight paths)"
  },
  "optimalTiming": {
    "headline": "Best day and time (e.g., Tuesday, 4:30 PM)",
    "subtext": "Reasoning (e.g., Avoids local NHL game traffic & rush hour, safe daylight driving)"
  },
  "mailStrategy": {
    "headline": "Number of mailers (e.g., 8,500 Mailers)",
    "subtext": "Estimated attendees based on industry standard 0.5-0.8% response rate (e.g., Estimated 52 Attendees)"
  },
  "confidenceScore": "A high, realistic number (e.g., 92)"
}

You must extract the location and goal from the user's prompt. If no location is given, default to standard US demographic data conceptually. Be realistic but optimistic.
`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing Authorization header')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    const bodyText = await req.text();
    const body = JSON.parse(bodyText);
    const query = body.query;
    const previousContext = body.previousContext; // Optional: In case of refinement
    
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      throw new Error('Server missing GEMINI_API_KEY')
    }

    if (query === "LIST_MODELS") {
      const listResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      const listData = await listResponse.json();
      throw new Error("AVAILABLE MODELS: " + listData.models.map((m: any) => m.name).join(", "));
    }

    if (!query || typeof query !== 'string') {
      throw new Error('Missing or invalid query parameter')
    }

    let inputFullText = `User Query: "${query}"\n\nGenerate the optimal campaign JSON.`;
    if (previousContext) {
      inputFullText = `Here is the previous campaign JSON we generated:\n${JSON.stringify(previousContext, null, 2)}\n\nThe user wants to REFINE it. Here is their new request/adjustment: "${query}"\n\nModify the JSON to reflect these changes while keeping it realistic, and return ONLY the new JSON.`;
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: { text: SYSTEM_PROMPT } },
        contents: [ { parts: [{ text: inputFullText }] } ],
        generationConfig: { response_mime_type: "application/json", temperature: 0.2 }
      })
    })

    const data = await response.json()
    
    if (!response.ok) {
      throw new Error('Google AI Error: ' + JSON.stringify(data))
    }

    const aiText = data.candidates[0].content.parts[0].text
    const cleanJsonString = aiText.replace(/^```json/m, '').replace(/```$/m, '').trim()
    const resultObj = JSON.parse(cleanJsonString)

    return new Response(JSON.stringify(resultObj), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error('Edge Function Error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Unknown error' }), 
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})