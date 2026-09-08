function createLiveMonitor({ getPoolStatus, getCommunityEvents, notify = () => {}, log = console.log }) {
  const state = {};
  const running = new Set();
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
    if (running.has(name)) return;
    running.add(name);
    const previous = state[name];
    try {
      const details = await jobs[name]();
      state[name] = { status: 'passed', completedAt: new Date().toISOString(), ...details };
    } catch (error) {
      state[name] = { status: 'failed', completedAt: new Date().toISOString(), error: error.message };
    } finally { running.delete(name); }
    log(JSON.stringify({ event: 'community_monitor_run', monitor: name, ...state[name] }));
    if ((!previous && state[name].status === 'failed') || (previous && previous.status !== state[name].status)) notify(name, state[name]);
    return state[name];
  }
  function start() {
    const timers = [];
    for (const [name, interval] of [['facility', 60000], ['events', 3600000]]) {
      run(name);
      const timer = setInterval(() => run(name), interval);
      timer.unref?.();
      timers.push(timer);
    }
    return () => timers.forEach(clearInterval);
  }
  return { start, run, status: () => ({ ...state }) };
}
module.exports = { createLiveMonitor };
