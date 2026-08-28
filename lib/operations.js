const MAX_RECENT_DURATIONS = 200;

const startedAt = new Date().toISOString();
const metrics = {
  requests: 0,
  serverErrors: 0,
  totalDurationMs: 0,
  slowestDurationMs: 0,
  recentDurations: [],
  routes: new Map(),
};

const API_ROUTES = new Set([
  "/api/health",
  "/api/ask",
  "/api/schedule",
  "/api/warmup",
  "/api/pool/status",
  "/api/rules/ask",
  "/api/community/ask",
  "/api/rules/status",
  "/api/rules/refresh",
  "/api/openings",
  "/api/openings/sources",
  "/api/openings/tips",
]);

function normalizedRoute(pathname) {
  if (API_ROUTES.has(pathname)) return pathname;
  if (pathname === "/") return "/";
  if (/^\/(?:community-assistant|food-truck|rules-assistant|pool|pool-status|openings)\/?$/.test(pathname)) {
    return pathname.replace(/\/$/, "") || "/";
  }
  return pathname.startsWith("/api/") ? "/api/other" : "/static";
}

function recordRequest(pathname, statusCode, durationMs) {
  const route = normalizedRoute(pathname);
  const duration = Math.max(0, Math.round(Number(durationMs) || 0));
  const current = metrics.routes.get(route) || {
    requests: 0,
    serverErrors: 0,
    totalDurationMs: 0,
    slowestDurationMs: 0,
  };

  metrics.requests += 1;
  metrics.totalDurationMs += duration;
  metrics.slowestDurationMs = Math.max(metrics.slowestDurationMs, duration);
  current.requests += 1;
  current.totalDurationMs += duration;
  current.slowestDurationMs = Math.max(current.slowestDurationMs, duration);

  if (statusCode >= 500) {
    metrics.serverErrors += 1;
    current.serverErrors += 1;
  }

  metrics.recentDurations.push(duration);
  if (metrics.recentDurations.length > MAX_RECENT_DURATIONS) {
    metrics.recentDurations.shift();
  }
  metrics.routes.set(route, current);
}

function percentile(values, percentage) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * percentage) - 1)];
}

function summarize(entry) {
  return {
    requests: entry.requests,
    serverErrors: entry.serverErrors,
    averageDurationMs: entry.requests
      ? Math.round(entry.totalDurationMs / entry.requests)
      : 0,
    slowestDurationMs: entry.slowestDurationMs,
  };
}

function operationsSnapshot() {
  return {
    startedAt,
    ...summarize(metrics),
    recentP95DurationMs: percentile(metrics.recentDurations, 0.95),
    routes: Object.fromEntries(
      [...metrics.routes.entries()].map(([route, entry]) => [route, summarize(entry)])
    ),
  };
}

module.exports = { normalizedRoute, operationsSnapshot, recordRequest };
