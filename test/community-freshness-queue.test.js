const test = require("node:test");
const assert = require("node:assert/strict");
const { crawlCommunity } = require("../lib/community-ingest");
const { reconcileCommunityIndex } = require("../lib/community-source-manager");

const NOW = Date.parse("2026-09-08T12:00:00.000Z");
const EXPIRED = "2026-09-01T00:00:00.000Z";
const root = "https://alpha.gov/";
const pendingUrls = ["a", "b", "c", "d", "e"].map((part) => `https://alpha.gov/${part}`);

function profile() {
  return {
    schemaVersion: 1, communityId: "alpha", name: "Alpha", shortName: "Alpha", website: root,
    platform: "civicplus-web-central", timezone: "America/Denver", status: "active", allowedHosts: ["alpha.gov"], actions: [],
    connectors: [{ id: "website", type: "civicplus-pages", baseUrl: root, refreshMinutes: 1440, maxPages: 1, seedUrls: [] }],
    authority: { rules: ["civicplus-pages"], facilities: ["civicplus-pages"], forms: ["civicplus-pages"], events: ["civicplus-pages"], alerts: ["civicplus-pages"], status: ["civicplus-pages"], services: ["civicplus-pages"] },
    factAuthority: { "live-status": ["civicplus-pages"], "facility-hours": ["civicplus-pages"], "reservation-policy": ["civicplus-pages"], fee: ["civicplus-pages"], restriction: ["civicplus-pages"], contact: ["civicplus-pages"], submission: ["civicplus-pages"], "event-date": ["civicplus-pages"] },
  };
}

function page(body) {
  return `<main data-cpRole="mainContentContainer"><h1>Official pool hours</h1><p>${body}</p></main>`;
}

async function baseline() {
  return crawlCommunity(profile(), {
    maxPages: 1, discoverSitemap: false, now: NOW - 86_400_000,
    lookup: async () => [{ address: "203.0.113.10", family: 4 }],
    fetchImpl: async () => new Response(page("Pool hours Monday-Friday: 8:00 am - 6:00 pm. Official resident information."), { headers: { "content-type": "text/html" } }),
  });
}

function trustedIndex(index) {
  return {
    ...index,
    sources: index.sources.map((source) => ({ ...source, checkedAt: EXPIRED, staleAfter: EXPIRED })),
    inventory: { ...index.inventory, eligibleUrls: [root, ...pendingUrls], pendingUrls, pendingCount: pendingUrls.length },
  };
}

async function refresh(trusted, body) {
  const fetched = [];
  const candidate = await crawlCommunity(profile(), {
    previousIndex: trusted, maxPages: 1, discoverSitemap: false, now: NOW,
    lookup: async () => [{ address: "203.0.113.10", family: 4 }],
    fetchImpl: async (url) => {
      fetched.push(String(url));
      return new Response(page(body), { headers: { "content-type": "text/html" } });
    },
  });
  return { candidate, fetched };
}

test("an expired approved URL is refreshed before a larger pending inventory and exact content renews only freshness", async () => {
  const trusted = trustedIndex(await baseline());
  const { candidate, fetched } = await refresh(trusted, "Pool hours Monday-Friday: 8:00 am - 6:00 pm. Official resident information.");
  assert.deepEqual(fetched, [root]);
  assert.equal(candidate.inventory.pendingCount, pendingUrls.length);
  const reconciled = reconcileCommunityIndex(trusted, candidate);
  assert.equal(reconciled.pendingReview, null);
  assert.equal(reconciled.index.sources[0].contentHash, trusted.sources[0].contentHash);
  assert.equal(reconciled.index.sources[0].checkedAt, new Date(NOW).toISOString());
  assert.ok(new Date(reconciled.index.sources[0].staleAfter).getTime() > NOW);
});

test("an expired approved URL with changed content is queued urgently but remains pending review", async () => {
  const trusted = trustedIndex(await baseline());
  const { candidate, fetched } = await refresh(trusted, "Pool hours Monday-Friday: 9:00 am - 7:00 pm. Official resident information.");
  assert.deepEqual(fetched, [root]);
  const reconciled = reconcileCommunityIndex(trusted, candidate);
  assert.equal(reconciled.index.sources[0].contentHash, trusted.sources[0].contentHash);
  assert.equal(reconciled.index.sources[0].staleAfter, EXPIRED);
  assert.deepEqual(reconciled.pendingReview.changedSourceIds, [trusted.sources[0].id]);
});

test("each incremental refresh reserves a bounded slot for approved evidence before inventory-only URLs", async () => {
  const fresh = {
    ...(await baseline()),
    inventory: { eligibleUrls: [root, ...pendingUrls], pendingUrls, pendingCount: pendingUrls.length },
  };
  const fetched = [];
  await crawlCommunity(profile(), {
    previousIndex: fresh, incrementalRefresh: true, maxPages: 1, discoverSitemap: false, now: NOW,
    lookup: async () => [{ address: "203.0.113.10", family: 4 }],
    fetchImpl: async (url) => {
      fetched.push(String(url));
      return new Response(page("Pool hours Monday-Friday: 8:00 am - 6:00 pm. Official resident information."), { headers: { "content-type": "text/html" } });
    },
  });
  assert.deepEqual(fetched, [root]);
});
