const { connectorAdapterContract } = require("./community-connector-adapter");
const { getCommunityEvents, localDateParts } = require("./community-events");

function calendarConfiguration(profile) {
  const connector = (profile.connectors || []).find(
    (item) =>
      item.type === "civicplus-calendar" &&
      item.adapter?.capabilities?.includes("events"),
  );
  if (!connector)
    return {
      adapter: null,
      action: {
        url: profile.website,
        label: "Open official community website",
      },
    };
  const adapter = connectorAdapterContract(profile, connector);
  const endpoint =
    adapter.endpoints.find((item) => item.id === "primary") ||
    adapter.endpoints[0];
  return {
    adapter,
    action: {
      url: endpoint.url,
      label: adapter.labels.openAction || "Open official community calendar",
    },
  };
}

async function upcomingCommunityEvents(profile, options = {}) {
  const { adapter, action } = calendarConfiguration(profile);
  const now =
    options.now instanceof Date
      ? options.now
      : new Date(options.now || Date.now());
  const { year, month, day } = localDateParts(now, profile.timezone);
  const start = new Date(Date.UTC(year, month - 1, day));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const range = {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
  const base = { events: [], action, range, timezone: profile.timezone };
  if (!adapter) return { ...base, status: "unavailable" };
  // The connector's CivicPlus list query is day-scoped. Request each day
  // rather than treating one response as a complete week or month.
  const requests = [];
  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const date = cursor.toISOString().slice(0, 10);
    requests.push({ dateRange: { start: date, end: date } });
  }
  const results = await Promise.allSettled(
    requests.map((request) =>
      getCommunityEvents(request, { ...options, now, profile, adapter }),
    ),
  );
  // CivicPlus occasionally drops one request when all seven days are checked
  // together. Retry only the missed days so a brief upstream hiccup does not
  // make an otherwise complete resident calendar look broken.
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (
      result.status === "fulfilled" &&
      result.value.evidenceEnvelope?.degradation.state === "healthy"
    ) continue;
    [results[index]] = await Promise.allSettled([
      getCommunityEvents(requests[index], {
        ...options,
        now,
        profile,
        adapter,
        timeoutMs: options.timeoutMs || 12000,
      }),
    ]);
  }
  const events = new Map();
  const identities = new Set();
  const evidence = [];
  let incomplete = false;
  for (const result of results) {
    if (
      result.status !== "fulfilled" ||
      result.value.evidenceEnvelope?.degradation.state !== "healthy"
    ) {
      incomplete = true;
      continue;
    }
    const data = result.value;
    evidence.push(data.evidenceEnvelope);
    for (const event of data.events) {
      const identity = `${event.startDate}:${event.title.trim().toLowerCase()}:${event.location}`;
      const key = `${event.startDate}:${event.url || event.id}`;
      if (events.has(key) || identities.has(identity)) continue;
      identities.add(identity);
      events.set(key, event);
    }
  }
  const upcoming = [...events.values()]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 7);
  return {
    ...base,
    events: upcoming,
    evidence,
    status: incomplete
      ? upcoming.length
        ? "partial"
        : "unavailable"
      : upcoming.length
        ? "ready"
        : "empty",
  };
}
module.exports = { calendarConfiguration, upcomingCommunityEvents };
