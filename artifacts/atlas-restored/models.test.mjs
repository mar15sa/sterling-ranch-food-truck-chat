import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { mergeCatalog } from './catalog.mjs';
import { modelComparison, modelRail } from './model-ui.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataPath = (...segments) => path.join(root, 'data', ...segments);
const readJson = (name) => JSON.parse(readFileSync(dataPath(name), 'utf8'));
const legacyIds = new Set(['sterling-center', 'overlook', 'burns', 'prospect-park']);
const requiredReviewedIds = new Set([
  'horsebrush', 'pioneer', 'mccormick', 'pat-gallagher', 'providence-park', 'steve-bloom',
  'yard-27', 'high-top', 'trailrock', 'ascent-pavilion', 'zippity', 'peekaboo', 'willow-creek', 'primrose', 'prose',
]);
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

function imageDimensions(file) {
  const bytes = readFileSync(file);
  if (bytes.length < 24) return null;
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { type: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  for (let offset = 2; offset + 9 < bytes.length;) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    let marker = bytes[offset + 1];
    offset += 2;
    while (marker === 0xff && offset < bytes.length) marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return { type: 'jpeg', width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  return null;
}

function existingImage(file, expectedType) {
  assert.equal(existsSync(file), true, `missing image: ${path.relative(root, file)}`);
  assert.equal(statSync(file).size > 0, true, `empty image: ${path.relative(root, file)}`);
  const dimensions = imageDimensions(file);
  assert.ok(dimensions, `not a readable PNG or JPEG: ${path.relative(root, file)}`);
  assert.equal(dimensions.type, expectedType, `wrong image format: ${path.relative(root, file)}`);
  assert.ok(dimensions.width > 0 && dimensions.height > 0, `invalid image dimensions: ${path.relative(root, file)}`);
}

test('place-model registry covers current parent places with evidence-backed models or a pending reason', () => {
  const registryFile = dataPath('models.json');
  assert.equal(existsSync(registryFile), true, 'data/models.json is required');
  const registry = JSON.parse(readFileSync(registryFile, 'utf8'));
  assert.equal(registry.verifiedAt, '2026-09-22');
  assert.ok(Array.isArray(registry.models), 'models must be an array');
  assert.ok(Array.isArray(registry.pending), 'pending must be an array');

  const catalog = mergeCatalog(readJson('places.json'), readJson('directory.json'), readJson('visitor-notes.json'), readJson('area-visit.json'));
  const currentRoots = new Map(catalog.filter((place) => !place.future && !place.parentId).map((place) => [place.id, place]));
  assert.equal(currentRoots.size, 25, 'the saved Atlas currently has 25 current root places');
  const ids = [...registry.models, ...registry.pending].map((entry) => entry?.id);
  assert.equal(new Set(ids).size, ids.length, 'an id may occur once total, in either models or pending');
  assert.deepEqual(new Set(ids), new Set(currentRoots.keys()), 'models plus pending must cover exactly every current root place');

  for (const entry of registry.pending) {
    assert.ok(currentRoots.has(entry.id), `pending ${entry.id} is not a current root place`);
    assert.equal(typeof entry.reason, 'string');
    assert.ok(entry.reason.trim(), `pending ${entry.id} needs a concrete reason`);
    if (entry.sourcePage !== undefined) assert.match(entry.sourcePage, /^https:\/\//, `pending ${entry.id} sourcePage must be HTTPS`);
  }

  for (const model of registry.models) {
    const place = currentRoots.get(model.id);
    assert.ok(place, `model ${model.id} must be a current root, never a future place or child listing`);
    assert.equal(place.future, false);
    assert.equal(place.parentId, null);
    for (const field of ['id', 'asset', 'referenceUrl', 'sourcePage', 'sourceLabel', 'scope', 'caption', 'alt']) {
      assert.equal(typeof model[field], 'string', `model ${model.id} ${field} must be a string`);
      assert.ok(model[field].trim(), `model ${model.id} ${field} must not be blank`);
    }
    assert.match(model.asset, /^[^/\\]+\.png$/i, `model ${model.id} asset must be one PNG filename`);
    assert.match(model.referenceUrl, /^https:\/\//, `model ${model.id} referenceUrl must be HTTPS`);
    assert.match(model.sourcePage, /^https:\/\//, `model ${model.id} sourcePage must be HTTPS`);
    existingImage(path.join(root, 'assets', model.asset), 'png');

    if (legacyIds.has(model.id)) {
      if (model.referenceImage !== undefined) {
        assert.equal(typeof model.referenceImage, 'string', `legacy ${model.id} referenceImage must be a string when supplied`);
        existingImage(path.join(root, model.referenceImage), 'jpeg');
      }
    } else {
      assert.equal(model.referenceImage, `assets/references/${model.id}.jpg`, `new model ${model.id} must point to its exact local official-photo reference`);
      existingImage(path.join(root, model.referenceImage), 'jpeg');
    }
  }

  const newModelIds = new Set(registry.models.filter((model) => !legacyIds.has(model.id)).map((model) => model.id));
  assert.deepEqual(newModelIds, requiredReviewedIds, 'the fifteen reviewed models must remain models and cannot be silently moved to pending');

  const reviewFile = dataPath('model-review.json');
  assert.equal(existsSync(reviewFile), true, 'data/model-review.json is required for reference-backed models');
  const review = JSON.parse(readFileSync(reviewFile, 'utf8'));
  assert.equal(review.reviewedAt, '2026-09-22');
  assert.equal(typeof review.reviewer, 'string');
  assert.ok(review.reviewer.trim(), 'model review requires a named reviewer');
  assert.ok(Array.isArray(review.models), 'model review models must be an array');
  const reviewsById = new Map(review.models.map((entry) => [entry?.id, entry]));
  assert.equal(reviewsById.size, review.models.length, 'each model can have only one review record');
  assert.deepEqual(new Set(reviewsById.keys()), requiredReviewedIds, 'the review must cover exactly the fifteen required reference-backed models');
  const modelsById = new Map(registry.models.map((model) => [model.id, model]));
  for (const id of requiredReviewedIds) {
    const model = modelsById.get(id);
    const audit = reviewsById.get(id);
    assert.equal(audit.verdict, 'pass', `model ${id} must have a passing visual/source review`);
    assert.equal(typeof audit.observations, 'string');
    assert.ok(audit.observations.trim(), `model ${id} review needs observations`);
    assert.equal(typeof audit.limitations, 'string');
    assert.ok(audit.limitations.trim(), `model ${id} review needs limitations`);
    assert.equal(audit.modelSha256, sha256(path.join(root, 'assets', model.asset)), `model ${id} review must match the exact current illustration bytes`);
    assert.equal(audit.referenceSha256, sha256(path.join(root, model.referenceImage)), `model ${id} review must match the exact current official-photo bytes`);
  }
});

test('model UI excludes unknown and future entries, escapes supplied text, and hides legacy comparisons', () => {
  const places = [
    { id: 'current', name: '<img src=x onerror=alert(1)>', future: false },
    { id: 'future', name: 'Future place', future: true },
  ];
  const rail = modelRail([
    { id: 'current', asset: 'current\" onerror=alert(1).png' },
    { id: 'future', asset: 'future.png' },
    { id: 'unknown', asset: 'unknown.png' },
  ], places, 'current');
  assert.match(rail, /aria-pressed="true"/);
  assert.match(rail, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(rail, /current&quot; onerror=alert\(1\)\.png/);
  assert.doesNotMatch(rail, /Future place|unknown\.png/);
  assert.equal(modelComparison({ id: 'sterling-center' }), '', 'legacy models without an official photo must not show a comparison switch');
  const comparison = modelComparison({ referenceImage: 'assets/references/current.jpg', referenceUrl: 'https://example.test/?q=<bad>', sourceLabel: '<Official>', scope: '<scope>' });
  assert.match(comparison, /&lt;Official&gt;/);
  assert.match(comparison, /https:\/\/example\.test\/\?q=&lt;bad&gt;/);
  assert.match(comparison, /&lt;scope&gt;/);
});
