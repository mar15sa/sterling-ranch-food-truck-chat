const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SECURITY_HEADERS,
  clientKeyForRateLimit,
  publicServerError,
} = require("../lib/http-security");

test("browser hardening headers cover transport and injected content", () => {
  assert.match(SECURITY_HEADERS["strict-transport-security"], /max-age=31536000/);
  assert.match(SECURITY_HEADERS["content-security-policy"], /default-src 'self'/);
  assert.match(SECURITY_HEADERS["content-security-policy"], /object-src 'none'/);
});

test("production errors do not disclose internal messages", () => {
  const production = publicServerError(new Error("private database detail"), "production");
  assert.equal(production.detail, undefined);
  assert.doesNotMatch(JSON.stringify(production), /private database detail/);
});

test("rate limiting uses the address added by the closest trusted proxy", () => {
  const key = clientKeyForRateLimit({
    headers: { "x-forwarded-for": "spoofed-client, railway-proxy" },
    socket: { remoteAddress: "socket-address" },
  });
  assert.equal(key, "railway-proxy");
});
