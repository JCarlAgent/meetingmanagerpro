import "https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts"
Deno.serve(async (req) => {
  const model = new URL(req.url).searchParams.get('model') || 'gemini-2.0-flash-lite';
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: "Hello" }] }] })
  });
  const data = await response.json();
  return new Response(JSON.stringify({ status: response.status, data }), { headers: { 'Content-Type': 'application/json' } })})
