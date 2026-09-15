const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function display(fetch, extra = {}) {
  function element(tag) {
    return { tag, children: [], listeners: {}, dataset: {}, style: {}, textContent: '', value: '', append(...nodes) { this.children.push(...nodes); }, replaceChildren(...nodes) { this.children = nodes; }, setAttribute() {}, addEventListener(name, handler) { this.listeners[name] = handler; } };
  }
  const source = fs.readFileSync(path.join(__dirname, '../public/community-sources.js'), 'utf8');
  const elements = new Map();
  const context = vm.createContext({ URL, URLSearchParams, fetch, ...extra, document: { createElement: element, querySelector: selector => {
    if (!elements.has(selector)) elements.set(selector, element('div'));
    return elements.get(selector);
  } } });
  // Evaluate the actual rendering functions without starting network/login listeners.
  vm.runInContext(source.slice(0, source.indexOf('$("#loginForm").addEventListener')), context);
  return context;
}
function flatten(node) { return [node, ...node.children.flatMap(flatten)]; }

test('review displays conflict values, individual official links, and literal supporting evidence', () => {
  const context = display();
  context.item = { status: 'approved', topic: 'Great Hall deposit', currentValue: '$100', proposedValue: '$250',
    supportingText: 'A <deposit> of $250 is required.', relatedConflicts: [
      { value: '$100', sourceTitle: 'Indoor Facilities', sourceUrl: 'https://example.gov/indoor' },
      { value: '$250', sourceTitle: 'Rent the Facility', sourceUrl: 'https://example.gov/rent' } ] };
  const nodes = flatten(vm.runInContext('reviewCard(item)', context));
  assert.ok(nodes.some(n => n.textContent === 'A <deposit> of $250 is required.'));
  assert.ok(nodes.some(n => n.tag === 'a' && n.href === 'https://example.gov/indoor'));
  assert.ok(nodes.some(n => n.tag === 'a' && n.href === 'https://example.gov/rent'));
  assert.ok(!nodes.some(n => String(n.textContent).includes('[object Object]')));
});

test('pending review choices submit the displayed item and note, then reload without claiming deployment', async () => {
  for (const [label, decision] of [['Approve proposed', 'approve-proposed'], ['Keep current', 'keep-current'], ['Mark superseded', 'mark-current-superseded'], ['Exclude page', 'exclude-page'], ['Ask CAB', 'escalate']]) {
    const requests = [];
    const context = display(async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: options?.method === 'POST' ? 201 : 200, json: async () => ({ items: [] }) };
    });
    context.item = { id: 'fixture/review-v1', status: 'pending', canDecide: true };
    const nodes = flatten(vm.runInContext('reviewCard(item)', context));
    nodes.find(node => node.tag === 'textarea').value = 'Fixture review explanation';
    await nodes.find(node => node.tag === 'button' && node.textContent === label).listeners.click();
    assert.equal(requests[0].url, '/api/community-sources/review/fixture%2Freview-v1/decision');
    assert.deepEqual(JSON.parse(requests[0].options.body), { decision, note: 'Fixture review explanation' });
    assert.equal(requests.length, 2);
    assert.ok(nodes.some(node => node.textContent === 'Decision saved for release review. This does not publish a change.'));
  }
});

test('an in-flight decision prevents duplicate or conflicting submissions and permits retry after failure', async () => {
  let resolveResponse;
  let requests = 0;
  const context = display(() => { requests++; return new Promise(resolve => { resolveResponse = resolve; }); });
  context.item = { id: 'fixture-v1', status: 'pending', canDecide: true };
  const nodes = flatten(vm.runInContext('reviewCard(item)', context));
  const buttons = nodes.filter(node => node.tag === 'button');
  const first = buttons[0].listeners.click();
  assert.ok(buttons.every(button => button.disabled));
  await buttons[1].listeners.click();
  assert.equal(requests, 1);
  resolveResponse({ ok: false, status: 503, json: async () => ({ error: 'Review storage unavailable.' }) });
  await first;
  assert.ok(buttons.every(button => !button.disabled));
  assert.ok(nodes.some(node => node.textContent === 'Review storage unavailable.'));
  assert.ok(!nodes.some(node => node.textContent.startsWith('Decision saved')));
  const retry = buttons[0].listeners.click();
  assert.equal(requests, 2);
  resolveResponse({ ok: false, status: 400, json: async () => ({ error: 'A reviewer explanation is required.' }) });
  await retry;
  assert.ok(buttons.every(button => !button.disabled));
  assert.ok(nodes.some(node => node.textContent === 'A reviewer explanation is required.'));
});

