async function test() {
  try {
    const res = await fetch("https://krsbgejnviqyzytxaqaz.supabase.co/functions/v1/gemini-optimizer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Las Vegas Wealth", campaignType: "financial" })
    });
    console.log(res.status);
    console.log(await res.text());
  } catch(e) { console.log(e); }
}
test();
