const path = require('node:path');

// The atlas is an owner-approved staging prototype, not an approved launch.
// Request hosts and query strings cannot enable it on another deployment.
function atlasPreviewEnabled(environment = process.env) {
  return String(environment.RAILWAY_ENVIRONMENT_NAME || '').toLowerCase() === 'staging';
}

function isAtlasPath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return false; }
  const normalized = path.posix.normalize(decoded.replace(/\\/g, '/')).toLowerCase();
  // Windows also resolves path segments with trailing spaces or dots.
  return /^\/atlas(?:[./ :]|$)/.test(normalized);
}

module.exports = { atlasPreviewEnabled, isAtlasPath };
