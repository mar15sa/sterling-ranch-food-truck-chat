const crypto = require("node:crypto");

const COOKIE_NAME = "community_question_admin";
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function sign(value, secret) {
  return crypto.createHmac("sha256", String(secret || "")).update(value).digest("base64url");
}

function createSessionToken(secret, now = Date.now()) {
  if (!secret) throw new Error("Question log session secret is not configured.");
  const expiresAt = now + SESSION_DURATION_MS;
  const payload = Buffer.from(JSON.stringify({ expiresAt })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

function verifySessionToken(token, secret, now = Date.now()) {
  if (!token || !secret) return false;
  const [payload, signature, extra] = String(token).split(".");
  if (!payload || !signature || extra || !safeEqual(signature, sign(payload, secret))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(parsed.expiresAt) > now && Number(parsed.expiresAt) <= now + SESSION_DURATION_MS;
  } catch {
    return false;
  }
}

function parseCookies(header = "") {
  return Object.fromEntries(
    String(header)
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator < 0) return [part, ""];
        return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      })
  );
}

function sessionCookie(token, options = {}) {
  const values = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.floor(SESSION_DURATION_MS / 1000)}`,
  ];
  if (options.secure !== false) values.push("Secure");
  return values.join("; ");
}

function expiredSessionCookie(options = {}) {
  const values = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
  ];
  if (options.secure !== false) values.push("Secure");
  return values.join("; ");
}

function isAuthorizedRequest(req, secret, now = Date.now()) {
  const cookies = parseCookies(req?.headers?.cookie || "");
  return verifySessionToken(cookies[COOKIE_NAME], secret, now);
}

function createLoginLimiter(options = {}) {
  const buckets = new Map();
  const maxAttempts = options.maxAttempts || LOGIN_MAX_ATTEMPTS;
  const windowMs = options.windowMs || LOGIN_WINDOW_MS;
  return {
    check(key, now = Date.now()) {
      const current = buckets.get(key);
      const bucket = current && now - current.startedAt < windowMs
        ? current
        : { startedAt: now, failures: 0 };
      buckets.set(key, bucket);
      if (bucket.failures < maxAttempts) return { allowed: true, retryAfterSeconds: 0 };
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.startedAt + windowMs - now) / 1000)),
      };
    },
    fail(key, now = Date.now()) {
      const current = buckets.get(key);
      const bucket = current && now - current.startedAt < windowMs
        ? current
        : { startedAt: now, failures: 0 };
      bucket.failures += 1;
      buckets.set(key, bucket);
      return bucket.failures;
    },
    clear(key) {
      buckets.delete(key);
    },
  };
}

module.exports = {
  COOKIE_NAME,
  SESSION_DURATION_MS,
  createLoginLimiter,
  createSessionToken,
  expiredSessionCookie,
  isAuthorizedRequest,
  parseCookies,
  safeEqual,
  sessionCookie,
  verifySessionToken,
};
