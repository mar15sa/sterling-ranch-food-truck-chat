function createLiveMonitor({ getPoolStatus, getCommunityEvents, notify = () => {}, log = console.log,
  now = Date.now, timeoutMs = 20000 }) {
  const state = {};
  const running = new Set();
  const intervals = { facility: 60000, events: 3600000 };
  const maxAges = { facility: 5 * 60000, events: 2 * 3600000 };
  let scheduled = false, stopped = false, timers = [];
  const jobs = {
    facility: async () => {
      const result = await getPoolStatus();
      if (result.stale || result.error) throw new Error('The official facility status could not be refreshed.');
      return { sourceUrl: result.sourceUrl, checkedAt: result.checkedAt };
    },
    events: async () => {
      const result = await getCommunityEvents({ dateRange: { label: 'this week' }, filters: {} });
      if (!result.diagnostics?.parserHealthy) throw new Error('The official calendar could not be verified.');
      return { sourceUrl: result.sourceUrl, checkedAt: result.checkedAt, eventCount: result.events.length };
    },
  };
  async function run(name) {
    if (!jobs[name]) throw new Error('Unknown live monitor.');
    if (running.has(name)) return;
    running.add(name);
    const previous = state[name];
    let timer;
    try {
      const details = await Promise.race([
        Promise.resolve().then(jobs[name]),
        new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('Live monitor request timed out.')), timeoutMs); }),
      ]);
      state[name] = { status: 'passed', completedAt: new Date(now()).toISOString(), ...details };
    } catch (error) {
      state[name] = { status: 'failed', completedAt: new Date(now()).toISOString(), error: error.message };
    } finally { clearTimeout(timer); running.delete(name); }
    log(JSON.stringify({ event: 'community_monitor_run', monitor: name, ...state[name] }));
    if ((!previous && state[name].status === 'failed') || (previous && previous.status !== state[name].status)) {
      try { await notify(name, state[name]); } catch { log(JSON.stringify({ event: 'community_monitor_notification_failed', monitor: name })); }
    }
    return state[name];
  }
  function start() {
    if (scheduled) return stop;
    scheduled = true; stopped = false;
    for (const [name, interval] of Object.entries(intervals)) {
      run(name);
      const timer = setInterval(() => run(name), interval);
      timer.unref?.();
      timers.push(timer);
    }
    return stop;
  }
  function stop() { timers.forEach(clearInterval); timers = []; scheduled = false; stopped = true; }
  function status() {
    return Object.fromEntries(Object.keys(jobs).map(name => {
      const item = state[name];
      const stale = !item || now() - Date.parse(item.completedAt) > maxAges[name];
      return [name, { ...item, status: stopped ? 'stopped' : stale ? (item ? 'stale' : 'not-run') : item.status,
        stale, scheduled, running: running.has(name), maxAgeMs: maxAges[name] }];
    }));
  }
  return { start, run, status };
}
module.exports = { createLiveMonitor };
