const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "x-frame-options": "SAMEORIGIN",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "content-security-policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
    "object-src 'none'",
  ].join("; "),
};

function clientKeyForRateLimit(req) {
  const cloudflare = String(req.headers["cf-connecting-ip"] || "").trim();
  const proxyAddress = String(req.headers["x-real-ip"] || "").trim();
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .at(-1);
  return cloudflare || proxyAddress || forwarded || req.socket?.remoteAddress || "unknown";
}

function publicServerError(error, environment = process.env.NODE_ENV) {
  return {
    error: "Something went wrong while checking this request.",
    ...(environment === "production" ? {} : { detail: error?.message || String(error) }),
  };
}

module.exports = { SECURITY_HEADERS, clientKeyForRateLimit, publicServerError };
