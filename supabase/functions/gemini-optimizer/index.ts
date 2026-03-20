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
2. Deep Affluence Indicators & Seasonal Flows: Use insights about wealth indicators and seasonal flows to influence your venue pick and polygon size, BUT DO NOT EVER mention negative exclusions (commercial zones, apartments, flight paths) to the user. Describe the audience strictly in standard advisor terms, ensuring you ALWAYS cap Investable Assets (e.g., "$500k - $5M IPA" rather than just "$500k+"). Use the word "Prioritizes" instead of "Targets".
3. Relative Drive-Time Polygons: Target affluent corridors. Never mention "avoiding" bad areas. Just describe the positive areas captured. CRITICAL: If the user specifies a sub-region (e.g., "NW Raleigh" or "North Dallas"), you MUST find a venue explicitly IN that sub-region and keep the drive-time strictly localized to that side of the city. People do not cross metropolitan centers for dinners.
4. Event Dates & Timing: Base event timing dynamically on the target demographic. Working-age targets (<65) need a 6:00 PM or 6:30 PM start time to accommodate work schedules. Older, retired targets (>68) prefer earlier times like 4:30 PM or 5:00 PM to avoid night driving. Factor in 30-40 minutes of presentation time before food is served when calculating standard dinner hours. Stop defaulting entirely to 4:30 PM. Provide logical reasoning. If the user asks for MULTIPLE meetings (e.g. "two meetings"), you MUST list ALL requested dates/times in the optimalTiming box (e.g., "Tuesday Oct 12 & Thursday Oct 14").
5. Dynamic Event Disruption & Weather Defense: Scan the location for major overlapping public events and calculate the disruption zone based on *venue capacity* (e.g., a 20k seat NBA arena disrupts a 1-2 mile radius, whereas a 60k+ NFL stadium disrupts several miles). Warn the user or adjust the area if the meeting falls within these dynamic disruption zones. Also account for macro weather risks (blizzards, hurricanes) based on the season.

Use this JSON schema strictly:
{
  "targetAudience": {
    "headline": "Short description with age & capped IPA (e.g., Ages 60-70, $500k - $5M Investable Assets)",
    "subtext": "Proxy filter overview. Use the word 'Prioritizes' (not 'Targets'). DO NOT mention avoiding commercial districts or what is excluded. (e.g., Prioritizes luxury vehicle owners and high home values in affluent sectors.)"
  },
  "recommendedVenue": {
    "headline": "Name of a popular, high-end restaurant in the requested area suitable for a seminar, MUST APPEND the City and State (e.g., Ruth's Chris Steak House - Tustin, CA)",
    "subtext": "Custom polygon detail tied to the specific sub-region requested. DO NOT mention avoiding anything. (e.g., Localized 12m drive-time polygon capturing affluent waterfront communities in NW Raleigh)",
    "phone": "The publicly available contact phone number for the chosen restaurant so the user can easily call to book (e.g., (555) 123-4567 - provide accurate number if possible, or placeholder if obscure)"
  },
  "optimalTiming": {
    "headline": "Best day(s) and time(s) - must include ALL meetings requested (e.g., Tuesday Oct 12 & Thursday Oct 14 at 5:30 PM)",
    "subtext": "Reasoning (e.g., Avoids local NHL game traffic & rush hour, accommodates post-work schedules)"
  },
  "mailStrategy": {
    "headline": "Number of mailers (e.g., 6,500 highly-targeted mailers)",
    "subtext": "Explain the realistic expected attendee goals based on the list size. For finance/retiree direct mail, assume a realistic response rate of 0.4% to 0.8% and calculate expected attendees mathematically."
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
    const listContext = body.listContext; // Optional: Raw data list summary
    
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

    let inputFullText = `User Query: "${query}"`;
    
    if (listContext) {
      let ageDetails = '';
      if (listContext.ageDistribution) {
        ageDetails = `- Median Age: ${listContext.ageDistribution.medianAge} years old\n` +
                     `  - % Working Age (<65): ${listContext.ageDistribution.workingAgePct}%\n` +
                     `  - % Early Retirees (65-70): ${listContext.ageDistribution.earlyRetireePct}%\n` +
                     `  - % Late Retirees (70+): ${listContext.ageDistribution.lateRetireePct}%\n` +
                     `  *CRITICAL AI INSTRUCTION*: Use the age composition to pick meeting times. If highly working-class (<65), prioritize 6:30 PM. If heavily skewed to older retirees, prefer 4:30 PM, or mix both across dates if diverse.\n`;
      } else if (listContext.averageAge) {
        // Fallback backward compatibility 
        ageDetails = `- Average Age of List: ${listContext.averageAge} years old\n`;
      }

      inputFullText += `\n\nATTACHED DATA LIST ANALYSIS:\n` +
        `The user has uploaded a raw data manifest (e.g. from AccuLeads or similar broker).\n` +
        `- Total Raw Records Available: ${listContext.totalRecords}\n` +
        `- Primary Geo-Centers in Data: ${listContext.primaryLocations.join(', ')}\n` +
        ageDetails +
        `CRITICAL INSTRUCTION: Since the user provided a real list, you MUST base your 'mailStrategy' on these exact numbers (e.g., if the list has 12,000 records, suggest mailing a subset like 6,000 to this specific polygon). If the list is large, recommend parsing it. Adjust the target audience to match the fact that they are filtering a pre-purchased manifest.`;
    }

    inputFullText += `\n\nGenerate the optimal campaign JSON.`;

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