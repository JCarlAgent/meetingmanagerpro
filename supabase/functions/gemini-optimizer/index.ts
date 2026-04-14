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
   - MEDICARE: If the user asks for Medicare, you MUST recommend mid-level, accessible restaurants (e.g., Denny's, Olive Garden, Chili's, Applebee's, Outback). REGIONAL EXCEPTION (Las Vegas/NV): You may suggest local bar/casinos but STRICTLY limit them to "PT's" (PT's Taverns/Pubs) or "Village Pub". Weigh these equally with the aforementioned chain restaurants based purely on demographic drive-time convenience. NEVER recommend "Dotty's" or "Jackpot Joanie's". Do NOT mention investible assets AT ALL for Medicare, strictly focus on income (e.g. $25k+) and exact age logic (e.g. if turning 65 in 4 months, target "64 yrs 8 months to 65 years old"). 
   - WEALTH/ANNUITY: If standard financial, recommend high-end restaurants (e.g. Capital Grille, Eddie V's) and cap investible assets (e.g. "$500k - $5M IPA").
2. Venue Geolocation & Proximity:
   - You must extract the exact number of venues requested from the user's prompt. If they ask for 1 venue, give 1. If they ask for 2 venues, give 2 separated by a pipe. Do NOT force multiple venues unless explicitly requested or clearly beneficial for A/B testing in a large region. 
   - General Venue Rule (All Types/Regions): Golf course clubhouses/bars are excellent considerations across ALL cities if they have capable dining/meeting rooms. However, carefully consider/note their operating hours.
   - Keep the multiple locations geographically balanced but separated so the overall map area isn't overlapping too much.
   ***STRICT GEOGRAPHY & PARKING FRICTION RULES***:
   - For Las Vegas specifically: NEVER recommend restaurants on the Las Vegas Strip or inside major megacasinos due to 10+ minute parking/walking friction. Use off-strip high-end spots instead. If recommending "local" casinos (like Red Rock or Green Valley Ranch), mentally account for the fact that parking/walking adds 5 minutes to the "drive time". 
   - For all major cities (e.g., Houston Medical Center, San Antonio Riverwalk, Los Angeles metro, downtown districts): Avoid high-density tourist or downtown centers where complex parking ramps or long walks are required. Only select easily accessible suburban or premium restaurants with standard parking access.
   3. Response Rate & Math: If the campaign is Medicare (Medicare Dinner Seminar, etc), use a strict 1.0% response rate (e.g., 60 attendees = 6,000 mailers). If the campaign is Financial/Annuity (Financial Dinner Seminar, etc), use a realistic response rate range of 0.6% to 0.75% (e.g., 60 attendees = ~8,000 to 10,000 mailers). EXPLICITLY state this mathematical assumption and expected response rate directly in the mailStrategy subtext.
4. Drive-time Polygons: Use precise "15-minute drive-time" phrasing rather than just static mile radius, using google maps routing logic hypothetically. CRITICAL: When describing the covered neighborhoods in the 'subtext', be geographically hyper-accurate. E.g. in Las Vegas, if you choose a venue near MacDonald Highlands, do NOT hallucinate coverage of Anthem if it's >15 mins away. Trace the literal real-world 15-minute drive time.
5. Formatted Venues Output (CRITICAL): You MUST include the exact street address for each venue to ensure map routing works. If providing multiple venues, separate them heavily with a pipe "|" character. Example: "Olive Garden - 5345 Landmart Dr, Fridley, MN | Applebee's - 1700 MN-36, Roseville, MN"
6. Real Phone Numbers: You MUST provide the real phone numbers for the suggested venues, formatted and separated by a pipe "|" in the phone field (e.g. "(555) 123-4567 | (555) 987-6543").

Use this JSON schema strictly:
{
  "targetAudience": {
    "headline": "Short description. For Medicare: 'Ages 64/8 mos-65, $25k+ Income'. For Annuity: 'Ages 60-70, $500k-$5M IPA'.",
    "subtext": "Proxy filter overview. DO NOT mention investible assets if Medicare."
  },
  "recommendedVenue": {
    "headline": "Venue names WITH EXACT COMPLETE STREET ADDRESS, City and State. If multiple, MUST separate with '|'. (e.g. 'Olive Garden - 5345 Landmart Dr, Fridley, MN | Tavern Grill - 3561 Lexington Ave, Arden Hills, MN')",
          "subtext": "Custom polygon detail. Use precise drive-time estimates (e.g., '20-minute automated drive-time polygon capturing affluent neighborhoods...')",
    "phone": "Provide the REAL phone number(s) here. Separate multiple with '|'."
  },
  "optimalTiming": {
    "headline": "Best day(s) and time(s)",
    "subtext": "Reasoning based on age & work schedule."
  },
  "mailStrategy": {
    "headline": "Number of mailers (MUST be Expected Attendees / 0.01)",
    "subtext": "Explain the expected response rate strictly (1% for Medicare, 0.6%-0.75% for Financial) and the math."
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
    const campaignType = body.campaignType; // 'financial', 'medicare', or 'mailer'
    
    
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
    
    if (campaignType === 'mailer') {
      inputFullText += `\n\nCRITICAL OVERRIDE FOR MAILER ONLY:\n1. DO NOT recommend a venue or restaurant. Set the recommended venue headline exactly to "Mailer Only Campaign - N/A".\n2. Set the recommended venue subtext to explain the ideal geographic mapping approach (e.g. driving distance from the advisor's office or targeting specific high-income zip codes).\n3. For optimalTiming, instead of discussing dinner meeting times, discuss the optimal day of the week for the direct mail piece to arrive in the prospect's mailbox.\n4. Ensure targetAudience still reflects the correct demographic profile based on the query.\n`;
    }
    
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

    // Explicitly targeting Gemini 2.5 Flash to bypass the 20/day quota limits of the v3 beta
    const payloadBody = JSON.stringify({
      system_instruction: { parts: { text: SYSTEM_PROMPT } },
      contents: [ { parts: [{ text: inputFullText }] } ],
      generationConfig: { response_mime_type: "application/json", temperature: 0.2 }
    });

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    
    let response: any;
    let data: any;
    let finalError: any = null;
    let success = false;
    
    // Tier A Fallback Strategy: 
    // Models to try in order (Primary -> Secondary).
    const models = [
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash-latest'
    ];
    
    const MAX_RETRIES_PER_MODEL = 3;

    for (const model of models) {
      let attempts = 0;
      
      while (attempts < MAX_RETRIES_PER_MODEL) {
        attempts++;
        try {
          console.log(`[AI Optimizer] Attempting model: ${model}, try ${attempts}/${MAX_RETRIES_PER_MODEL}`);
          
          response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {             
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payloadBody
          });
          
          data = await response.json();
          
          if (response.ok) {
            success = true;
            break;
          }
          
          const status = response.status;
          const isOverloaded = status === 503 || status === 429 || (data.error && data.error.code === 503);
          
          if (!isOverloaded && status !== 500) {
            // Not a temporary capacity issue, it's a hard error (e.g. 400 Bad Request, auth failure)
            finalError = data;
            break; // Break the while loop for this model
          }
          
          // It's a temporary error, prepare to retry
          console.warn(`[AI Optimizer] ${model} returned ${status}. High demand or rate limit.`);
          finalError = data;
          
        } catch (fetchErr) {
          console.error(`[AI Optimizer] Fetch exception on ${model}:`, fetchErr);
          finalError = fetchErr;
        }

        if (attempts < MAX_RETRIES_PER_MODEL) {
          // Exponential backoff + Jitter
          // Roughly: 1s, 2s, 4s + a little random extra
          const baseDelay = Math.pow(2, attempts - 1) * 1000;
          const jitter = Math.floor(Math.random() * 500); 
          const waitTime = baseDelay + jitter;
          console.log(`[AI Optimizer] Waiting ${waitTime}ms before next retry...`);
          await sleep(waitTime);
        }
      }
      
      if (success) {
        break; // Stop iterating through models
      } else if (!finalError || (finalError.error && finalError.error.code !== 503 && finalError.error.code !== 429)) {
        // If it was a non-503/429 error, we shouldn't necessarily keep trying other models unless we want to.
        // Actually, for maximum resilience on format errors, let's keep trying.
        console.log(`[AI Optimizer] Exhausted retries or hit hard error on ${model}. Moving to next model if available.`);
      }
    }
    
    if (!success) {
      // All models and retries have failed
      console.error('[AI Optimizer] ALL AI MODELS FAILED', finalError);
      throw new Error('Google AI Error: Service Currently Unavailable due to high demand. Please try again in a few moments. Details: ' + JSON.stringify(finalError));
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
