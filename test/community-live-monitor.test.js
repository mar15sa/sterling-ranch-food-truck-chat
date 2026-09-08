const test=require('node:test');
const assert=require('node:assert/strict');
const {createLiveMonitor}=require('../lib/community-live-monitor');
test('live monitoring records every run but alerts only on failure and recovery',async()=>{
  let stale=false;const alerts=[],logs=[];
  const monitor=createLiveMonitor({getPoolStatus:async()=>({stale,checkedAt:'today'}),getCommunityEvents:async()=>({diagnostics:{parserHealthy:true},events:[]}),notify:(...x)=>alerts.push(x),log:x=>logs.push(x)});
  await monitor.run('facility');await monitor.run('facility');
  stale=true;await monitor.run('facility');await monitor.run('facility');
  stale=false;await monitor.run('facility');
  assert.equal(logs.length,5);assert.equal(alerts.length,2);
  assert.equal(monitor.status().facility.status,'passed');
  assert.equal((await monitor.run('events')).status,'passed');
});
