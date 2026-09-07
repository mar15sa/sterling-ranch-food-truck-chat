const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function display(fetch) {
  function element(tag) {
    return { tag, children: [], listeners: {}, textContent: '', value: '', append(...nodes) { this.children.push(...nodes); }, replaceChildren(...nodes) { this.children = nodes; }, setAttribute() {}, addEventListener(name, handler) { this.listeners[name] = handler; } };
  }
  const source = fs.readFileSync(path.join(__dirname, '../public/community-sources.js'), 'utf8');
  const elements = new Map();
  const context = vm.createContext({ URL, URLSearchParams, fetch, document: { createElement: element, querySelector: selector => {
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
    context.item = { id: 'fixture/review-v1', status: 'pending' };
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
  context.item = { id: 'fixture-v1', status: 'pending' };
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
  context.item = { id: 'fixture-v1', status: 'pending' };
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
