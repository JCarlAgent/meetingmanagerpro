import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUserIdFromAuthHeader } from '../_lib/supabaseAdmin.js';

// Ensure the system prompt forces Gemini to act strictly as an event marketing expert
// and return perfectly parsable JSON to populate our UI components.
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

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Ensure the user is logged in (Data Toll lockout logic can also be verified here eventually)
  try {
    await requireUserIdFromAuthHeader(req);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API Key is not configured on the server.' });
  }

  // Parse the query from the request body
  let parsedBody;
  try {
    parsedBody = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch (error) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!parsedBody || !parsedBody.query || typeof parsedBody.query !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid query parameter' });
  }

  const { query } = parsedBody;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        system_instruction: {
            parts: { text: SYSTEM_PROMPT }
        },
        contents: [
          {
            parts: [{ text: \`User Query: "\${query}"\\n\\nGenerate the optimal campaign JSON.\` }]
          }
        ],
        generationConfig: {
          response_mime_type: "application/json",
          temperature: 0.2
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini API Error:', data);
      return res.status(500).json({ error: 'Failed to generate AI response' });
    }

    const aiText = data.candidates[0].content.parts[0].text;
    
    // Safety check just in case Gemini wrapped it in markdown anyway
    const cleanJsonString = aiText.replace(/^\`\`\`json/m, '').replace(/\`\`\`$/m, '').trim();
    const resultObj = JSON.parse(cleanJsonString);

    return res.status(200).json(resultObj);

  } catch (err: any) {
    console.error('AI Processing Error:', err);
    return res.status(500).json({ error: 'Internal AI processing error', details: err.message });
  }
}
