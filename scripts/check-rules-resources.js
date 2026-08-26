#!/usr/bin/env node

const resources = require("../data/rules-official-resources.json");

const live = process.argv.includes("--live");
const cabHosts = ["sterlingranchcab.com", "www.sterlingranchcab.com"];
const allowedHostsByResource = {
  facilityRentalCatalog: new Set(["secure.rec1.com"]),
};

async function main() {
  const entries = Object.entries(resources);
  if (!entries.length) throw new Error("No official rules resources are configured.");
  for (const [name, value] of entries) {
    const allowedHosts = allowedHostsByResource[name] || new Set(cabHosts);
    const url = new URL(value);
    if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) {
      throw new Error(`${name} must use an approved official HTTPS host.`);
    }
    if (!live) continue;
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      headers: { "user-agent": "Sterling Ranch rules resource monitor" },
    });
    if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}.`);
    const finalUrl = new URL(response.url);
    if (!allowedHosts.has(finalUrl.hostname)) {
      throw new Error(`${name} redirected away from its approved official host.`);
    }
  }
  console.log(`Official rules resource check passed for ${entries.length} links${live ? " (live)" : ""}.`);
}

main().catch((error) => {
  console.error(`Official rules resource check failed: ${error.message}`);
  process.exitCode = 1;
});
