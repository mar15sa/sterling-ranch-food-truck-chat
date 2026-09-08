async function fetchSourceJson(url, { fetchImpl = fetch, headers = {}, timeoutMs = 15000, attempts = 3, delayMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Official-source request exceeded its time budget.');
    try {
      const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(remaining) });
      if (!response.ok) {
        const error = new Error(`Official source returned HTTP ${response.status}.`);
        error.retryable = [408,425,429].includes(response.status) || response.status >= 500;
        throw error;
      }
      try { return await response.json(); }
      catch { const error = new Error('Official source returned invalid JSON.'); error.retryable = false; throw error; }
    } catch (error) {
      if (error.retryable === false || attempt === attempts || Date.now() + delayMs * attempt >= deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }
}
module.exports = { fetchSourceJson };
