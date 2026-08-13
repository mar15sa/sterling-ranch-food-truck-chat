const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_PATH = path.join(__dirname, "..", "data", "openings.json");
const WRITE = process.argv.includes("--write");
const COLORADO_BOUNDS = { south: 39.1, north: 39.75, west: -105.25, east: -104.6 };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLocal(result) {
  const lat = Number(result.lat);
  const lng = Number(result.lon);
  return lat >= COLORADO_BOUNDS.south && lat <= COLORADO_BOUNDS.north && lng >= COLORADO_BOUNDS.west && lng <= COLORADO_BOUNDS.east;
}

function precisionFor(item, result) {
  const exactStreet = /^\d/.test(item.address) && !/\b(near|between|road and|parkway and)\b/i.test(item.address);
  if (!exactStreet) return "approximate";
  if (result.service === "ArcGIS") {
    return result.score >= 90 && ["PointAddress", "StreetAddress", "Subaddress"].includes(result.type)
      ? "address"
      : "approximate";
  }
  return "address";
}

async function geocodeArcgis(query) {
  const url = new URL("https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates");
  url.searchParams.set("SingleLine", query);
  url.searchParams.set("f", "json");
  url.searchParams.set("outFields", "Match_addr,Addr_type");
  url.searchParams.set("maxLocations", "5");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`ArcGIS geocoder returned ${response.status}`);
  const data = await response.json();
  const candidate = (data.candidates || []).find((entry) => {
    const point = { lat: entry.location?.y, lon: entry.location?.x };
    return entry.score >= 75 && isLocal(point);
  });
  if (!candidate) return null;
  return {
    lat: candidate.location.y,
    lon: candidate.location.x,
    type: candidate.attributes?.Addr_type,
    score: candidate.score,
    displayName: candidate.address,
    service: "ArcGIS",
  };
}

async function geocodeNominatim(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  const response = await fetch(url, {
    headers: {
      "User-Agent": "SterlingRanchSociety-OpeningsTracker/1.0 (sterlingranchsociety.com)",
      "Accept-Language": "en-US,en",
    },
  });
  if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
  const results = await response.json();
  const result = results.find(isLocal);
  if (!result) return null;
  return { ...result, score: 100, displayName: result.display_name, service: "OpenStreetMap" };
}

async function geocode(query) {
  return (await geocodeArcgis(query)) || geocodeNominatim(query);
}

async function main() {
  const catalog = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
  const cache = new Map();
  const failures = [];
  let requests = 0;

  for (const item of catalog.items) {
    const queries = [
      item.address,
      `${item.area}, ${item.community}, Colorado`,
      `${item.name}, ${item.community}, Colorado`,
    ].filter((query, index, all) => query && all.indexOf(query) === index);
    let result = null;
    let matchedQuery = null;
    for (const query of queries) {
      if (cache.has(query)) {
        result = cache.get(query);
      } else {
        if (requests) await sleep(175);
        result = await geocode(query);
        cache.set(query, result);
        requests += 1;
      }
      if (result) {
        matchedQuery = query;
        break;
      }
    }
    if (!result) {
      failures.push(`${item.name} | ${item.address}`);
      continue;
    }
    item.coordinates = {
      lat: Number(Number(result.lat).toFixed(6)),
      lng: Number(Number(result.lon).toFixed(6)),
      precision: precisionFor(item, result),
      geocodedFrom: matchedQuery,
    };
    process.stdout.write(`✓ ${item.name}: ${item.coordinates.lat}, ${item.coordinates.lng} (${item.coordinates.precision})\n`);
  }

  if (WRITE) await fs.writeFile(DATA_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
  process.stdout.write(`\n${catalog.items.length - failures.length}/${catalog.items.length} mapped using ${requests} geocoder requests.\n`);
  if (failures.length) process.stdout.write(`Unmatched:\n${failures.join("\n")}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
