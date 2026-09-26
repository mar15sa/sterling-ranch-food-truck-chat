const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.textContent = ''; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) { this.attributes[key] = value; }
  hasAttribute(key) { return Object.hasOwn(this.attributes, key); }
}
function descendants(element) {
  return [element, ...element.children.flatMap(child => typeof child === 'object' ? descendants(child) : [])];
}
async function render(events, { full = true, now = '2026-09-26T18:00:00Z', status = 'ready', fail = false } = {}) {
  const container = new Element('div');
  if (full) container.setAttribute('data-full-calendar', '');
  const next = new Element('a');
  const NativeDate = Date;
  class FixedDate extends NativeDate { constructor(...args) { super(...(args.length ? args : [now])); } }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/briefing.js'), 'utf8'), {
    Date: FixedDate, Intl, AbortSignal,
    document: {
      querySelector: selector => selector === '#briefing-events' ? container : selector === '#briefing-next-event' ? next : null,
      createElement: tag => new Element(tag),
    },
    fetch: async () => {
      if (fail) throw new Error('offline');
      return { ok: true, json: async () => ({ events, status, action: { url: 'https://official.example/calendar' } }) };
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  return { container, next, rows: descendants(container).filter(node => node.className === 'briefing-row') };
}
function event(title, date = '2026-09-26', time = '11:00') {
  return { title, date, time, location: 'Official venue', url: 'https://official.example/event/' + encodeURIComponent(title) };
}

test('a festival that started this morning remains visible at midday on both calendar and homepage', async () => {
  for (const full of [true, false]) {
    const result = await render([event('Oktoberfest')], { full });
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].children[1].children[0].textContent, 'Oktoberfest');
    assert.equal(descendants(result.container).some(node => node.tagName === 'details'), false);
    assert.equal(result.next.href, undefined);
    assert.equal(descendants(result.container).some(node => /No upcoming/.test(node.textContent)), false);
    assert.equal(result.container.attributes['aria-busy'], 'false');
  }
});

test('full calendar displays more than fourteen events while the homepage remains a three-item preview', async () => {
  const events = Array.from({ length: 18 }, (_, i) => event('Event ' + i, '2026-09-27'));
  assert.equal((await render(events)).rows.length, 18);
  assert.equal((await render(events, { full: false })).rows.length, 3);
});

test('visibility follows the community date across UTC midnight and expires at local midnight', async () => {
  const entries = [event('Today'), event('Tomorrow', '2026-09-27'), event('Yesterday', '2026-09-25')];
  const before = await render(entries, { now: '2026-09-27T05:59:00Z' });
  assert.equal(before.rows.length, 2);
  assert.equal(before.rows[0].href, event('Today').url);
  const after = await render(entries, { now: '2026-09-27T06:00:00Z' });
  assert.equal(after.rows.length, 1);
  assert.equal(after.rows[0].href, event('Tomorrow').url);
});

test('events without a listed time remain visible and partial or unavailable sources retain their notice', async () => {
  const result = await render([event('Time not listed', '2026-09-26', '')], { status: 'partial' });
  assert.equal(result.rows.length, 1);
  assert(descendants(result.container).some(node => /one day could not be checked/.test(node.textContent)));
  const unavailable = await render([], { fail: true });
  assert.equal(unavailable.rows.length, 0);
  assert(descendants(unavailable.container).some(node => /couldn’t load/.test(node.textContent)));
});

test('the next-event shortcut still selects a future start without hiding earlier calendar listings', async () => {
  const result = await render([event('Morning festival'), event('Evening concert', '2026-09-26', '18:00')], { full: false });
  assert.equal(result.rows.length, 2);
  assert.equal(result.next.href, event('Evening concert').url);
});
