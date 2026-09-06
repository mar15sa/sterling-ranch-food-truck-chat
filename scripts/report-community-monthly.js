const fs=require('node:fs');
const {listReviewRecords,sourceReviewStatus}=require('../lib/community-source-review');
const {factLedgerStatus}=require('../lib/community-truth');
async function main(){
  if(!sourceReviewStatus().configured) throw new Error('Monthly review requires the private source-review connection.');
  const now=new Date(),since=new Date(now.getTime()-30*86400000).toISOString();
  const index=require('../data/community-index.json');
  const records=await listReviewRecords();
  const decisions=records.filter(r=>r.recordType==='decision');
  const decided=new Set(decisions.map(r=>`${r.reviewId}:${r.sourceVersion}`));
  const pending=records.filter(r=>r.recordType==='review-item'&&!decided.has(`${r.id}:${r.sourceVersion}`));
  const ages=pending.map(r=>Math.max(0,(now-Date.parse(r.createdAt))/86400000)).filter(Number.isFinite);
  const repository=process.env.GITHUB_REPOSITORY||'mar15sa/sterling-ranch-food-truck-chat';
  if(!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid repository');
  const response=await fetch(`https://api.github.com/repos/${repository}/actions/runs?created=%3E%3D${since.slice(0,10)}&per_page=100`,{
    headers:{Accept:'application/vnd.github+json',...(process.env.GH_TOKEN?{Authorization:`Bearer ${process.env.GH_TOKEN}`}:{})},signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw new Error(`Release history returned ${response.status}`);
  const history=await response.json();
  const runs=history.workflow_runs||[];
  for(let page=2;runs.length<history.total_count&&page<=10;page++){
    const more=await fetch(`https://api.github.com/repos/${repository}/actions/runs?created=%3E%3D${since.slice(0,10)}&per_page=100&page=${page}`,{headers:{Accept:'application/vnd.github+json',...(process.env.GH_TOKEN?{Authorization:`Bearer ${process.env.GH_TOKEN}`}:{})},signal:AbortSignal.timeout(15000)});
    if(!more.ok) throw new Error(`Release history page ${page} returned ${more.status}`);
    const batch=(await more.json()).workflow_runs||[];
    if(!batch.length) break;
    runs.push(...batch);
  }
  const read=file=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
  const audit=read('data/community-assistant-eval.json');
  const report={recordedAt:now.toISOString(),periodStart:since,periodEnd:now.toISOString(),
    accuracy:audit?{checkedAt:audit.generatedAt,questionCount:audit.questionCount,regressed:audit.regressed,unsupportedClaimCount:audit.unsupportedClaimCount}:null,
    coverage:index.inventory||null,facts:factLedgerStatus(index),
    reviewDelays:{pending:pending.length,olderThanSevenDays:ages.filter(days=>days>7).length,oldestDays:Math.max(0,...ages)},
    releaseOutcomes:{totalRuns:history.total_count,returned:runs.length,complete:history.total_count<=runs.length,
      byConclusion:runs.reduce((acc,r)=>{const key=r.conclusion||r.status;acc[key]=(acc[key]||0)+1;return acc;},{}),
      runs:runs.filter(r=>/source|trial|CI|routing/i.test(r.name||'')).map(r=>({name:r.name,conclusion:r.conclusion,status:r.status,url:r.html_url,revision:r.head_sha}))}};
  fs.writeFileSync('data/community-monthly-report.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({recordedAt:report.recordedAt,reviewDelays:report.reviewDelays,historyComplete:report.releaseOutcomes.complete}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
