"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
async function main(){
  const out=path.resolve(process.argv[2]),capUsd=process.argv[3]?Number(process.argv[3]):5;
  const flags=process.argv.slice(7);if(flags.some(f=>!['--offline-review','--complete-catalog','--live-mixed','--september-paired'].includes(f)&&!f.startsWith('--semantic-cache=')&&!f.startsWith('--community-semantic-cache=')))throw new Error('Unknown comparison flag');
  const septemberPaired=flags.includes('--september-paired');
  const liveMixed=flags.includes('--live-mixed');
  const semanticFlags=flags.filter(f=>f.startsWith('--semantic-cache='));if(semanticFlags.length>1||semanticFlags.some(f=>!f.slice('--semantic-cache='.length)))throw new Error('Supply one semantic cache directory');
  const semanticDirectory=semanticFlags.length?path.resolve(semanticFlags[0].slice('--semantic-cache='.length)):null;
  const communityFlags=flags.filter(f=>f.startsWith('--community-semantic-cache='));if(communityFlags.length>1||communityFlags.some(f=>!f.slice('--community-semantic-cache='.length)))throw Error('Supply one community cache');
  const communitySemanticDirectory=communityFlags.length?path.resolve(communityFlags[0].slice('--community-semantic-cache='.length)):null;
  if(septemberPaired&&(!liveMixed||!semanticDirectory||!communitySemanticDirectory||flags.includes('--complete-catalog')))throw Error('September paired comparison requires both semantic caches and live mixed mode');
  const assessmentMode=flags.includes('--offline-review')?'offline-review':'inline',communityMode=flags.includes('--complete-catalog')?'complete-catalog':'keyword';
  if(liveMixed&&assessmentMode!=='offline-review')throw new Error('Mixed development comparison requires offline review');
  if(assessmentMode==='offline-review'&&capUsd>(liveMixed?5:3))throw new Error('Offline-review phase maximum exceeded');
  if(!Number.isFinite(capUsd)||capUsd<=0||capUsd>5)throw new Error('Invalid reservation cap');
  const baseline=require('../../data/community-index.json');
  const {validateRulesSnapshot}=require('./flow-snapshot');
  if(!process.argv[6])throw new Error('Supply the rules verification attestation before paid comparison');
  const rulesAttestation=JSON.parse(fs.readFileSync(path.resolve(process.argv[6]),'utf8'));
  const {index:communityIndex,attestation}=require('./flow-snapshot').loadSnapshot(process.argv[4],process.argv[5],baseline);
  if(!process.env.ANTHROPIC_API_KEY)throw new Error('Existing provider credential required');
  fs.mkdirSync(out,{recursive:true});const mp=path.join(out,'manifest.json');if(fs.existsSync(mp))throw new Error('Use a new output directory');
  Object.assign(process.env,{COMMUNITY_INTERPRETATION_MODE:'legacy',COMMUNITY_LLM_MODEL:'claude-haiku-4-5',RULES_LLM_MODEL:'claude-haiku-4-5',
    RULES_SEARCH_MODEL:'claude-haiku-4-5',RULES_SEARCH_MODE:'ai-hybrid',RULES_SEARCH_AI_RERANK:'false',RULES_LLM_MODE:'selective',RULES_AUTO_REFRESH:'false',COMMUNITY_AUTO_REFRESH:'false'});
  const {createObservedFetch}=require('./observe-fetch'),{summarize}=require('./usage');
  const calls=[];let active={};const observed=createObservedFetch(global.fetch,{calls,capUsd,captureRequests:true,onCall:entry=>{
    Object.assign(entry,active);fs.appendFileSync(path.join(out,'calls.jsonl'),JSON.stringify(entry)+'\n');}});global.fetch=observed;
  const {answerCommunityQuestion}=require('../../lib/community-assistant'),{answerRulesQuestion,loadRulesIndex}=require('../../lib/rules-assistant');
  const {resolveConversationQuestion}=require('../../lib/community-conversation'),{runCandidate}=require('./full-flow-candidate'),{makeRetriever,hash}=require('./flow-evidence');
  const profile=require('../../data/communities/sterling-ranch.json'),rulesIndex=await loadRulesIndex();
  validateRulesSnapshot(rulesIndex,rulesAttestation,profile.communityId);
  const now=new Date().toISOString(),today=new Intl.DateTimeFormat('en-CA',{timeZone:profile.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
  const corpus=require('./diagnostic-cases.json').cases;
  const ids=['trash-reference','lighting-process','application','shed','forms-multi','ambiguity','compound','lighting-followup'];
  const mixed=require('./mixed-flow-config'),live=liveMixed?mixed.liveOptions(profile,{fetchImpl:observed}):null;
  const cases=liveMixed?[...mixed.cases]:ids.map(id=>{const c=corpus.find(c=>c.id===id);return {...c,context:c.contextCaseId?[{question:corpus.find(p=>p.id===c.contextCaseId).question}]:[]};});
  if(septemberPaired){const extra=require('./community-semantic-cases.json').cases;for(const id of ['water-pay','report-cab','nanny-access','hall-booking','coffee-password','ambiguous-price']){const c=extra.find(c=>c.id===id);if(!c)throw Error('Missing declared case');cases.push({id,family:id,question:c.question,context:[]});}}
  const variants=septemberPaired?[{id:'current-local',current:true},{id:'compact-sonnet-evidence-contract',models:{interpret:'claude-sonnet-5',compose:'claude-sonnet-5',check:'claude-sonnet-5'}}]:liveMixed?mixed.variants:[{id:'current-local',current:true},{id:'haiku-compose',models:{interpret:'claude-haiku-4-5',compose:'claude-haiku-4-5',check:'claude-sonnet-5'}},
    {id:'sonnet-compose',models:{interpret:'claude-haiku-4-5',compose:'claude-sonnet-5',check:'claude-sonnet-5'}}];
  const retrievalSession=await require('./flow-retrieval-session').createRetrievalSession({profile,communityIndex,rulesIndex,communityId:profile.communityId,now:new Date(now).getTime(),communityMode,...(live?{liveRetrieve:live.liveRetrieve}:{})},{semanticDirectory,communitySemanticDirectory,reuseKeywordPreparation:septemberPaired});
  try {
  const retrieve=retrievalSession.retrieve;
  const manifest={status:'running',isTest:true,assessmentMode,communityMode,liveMixed,stagingNavigationEnabled:false,startedAt:now,today,codeRevision:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    retrieval:retrievalSession.metadata,septemberPaired,planningMode:septemberPaired?'compact':'expanded',evidenceContract:septemberPaired,sourceSnapshotHash:hash([profile.communityId,communityIndex,rulesIndex]),snapshotFiles:{community:'snapshots/community-index.json',rules:'snapshots/rules-index.json',profile:'snapshots/profile.json',attestation:'snapshots/attestation.json',rulesAttestation:'snapshots/rules-attestation.json'},profileHash:hash(profile),casesHash:hash(cases),cases,capUsd,variants,repetitions:2,runs:[],
    codeHashes:Object.fromEntries(['full-flow-candidate.js','flow-evidence.js','flow-retrieval-session.js','semantic-ranker.mjs','semantic-corpus.js','community-projection-corpus.js','understanding-candidate.js','compact-acceptance-candidate.js','flow-acceptance.js','compare-full-flow.js','flow-snapshot.js','observe-fetch.js','usage.js','mixed-flow-config.js','live-evidence.js','extra-live-evidence.js','live-request-plan.js'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,file))).digest('hex')])),
    limitations:['Local snapshot comparison, not deployed revision or exact production billing.',liveMixed?'Live sources are queried per trial; compare captured facts before attributing differences to writers.':'No live adapter execution in this document-flow pilot.',
      'Shared model initialization is recorded separately; per-question retrieval is included in full trial latency.',
      'Authored diagnostic cases, not unseen holdout or human quality calibration.','Unresolved results must count against usefulness; model acceptance is not independent quality evidence.',
      'Current-local includes earlier scoped-context, identity, clarification and calendar repairs; not an untouched historical baseline.','No background detailed grading, hosting or storage costs included.',
      'Offline-review outputs, when enabled, are unreviewed drafts with no verified completion claim. Answer presence is not quality.']};
  for(const file of ['compact-live-plan.js','need-evidence-contract.js','community-semantic-ranker.mjs','community-semantic-corpus.js','eligible-keyword-index.js'])if(fs.existsSync(path.join(__dirname,file)))manifest.codeHashes[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,file))).digest('hex');
  fs.mkdirSync(path.join(out,'snapshots'),{recursive:true});
  for(const [key,value] of Object.entries({community:communityIndex,rules:rulesIndex,profile,attestation,rulesAttestation}))fs.writeFileSync(path.join(out,manifest.snapshotFiles[key]),JSON.stringify(value)+'\n',{flag:'wx'});
  fs.mkdirSync(path.join(out,'code'),{recursive:true});
  for(const file of Object.keys(manifest.codeHashes))fs.copyFileSync(path.join(__dirname,file),path.join(out,'code',file));
  const save=()=>{manifest.costs=summarize(calls);manifest.reservedUpperEstimateUsd=observed.reservedUsd();fs.writeFileSync(mp,JSON.stringify(manifest,null,2)+'\n');};save();
  const jobs=[];for(let repetition=1;repetition<=2;repetition++)for(const row of cases)for(const variant of variants)jobs.push({row,variant,repetition,order:crypto.randomBytes(8).toString('hex')});jobs.sort((a,b)=>a.order.localeCompare(b.order));
  manifest.design=jobs.map(j=>({caseId:j.row.id,variant:j.variant.id,repetition:j.repetition}));save();
  for(const [i,{row,variant,repetition}] of jobs.entries()){
    try{require('./flow-snapshot').validateSnapshot(communityIndex,attestation,baseline);validateRulesSnapshot(rulesIndex,rulesAttestation,profile.communityId);}
    catch(error){manifest.status='stopped-invalid-snapshot';manifest.snapshotError=error.message;save();break;}
    active={caseId:row.id,variant:variant.id,repetition};const start=Date.now(),before=calls.length,id='flow-'+String(i+1).padStart(3,'0');let response=null,error=null;
    try{if(variant.current){const resolved=resolveConversationQuestion(row.question,row.context.map(c=>({...c,answer:'Evaluation transcript placeholder; never used as evidence.'})));
      response=await answerCommunityQuestion(resolved.resolvedQuestion,{index:communityIndex,communityId:profile.communityId,communityProfile:profile,answerRulesQuestion,now:new Date(now),...(live?.current||{})});
    }else response=await runCandidate(row,{communityId:profile.communityId,...(liveMixed?{profile}:{}),...(septemberPaired?{planningMode:'compact',evidenceContract:true}:{}),retrieve,models:variant.models,fetchImpl:observed,now:today,assessmentMode,maxRepairs:assessmentMode==='offline-review'?0:1});}
    catch(e){error=e.message;}
    const result={id,isTest:true,...active,question:row.question,context:row.context,response,error,durationMs:Date.now()-start,calls:calls.slice(before)};
    fs.writeFileSync(path.join(out,id+'.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    manifest.runs.push({id,...active,durationMs:result.durationMs,error,status:response?.status||response?.answerStatus,outcome:response?.completion?.outcome,costs:summarize(result.calls)});save();
    fs.appendFileSync(path.join(out,'blind-review.jsonl'),JSON.stringify({id,question:row.question,priorResidentQuestions:row.context.map(c=>c.question),answer:response?.answer||null,actions:response?.actions||[],sources:response?.sources||[],error:Boolean(error||response?.status==='unresolved-experiment')})+'\n');
    console.log(JSON.stringify({completed:i+1,total:jobs.length,variant:variant.id,caseId:row.id,status:response?.status||response?.answerStatus,error:error||response?.reason||null}));
    const unknownAttempts=calls.filter(c=>!c.usage).length;
    if(error||result.calls.some(c=>c.httpStatus>=400||(c.errorType&&!['AbortError','TimeoutError'].includes(c.errorType)))||unknownAttempts>=6||/reservation cap|Provider-|Incomplete-structured-output/.test(response?.errorType||'')){manifest.status='stopped-error-or-budget';break;}
  }
  if(manifest.status==='running')manifest.status=manifest.runs.length===jobs.length?'captured':'incomplete';
  manifest.finishedAt=new Date().toISOString();manifest.costsByVariant=Object.fromEntries(variants.map(v=>[v.id,summarize(calls.filter(c=>c.variant===v.id))]));save();
  } finally { await retrievalSession.dispose(); }
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
