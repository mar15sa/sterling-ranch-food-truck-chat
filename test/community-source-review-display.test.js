const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function display() {
  function element(tag) {
    return { tag, children: [], textContent: '', append(...nodes) { this.children.push(...nodes); }, setAttribute() {}, addEventListener() {} };
  }
  const source = fs.readFileSync(path.join(__dirname, '../public/community-sources.js'), 'utf8');
  const context = vm.createContext({ URL, URLSearchParams, document: { createElement: element, querySelector: () => element('div') } });
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
