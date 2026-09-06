const fs = require('node:fs');
const { createLiveMonitor } = require('../lib/community-live-monitor');
const { getCommunityEvents } = require('../lib/community-events');
const base = process.env.RULES_LIVE_BASE_URL || 'https://sterlingranchsociety.com';
const monitor = createLiveMonitor({ getCommunityEvents, getPoolStatus: async () => {
  const response = await fetch(`${base}/api/pool/status`, {signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`Facility endpoint returned ${response.status}`);
  return response.json();
} });
(async () => {
  await Promise.all([monitor.run('facility'),monitor.run('events')]);
  const report={checkedAt:new Date().toISOString(),baseUrl:base,checks:monitor.status()};
  fs.writeFileSync('data/community-live-monitor-report.json',JSON.stringify(report,null,2)+'\n');
  if(Object.values(report.checks).some(check=>check.status!=='passed')) process.exitCode=1;
})().catch(error=>{console.error(error.message);process.exitCode=1;});
