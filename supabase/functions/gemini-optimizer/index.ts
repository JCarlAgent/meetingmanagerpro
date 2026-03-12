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

Use this JSON schema strictly:
{
  "targetAudience": {
    "headline": "Short description of the demographic (e.g., 55-75 yrs, $100k+ Income)",
    "subtext": "Secondary filter (e.g., $500k+ Investable Assets)"
  },
  "recommendedVenue": {
    "headline": "Name of a popular, high-end restaurant in the requested area suitable for a seminar (e.g., Ruth's Chris Steak House)",
    "subtext": "General area or drive-zone detail (e.g., Uptown Dallas, 15m Drive Zone)"
  },
  "optimalTiming": {
    "headline": "Best day and time (e.g., Tuesday, 4:30 PM)",
    "subtext": "Reasoning (e.g., Avoids rush hour & night driving)"
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

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: { text: SYSTEM_PROMPT } },
        contents: [ { parts: [{ text: `User Query: "${query}"\n\nGenerate the optimal campaign JSON.` }] } ],
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