// Preload only for read-only monitoring; owner review and normal sync do not use it.
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const method = String(options.method || input.method || 'GET').toUpperCase();
  if (url.hostname === 'api.notion.com') {
    const query = method === 'POST' && /^\/v1\/data_sources\/[^/]+\/query$/.test(url.pathname);
    if (!['GET', 'HEAD'].includes(method) && !query) {
      throw new Error('Read-only source monitoring cannot change Notion records or schema.');
    }
  }
  return originalFetch(input, options);
};