test('expired decision sessions return to sign-in and never claim the decision was saved', async () => {
  const context = display(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Sign in required.' }) }));
  context.item = { id: 'fixture-v1', status: 'pending', canDecide: true };
  const nodes = flatten(vm.runInContext('reviewCard(item)', context));
  await nodes.find(node => node.tag === 'button').listeners.click();
  assert.equal(vm.runInContext('loginPanel.hidden', context), false);
  assert.equal(vm.runInContext('dashboard.hidden', context), true);
  assert.ok(nodes.some(node => node.textContent === 'Your decision was not saved. Sign in and try again.'));
});

test('source evidence links reject executable or malformed destinations', () => {
  const context = display();
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'not a URL']) {
    context.badUrl = url;
    assert.equal(vm.runInContext('sourceLink(badUrl, "Evidence")', context), null);
  }
});

test('cold and stale inventories cannot appear empty or authorize decisions', () => {
  const context = display();
  for (const storage of [{ loaded: false, loading: true }, { loaded: true, stale: true }]) {
    context.render({ items: [], queue: { storage }, summary: { pending: 0 } });
    assert.equal(vm.runInContext('$("#pendingCount").textContent', context), 'Unknown');
    assert.match(vm.runInContext('$("#emptyState p").textContent', context), /does not confirm/);
  }
  for (const canDecide of [undefined, false]) {
    context.item = { status: 'pending', queueBucket: 'history', canDecide, duplicateCount: 3 };
    const nodes = flatten(vm.runInContext('reviewCard(item)', context));
    assert.ok(!nodes.some(node => node.tag === 'form'));
    assert.ok(nodes.some(node => String(node.textContent).includes('3 identical saved copies')));
  }
});

test('queue views carry their scope and a refresh request remains explicit', async () => {
  let requested;
  const context = display(async url => {
    requested = new URL(url, 'https://example.test');
    return { ok: true, json: async () => ({ items: [], queue: { current: 2, comparison: 3, history: 40, storage: { loaded: true } } }) };
  });
  vm.runInContext('$("#queueFilter").value = "history"', context);
  await context.loadReviews(1, true);
  assert.equal(requested.searchParams.get('queue'), 'history');
  assert.equal(requested.searchParams.get('refresh'), 'true');
  assert.match(vm.runInContext('$("#queueBuckets").textContent', context), /2 current changes · 3 need comparison/);
  assert.match(vm.runInContext('$("#queueBuckets").textContent', context), /40 history/);
});

test('connection, observation and sync success are independent and never invented', () => {
  const context = display();
  context.renderQueueConnection({ queue: { storage: { loaded: false }, observation: { initialized: false }, sync: { status: 'not-started' } } });
  assert.match(vm.runInContext('$("#reviewAvailability").textContent', context), /^Connection configured/);
  assert.match(vm.runInContext('$("#reviewObservation").textContent', context), /have not completed/);
  assert.match(vm.runInContext('$("#reviewSync").textContent', context), /has not run/);
  context.renderQueueConnection({ queue: { storage: { loaded: true, checkedAt: '2026-09-14T12:00:00Z' },
    sync: { status: 'failed', lastError: 'Storage unavailable', lastSuccessAt: '2026-09-14T11:00:00Z' } } });
  const status = vm.runInContext('$("#reviewSync").textContent', context);
  assert.match(status, /Latest sync failed: Storage unavailable/);
  assert.match(status, /Last successful sync/);
  assert.match(status, /does not approve or publish/);
});

test('automatic updates preserve category details and pause before erasing a draft note', async () => {
  let requests = 0;
  const context = display(async () => { requests++; return { ok: true, json: async () => ({ items: [] }) }; });
  context.document.querySelectorAll = () => [{ value: 'My unsaved review note' }];
  await context.loadReviews(1, false, true);
  assert.equal(requests, 0);
  assert.match(vm.runInContext('listError.textContent', context), /paused while you edit/);
  context.document.querySelectorAll = () => [];
  vm.runInContext('$("#categoryList").append({ open: true })', context);
  await context.loadReviews(1, false, true);
  assert.equal(vm.runInContext('$("#categoryList").children[0].open', context), true);
});

test('background loading polls without repeated forced refresh and stops on sign out', async () => {
  const scheduled = new Map();
  const requests = [];
  let sequence = 0;
  const context = display(async url => {
    requests.push(new URL(url, 'https://example.test'));
    return { ok: true, json: async () => ({ items: [], queue: { storage: { loaded: false, loading: true } } }) };
  }, { setTimeout: fn => { scheduled.set(++sequence, fn); return sequence; }, clearTimeout: id => scheduled.delete(id) });
  await context.loadReviews(1, true);
  assert.equal(scheduled.size, 1);
  const [id, next] = [...scheduled][0]; scheduled.delete(id);
  next();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 2);
  assert.equal(requests[1].searchParams.has('refresh'), false);
  context.showLogin('Signed out');
  assert.equal(scheduled.size, 0);
  assert.equal(vm.runInContext('dashboard.hidden', context), true);
});

