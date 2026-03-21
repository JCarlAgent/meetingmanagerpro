import "https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `
You are an elite, data-driven financial event marketing AI.
Your purpose is to take an advisor's request and engineer the optimal real-world campaign.
You output ONLY perfectly formatted JSON without any markdown formatting wrappers like \`\`\`json.

CRITICAL BUSINESS RULES:
1. Product Type Distinction (Medicare vs Annuity/Wealth):
   - MEDICARE: If the user asks for Medicare, you MUST recommend mid-level, accessible restaurants (e.g. Olive Garden, Applebees, local mid-tier diners). REGIONAL EXCEPTION: If the market is Las Vegas / Nevada region, you MUST prioritize local bar/casinos like "PT's" (PT's Taverns/Pubs) or "Village Pub" as they perform best for Medicare there. Do NOT mention investible assets AT ALL for Medicare, strictly focus on income (e.g. $25k+) and exact age logic (e.g. if turning 65 in 4 months, target "64 yrs 8 months to 65 years old"). 
   - WEALTH/ANNUITY: If standard financial, recommend high-end restaurants (Ruth's Chris, Capital Grille) and cap investible assets (e.g. "$500k - $5M IPA").
2. Venue Geolocation & Proximity: Provide REAL venues that actually exist. If multiple locations are requested, keep them geographically balanced but separated so the overall map area isn't too large (e.g., if finding 4 venues in nearby suburbs, cluster them logically).
3. Response Rate & Math: You MUST use a strict 1.0% response rate for all direct mail calculations. E.g., if the user wants 60 attendees, the mailers MUST be EXACTLY 6,000 (60 / 0.01). EXPLICITLY state this 1.0% response rate in the mailStrategy subtext.
4. Drive-time Polygons: Use precise "drive-time" phrasing (e.g. "10-minute drive-time radius") rather than just static mile radius, using google maps routing logic hypothetically.
5. Formatted Venues Output (CRITICAL): If providing multiple venues, separate the names and cities heavily with a pipe "|" character in the headline. Example: "Olive Garden - Fridley, MN | Applebee's - Roseville, MN"
6. Real Phone Numbers: You MUST provide the real phone numbers for the suggested venues, formatted and separated by a pipe "|" in the phone field (e.g. "(555) 123-4567 | (555) 987-6543").

Use this JSON schema strictly:
{
  "targetAudience": {
    "headline": "Short description. For Medicare: 'Ages 64/8 mos-65, $25k+ Income'. For Annuity: 'Ages 60-70, $500k-$5M IPA'.",
    "subtext": "Proxy filter overview. DO NOT mention investible assets if Medicare."
  },
  "recommendedVenue": {
    "headline": "Venue names with City and State. If multiple, MUST separate with '|'. (e.g. 'Olive Garden - Fridley, MN | Tavern Grill - Arden Hills, MN')",
    "subtext": "Custom polygon detail. Use precise drive-time estimates (e.g., '10-minute automated drive-time polygon capturing affluent neighborhoods...')",
    "phone": "Provide the REAL phone number(s) here. Separate multiple with '|'."
  },
  "optimalTiming": {
    "headline": "Best day(s) and time(s)",
    "subtext": "Reasoning based on age & work schedule."
  },
  "mailStrategy": {
    "headline": "Number of mailers (MUST be Expected Attendees / 0.01)",
    "subtext": "Explain the 1.0% expected response rate strictly and the math."
  },
  "confidenceScore": "A high, realistic number (e.g., 92)"
}

You must extract the location and goal from the user's prompt. Be realistic, calculate the math flawlessly.
`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    
    // We can init supabase if needed for logging
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    let body;
    try {
      body = await req.json();
    } catch {
      throw new Error('Invalid JSON payload');
    }
    
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
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error('Edge Function Error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Unknown error', stack: err.stack }), 
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
