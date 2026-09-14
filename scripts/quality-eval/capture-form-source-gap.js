"use strict";
// Read-only diagnosis of an authored design-review example. Does not approve sources or submit questions.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {linksFromHtml,documentWidgetLinks}=require('../../lib/community-ingest');
const {sourceReviewState}=require('../../lib/community-source-answerability');
async function main(){
  const out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});
  if(fs.existsSync(path.join(out,'report.json')))throw new Error('Use a new output directory');
  const index=require('../../data/community-index.json');
  const directory=index.sources.find(s=>s.id==='approved-drc-application-directory');
  const state=sourceReviewState(index);
  const local=index.sources.filter(s=>s===directory||/\/DocumentCenter\/View\/(1574|1964)(?:\/|$)/.test(s.sourceUrl||''));
  const report={isTest:true,checkedAt:new Date().toISOString(),scope:'Read-only public-directory check and repository approval-state diagnosis; not a live production approval audit.',
    indexSha256:crypto.createHash('sha256').update(JSON.stringify(index)).digest('hex'),directoryUrl:directory.sourceUrl,
    localSources:local.map(s=>({id:s.id,title:s.title,sourceUrl:s.sourceUrl,contentHash:s.contentHash,checkedAt:s.checkedAt,staleAfter:s.staleAfter,
      canUseSource:state.canUseSource(s),canUseProjection:state.canUseProjection(s),canUseActionProjection:state.canUseActionProjection(s),
      projectedClaims:state.entriesFor(s).map(e=>({factType:e.factType,approvalClaim:e.approvalClaim}))})),
    limitations:['Discovery does not approve a source, its action or the claims inside a form.','Search-engine cached PDF versions differ from repository titles; use fresh official identity before any approval proposal.']};
  try{
    const response=await fetch(directory.sourceUrl,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(20000)});
    report.httpStatus=response.status;report.finalUrl=response.url;
    if(!response.ok)throw new Error('Official directory unavailable');
    const html=await response.text();report.htmlSha256=crypto.createHash('sha256').update(html).digest('hex');
    report.observedLinks=linksFromHtml(html,response.url).filter(x=>/\/DocumentCenter\/View\/(1574|1964)(?:\/|$)/.test(x.url));
    report.widgetDiscoveries=documentWidgetLinks(html,response.url).filter(x=>/\/DocumentCenter\/View\/(1574|1964)(?:\/|$)/.test(x.url));
    fs.writeFileSync(path.join(out,'official-directory.html'),html,{flag:'wx'});report.status='captured';
  }catch(error){report.status='directory-fetch-failed';report.error=error.name;}
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
