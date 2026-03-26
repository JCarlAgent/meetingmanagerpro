const fetch = require('node-fetch'); // or just global fetch in node 20
async function test() {
  const res = await fetch("https://krsbgejnviqyzytxaqaz.supabase.co/functions/v1/gemini-optimizer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Needs ANON KEY
      },
      body: JSON.stringify({ query: "Las Vegas Wealth", campaignType: "financial" })
  });
  console.log(await res.text());
}
// test();
