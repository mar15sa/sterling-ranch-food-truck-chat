const METERS_PER_DEGREE = 111320;
const EPSILON = 1e-12;

export function isCoordinate(point) {
  return Array.isArray(point)
    && point.length >= 2
    && Number.isFinite(point[0])
    && Number.isFinite(point[1]);
}

function normalizedBounds(bounds) {
  if (Array.isArray(bounds) && bounds.length >= 4) {
    const [west, south, east, north] = bounds;
    return validBounds({ west, south, east, north });
  }
  return validBounds(bounds);
}

function validBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') return null;
  const { west, east, south, north } = bounds;
  if (![west, east, south, north].every(Number.isFinite) || west > east || south > north) return null;
  return { west, east, south, north };
}

function centerOf(bounds) {
  const box = normalizedBounds(bounds);
  if (!box) return null;
  return { box, lng: (box.west + box.east) / 2, lat: (box.south + box.north) / 2 };
}

export function contains(point, bounds) {
  const box = normalizedBounds(bounds);
  return Boolean(box && isCoordinate(point)
    && point[0] >= box.west && point[0] <= box.east
    && point[1] >= box.south && point[1] <= box.north);
}

// Local east/south meter coordinates keep the renderer's ground plane intuitive.
export function project(point, bounds) {
  const center = centerOf(bounds);
  if (!center || !isCoordinate(point)) return null;
  const longitudeMeters = METERS_PER_DEGREE * Math.cos(center.lat * Math.PI / 180);
  return {
    x: (point[0] - center.lng) * longitudeMeters,
    z: (center.lat - point[1]) * METERS_PER_DEGREE,
  };
}

export function unproject(point, bounds) {
  const center = centerOf(bounds);
  if (!center || !point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  const longitudeMeters = METERS_PER_DEGREE * Math.cos(center.lat * Math.PI / 180);
  if (Math.abs(longitudeMeters) < EPSILON) return null;
  return [
    center.lng + point.x / longitudeMeters,
    center.lat - point.z / METERS_PER_DEGREE,
  ];
}

function samePoint(a, b) {
  return Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON;
}

function intersection(a, b, axis, value) {
  const delta = b[axis] - a[axis];
  if (Math.abs(delta) < EPSILON) return [a[0], a[1]];
  const t = (value - a[axis]) / delta;
  return axis === 0
    ? [value, a[1] + (b[1] - a[1]) * t]
    : [a[0] + (b[0] - a[0]) * t, value];
}

function clipAgainst(points, axis, value, keep) {
  if (!points.length) return [];
  const output = [];
  let previous = points[points.length - 1];
  let previousInside = keep(previous);
  for (const current of points) {
    const currentInside = keep(current);
    if (currentInside !== previousInside) output.push(intersection(previous, current, axis, value));
    if (currentInside) output.push([current[0], current[1]]);
    previous = current;
    previousInside = currentInside;
  }
  return output;
}

export function clipPolygon(points, bounds) {
  const box = normalizedBounds(bounds);
  if (!box || !Array.isArray(points) || points.length < 3 || !points.every(isCoordinate)) return [];
  let result = points.map((point) => [point[0], point[1]]);
  result = clipAgainst(result, 0, box.west, (point) => point[0] >= box.west);
  result = clipAgainst(result, 0, box.east, (point) => point[0] <= box.east);
  result = clipAgainst(result, 1, box.south, (point) => point[1] >= box.south);
  result = clipAgainst(result, 1, box.north, (point) => point[1] <= box.north);
  if (result.length > 1 && samePoint(result[0], result[result.length - 1])) result.pop();
  return result;
}

function clippedSegment(a, b, box) {
  let start = 0;
  let end = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  for (const [p, q] of [
    [-dx, a[0] - box.west], [dx, box.east - a[0]],
    [-dy, a[1] - box.south], [dy, box.north - a[1]],
  ]) {
    if (Math.abs(p) < EPSILON) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > end) return null;
      start = Math.max(start, t);
    } else {
      if (t < start) return null;
      end = Math.min(end, t);
    }
  }
  if (end - start < EPSILON) return null;
  return [
    [a[0] + dx * start, a[1] + dy * start],
    [a[0] + dx * end, a[1] + dy * end],
  ];
}

// Each source edge stays separate: clipping must never draw a bridge across an outside detour.
export function clipLine(points, bounds) {
  const box = normalizedBounds(bounds);
  if (!box || !Array.isArray(points) || points.length < 2 || !points.every(isCoordinate)) return [];
  const segments = [];
  for (let index = 1; index < points.length; index += 1) {
    const segment = clippedSegment(points[index - 1], points[index], box);
    if (segment) segments.push(segment);
  }
  return segments;
}

export function pointInPolygon(point, polygon) {
  if (!isCoordinate(point) || !Array.isArray(polygon) || polygon.length < 3 || !polygon.every(isCoordinate)) return false;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[previous];
    const b = polygon[index];
    if (distanceToSegment(point, a, b) < EPSILON) return true;
    const crosses = (a[1] > point[1]) !== (b[1] > point[1]);
    if (crosses && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function distanceToSegment(point, a, b) {
  if (!isCoordinate(point) || !isCoordinate(a) || !isCoordinate(b)) return Infinity;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < EPSILON) return Math.hypot(point[0] - a[0], point[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared));
  return Math.hypot(point[0] - (a[0] + dx * t), point[1] - (a[1] + dy * t));
}
