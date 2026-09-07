const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { communitySourceStatus } = require("../lib/community-source-manager");
const { createSessionToken, sessionCookie, isAuthorizedRequest } = require("../lib/community-question-admin");
const root = path.join(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const ui = fs.readFileSync(path.join(root, "public/community-questions.js"), "utf8");
const overdue = {
  id: "approved-private-record", sourceUrl: "https://example.org/official",
  contentHash: "a".repeat(64), checkedAt: "2026-01-01T00:00:00.000Z", staleAfter: "2026-01-02T00:00:00.000Z",
  text: "Private source text must not be returned", facts: ["not requested"],
};
const index = { communityId: "test", releaseFingerprint: "f".repeat(64), sources: [
  overdue,
  { ...overdue, id: "fresh", staleAfter: "2099-01-01T00:00:00.000Z" },
  { ...overdue, id: "pointer-connector-calendar" },
  { ...overdue, id: "event", sourceType: "events" },
  { ...overdue, id: "action", connectorType: "official-action" },
] };
const fields = ["id", "sourceUrl", "contentHash", "checkedAt", "staleAfter"];
function functionSource(text, name) {
  const start = text.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, name);
  const end = text.indexOf("\n}", start);
  assert.ok(end > start, name);
  return text.slice(start, end + 2);
}

test("private stale records match the aggregate and expose only the five approved fields without mutations", () => {
  const before = JSON.stringify(index);
  const publicStatus = communitySourceStatus(index);
  const privateStatus = communitySourceStatus(index, Date.now(), { includeStaleSources: true });
  assert.equal(publicStatus.staleSourceCount, 1);
  assert.equal(Object.hasOwn(publicStatus, "staleSources"), false);
  assert.deepEqual(privateStatus.staleSources, [Object.fromEntries(fields.map(key => [key, overdue[key]]))]);
  assert.equal(JSON.stringify(index), before);
  assert.deepEqual(communitySourceStatus({ ...index, sources: [] }, Date.now(), { includeStaleSources: true }).staleSources, []);
});

test("actual owner handler rejects missing/tampered sessions; public health never includes private records", async () => {
  // Run the actual handlers with local data and a test-only signing secret. No server, network, or AI calls.
  let statusReads = 0;
  const context = vm.createContext({
    Date, process: { env: {}, uptime: () => 1 },
    require: () => ({ configurationFingerprint: () => "test-config" }),
    questionAdminConfig: () => ({ sessionSecret: "local-test-only" }), isAuthorizedRequest,
    sendJson: (res, status, body) => Object.assign(res, { status, body }),
    getRulesIndexStatus: async () => ({ exists: true, inlineTopicCount: 117 }),
    rulesRefreshPromise: null, poolStatusCache: null,
    getOpeningsSourceStatus: () => ({}), operationsSnapshot: () => ({}),
    getRulesSearchMetrics: () => ({}), getRulesLlmMetrics: () => ({}),
    getCommunitySearchMetrics: () => ({}), getCommunityLlmMetrics: () => ({}), communityAnswerMetrics: () => ({}),
    communitySourceStatus: (_, now, options) => { statusReads++; return communitySourceStatus(index, now, options); },
  });
  vm.runInContext(["requireQuestionAdmin", "handleCommunitySourceHealth", "handleHealth"].map(name => functionSource(server, name)).join("\n"), context);
  for (const cookie of ["", sessionCookie(`${createSessionToken("local-test-only")}tampered`)]) {
    const res = {};
    await context.handleCommunitySourceHealth({ method: "GET", headers: { cookie } }, res);
    assert.equal(res.status, 401);
    assert.equal(JSON.stringify(res).includes(overdue.id), false);
  }
  assert.equal(statusReads, 0, "Unauthorized requests cannot read the source records");
  const owner = {};
  await context.handleCommunitySourceHealth({ method: "GET", headers: { cookie: sessionCookie(createSessionToken("local-test-only")) } }, owner);
  assert.equal(owner.status, 200);
  assert.equal(owner.body.community.staleSources[0].contentHash, overdue.contentHash);
  const publicResult = {};
  await context.handleHealth({ method: "GET", headers: {} }, publicResult);
  assert.equal(publicResult.status, 200);
  assert.equal(publicResult.body.communitySources.staleSourceCount, 1);
  for (const value of [overdue.id, overdue.sourceUrl, overdue.contentHash, overdue.checkedAt, overdue.staleAfter]) {
    assert.equal(JSON.stringify(publicResult.body).includes(value), false);
  }
});

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.textContent = ""; }
  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
}
test("owner renders exact diagnostic values as text, replaces old records, and distinguishes empty from unavailable", () => {
  const list = new Element("div");
  const context = vm.createContext({ staleSourceList: list, document: { createElement: tag => new Element(tag) } });
  vm.runInContext(functionSource(ui, "renderStaleSources"), context);
  const source = { ...overdue, sourceUrl: '<img src=x onerror="alert(1)">' };
  context.renderStaleSources([source]);
  assert.equal(list.children.length, 1);
  assert.deepEqual(list.children[0].children.map(row => row.children[1].textContent), fields.map(key => source[key]));
  assert.ok(list.children[0].children.every(row => row.children[1].tag === "dd"));
  context.renderStaleSources([]);
  assert.equal(list.children.length, 1);
  assert.equal(list.children[0].textContent, "No approved sources are overdue.");
  context.renderStaleSources(undefined);
  assert.equal(list.children[0].textContent, "Record details are not available.");
});

test("owner UI clears record details when source-health authentication expires", async () => {
  const list = new Element("div");
  list.append(new Element("dl"));
  const context = vm.createContext({ staleSourceList: list, fetch: async () => ({ status: 401, json: async () => ({}) }) });
  vm.runInContext(functionSource(ui, "loadSourceHealth"), context);
  await context.loadSourceHealth();
  assert.equal(list.children.length, 0);
});
