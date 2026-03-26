const fetch = require('node-fetch'); // assuming node 18+ has fetch natively

async function test() {
  try {
    const res = await fetch("https://krsbgejnviqyzytxaqaz.supabase.co/functions/v1/gemini-optimizer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Add anon key if necessary, but trying without first or passing a dummy
      },
      body: JSON.stringify({ query: "Las Vegas Wealth", campaignType: "financial" })
    });
    console.log(res.status);
    console.log(await res.text());
  } catch(e) {
    console.log(e);
  }
}
test();
