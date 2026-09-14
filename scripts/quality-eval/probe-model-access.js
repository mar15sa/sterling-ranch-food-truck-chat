"use strict";
// Read-only credential presence and provider model access. Never print credentials.
const fs = require("node:fs");
async function main() {
  const output = { checkedAt: new Date().toISOString(), credentials: {}, providers: {} };
  for (const key of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]) output.credentials[key] = Boolean(process.env[key]);
  if (process.env.ANTHROPIC_API_KEY) {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(15000)
    });
    const data = await res.json();
    output.providers.anthropic = { status: res.status, hasMore: data.has_more ?? null,
      eligibleModelIds: (data.data || []).map(x => x.id).filter(x => /haiku|sonnet|opus/.test(x)),
      errorType: data.error?.type || null };
  }
  if (process.env.OPENAI_API_KEY) {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: "Bearer " + process.env.OPENAI_API_KEY }, signal: AbortSignal.timeout(15000)
    });
    const data = await res.json();
    output.providers.openai = { status: res.status,
      eligibleModelIds: (data.data || []).map(x => x.id).filter(x => /^gpt-5/.test(x)),
      errorType: data.error?.type || null };
  }
  const out = process.argv[2];
  if (out) fs.writeFileSync(out, JSON.stringify(output, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(output, null, 2));
}
main().catch(e => { console.error(e.name + ": model-access check did not complete"); process.exitCode = 1; });
