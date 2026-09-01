const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createLoginLimiter,
  createSessionToken,
  expiredSessionCookie,
  isAuthorizedRequest,
  parseCookies,
  safeEqual,
  sessionCookie,
  verifySessionToken,
} = require("../lib/community-question-admin");

test("owner sessions are signed, expire after 12 hours, and reject tampering", () => {
  const now = Date.UTC(2026, 8, 1, 18);
  const token = createSessionToken("session-secret", now);
  assert.equal(verifySessionToken(token, "session-secret", now + 1000), true);
  assert.equal(verifySessionToken(`${token}x`, "session-secret", now + 1000), false);
  assert.equal(verifySessionToken(token, "wrong-secret", now + 1000), false);
  assert.equal(verifySessionToken(token, "session-secret", now + 12 * 60 * 60 * 1000), false);
});

test("owner cookie is secure and accepted from a request", () => {
  const now = Date.UTC(2026, 8, 1, 18);
  const token = createSessionToken("session-secret", now);
  const cookie = sessionCookie(token);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.equal(
    isAuthorizedRequest({ headers: { cookie } }, "session-secret", now + 1000),
    true
  );
  assert.match(expiredSessionCookie(), /Max-Age=0/);
});

test("cookie parsing and password comparison fail closed", () => {
  assert.deepEqual(parseCookies("first=one; second=two%20words"), {
    first: "one",
    second: "two words",
  });
  assert.equal(safeEqual("right", "right"), true);
  assert.equal(safeEqual("right", "wrong"), false);
  assert.equal(safeEqual("right", "longer-wrong"), false);
});

test("login limiter blocks repeated failures and clears after success", () => {
  const limiter = createLoginLimiter({ maxAttempts: 2, windowMs: 60_000 });
  assert.equal(limiter.check("owner", 1000).allowed, true);
  limiter.fail("owner", 1000);
  assert.equal(limiter.check("owner", 1001).allowed, true);
  limiter.fail("owner", 1002);
  assert.equal(limiter.check("owner", 1003).allowed, false);
  limiter.clear("owner");
  assert.equal(limiter.check("owner", 1004).allowed, true);
});