test('category cards expose every primary source, disposition, next step, and official link', () => {
  const context = display();
  const { buildCommunitySourceReadiness } = require('../lib/community-source-readiness');
  context.category = buildCommunitySourceReadiness({}).categories.find(item => item.id === 'property-changes');
  const nodes = flatten(vm.runInContext('categoryCard(category)', context));
  assert.equal(nodes.filter(node => node.tag === 'li' && node.dataset.state).length, 54);
  assert.ok(nodes.some(node => String(node.textContent).includes('approved details')));
  assert.ok(nodes.some(node => node.textContent === 'Available to answers'));
  assert.ok(nodes.some(node => node.tag === 'a' && node.href.includes('/DocumentCenter/View/1964/')));
  assert.ok(nodes.some(node => node.textContent === 'Architectural & Community Standards'));
  assert.ok(nodes.some(node => node.tag === 'a' && node.href.includes('/198/Architectural-Community-Standards')));
  assert.ok(nodes.some(node => node.textContent === 'Approved claims'));
  assert.ok(!nodes.some(node => node.textContent === 'Needs review'));
});

test('approved review history does not claim the old comparison is current approval or deployment state', () => {
  const context = display();
  context.item = { status: 'approved', currentValue: 'Not currently approved', proposedValue: '$100', releaseFingerprint: 'earlier-release' };
  const nodes = flatten(vm.runInContext('reviewCard(item)', context));
  assert.ok(nodes.some(n => n.textContent === 'Before this review'));
  assert.ok(nodes.some(n => n.textContent === 'No approved value was recorded before this review.'));
  assert.ok(nodes.some(n => String(n.textContent).includes('does not confirm production deployment')));
  assert.ok(nodes.some(n => String(n.textContent).includes('Release at review creation: earlier-release')));
  assert.ok(!nodes.some(n => n.textContent === 'Not currently approved' || n.textContent === 'Current approved'));
});

test('rendering a large inventory page keeps full totals but only mounts 25 cards', () => {
  const { paginateReviews } = require('../lib/community-review-pagination');
  const context = display();
  const inventory = Array.from({ length: 1969 }, (_, i) => ({ id: String(i), status: 'pending', risk: i < 1185 ? 'high' : 'medium' }));
  context.render(paginateReviews(inventory, new URLSearchParams()));
  assert.equal(vm.runInContext('sourceList.children.length', context), 25);
  assert.equal(vm.runInContext('$("#pendingCount").textContent', context), '1969');
  assert.equal(vm.runInContext('$("#sensitiveCount").textContent', context), '1185');
  assert.equal(vm.runInContext('$("#previousPage").disabled', context), true);
  assert.equal(vm.runInContext('$("#nextPage").disabled', context), false);
  context.render(paginateReviews(inventory, new URLSearchParams('page=79')));
  assert.equal(vm.runInContext('sourceList.children.length', context), 19);
  assert.equal(vm.runInContext('$("#nextPage").disabled', context), true);
});

test('an unavailable source-change queue cannot appear to have zero pending changes', () => {
  const context = display();
  context.render({ items: [], reviewError: 'The private review queue is not configured.' });
  assert.equal(vm.runInContext('$("#pendingCount").textContent', context), 'Unknown');
  assert.equal(vm.runInContext('$("#emptyState h2").textContent', context), 'Source-change queue unavailable');
  assert.match(vm.runInContext('$("#emptyState p").textContent', context), /does not confirm/);
});

test('older filter responses and failures cannot replace the latest page or reopen a signed-out dashboard', async () => {
  const pending = [];
  const context = display(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
  const first = context.loadReviews(2);
  const second = context.loadReviews(1);
  pending[1].resolve({ ok: true, json: async () => ({ items: [{ id: 'new', topic: 'Latest result' }] }) });
  await second;
  pending[0].reject(new Error('Old request failed'));
  await first;
  assert.equal(vm.runInContext('items[0].id', context), 'new');
  const third = context.loadReviews();
  context.showLogin('Signed out');
  pending[2].resolve({ ok: true, json: async () => ({ items: [{ id: 'private' }] }) });
  await third;
  assert.equal(vm.runInContext('dashboard.hidden', context), true);
  assert.equal(vm.runInContext('sourceList.children.length', context), 0);
});

test('page requests preserve filters and recover when the last pending card leaves a page', async () => {
  let requested;
  const context = display(async url => {
    requested = new URL(url, 'https://example.test');
    return { ok: true, json: async () => ({ items: [{ id: 'remaining', status: 'pending' }], pagination: { page: 1, pageCount: 1, pageSize: 25, total: 1 } }) };
  });
  vm.runInContext('$("#riskFilter").value = "high"; $("#statusFilter").value = "pending"; $("#conflictFilter").checked = true;', context);
  await context.loadReviews(2);
  assert.equal(requested.searchParams.get('page'), '2');
  assert.equal(requested.searchParams.get('risk'), 'high');
  assert.equal(requested.searchParams.get('status'), 'pending');
  assert.equal(requested.searchParams.get('conflict'), 'true');
  assert.equal(vm.runInContext('currentPage', context), 1);
  assert.equal(vm.runInContext('$("#nextPage").disabled', context), true);
});
