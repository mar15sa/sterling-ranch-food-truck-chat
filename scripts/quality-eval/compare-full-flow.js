"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
async function main(){
  const out=path.resolve(process.argv[2]),capUsd=process.argv[3]?Number(process.argv[3]):5;
  if(!Number.isFinite(capUsd)||capUsd<=0||capUsd>5)throw new Error('Invalid reservation cap');
  const baseline=require('../../data/community-index.json');
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
  const now=new Date().toISOString(),today=new Intl.DateTimeFormat('en-CA',{timeZone:profile.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
  const corpus=require('./diagnostic-cases.json').cases;
  const ids=['trash-reference','lighting-process','application','shed','forms-multi','ambiguity','compound','lighting-followup'];
  const cases=ids.map(id=>{const c=corpus.find(c=>c.id===id);return {...c,context:c.contextCaseId?[{question:corpus.find(p=>p.id===c.contextCaseId).question}]:[]};});
  const variants=[{id:'current-local',current:true},{id:'haiku-compose',models:{interpret:'claude-haiku-4-5',compose:'claude-haiku-4-5',check:'claude-sonnet-5'}},
    {id:'sonnet-compose',models:{interpret:'claude-haiku-4-5',compose:'claude-sonnet-5',check:'claude-sonnet-5'}}];
  const retrieve=makeRetriever({profile,communityIndex,rulesIndex,communityId:profile.communityId,now:new Date(now).getTime()});
  const manifest={status:'running',isTest:true,startedAt:now,today,codeRevision:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    sourceSnapshotHash:hash([profile.communityId,communityIndex,rulesIndex]),snapshotFiles:{community:'snapshots/community-index.json',rules:'snapshots/rules-index.json',profile:'snapshots/profile.json',attestation:'snapshots/attestation.json'},profileHash:hash(profile),casesHash:hash(cases),capUsd,variants,repetitions:2,runs:[],
    codeHashes:Object.fromEntries(['full-flow-candidate.js','flow-evidence.js','understanding-candidate.js','compact-acceptance-candidate.js','compare-full-flow.js','flow-snapshot.js'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,file))).digest('hex')])),
    limitations:['Document-based local snapshot comparison, not deployed revision or exact production billing.','No live adapter execution or semantic retrieval in this first full-document-flow pilot.',
      'Authored diagnostic cases, not unseen holdout or human quality calibration.','Unresolved results must count against usefulness; model acceptance is not independent quality evidence.',
      'Current-local includes earlier scoped-context and identity repairs; not an untouched historical baseline.','No background detailed grading, hosting or storage costs included.']};
  fs.mkdirSync(path.join(out,'snapshots'),{recursive:true});
  for(const [key,value] of Object.entries({community:communityIndex,rules:rulesIndex,profile,attestation}))fs.writeFileSync(path.join(out,manifest.snapshotFiles[key]),JSON.stringify(value)+'\n',{flag:'wx'});
  fs.mkdirSync(path.join(out,'code'),{recursive:true});
  for(const file of Object.keys(manifest.codeHashes))fs.copyFileSync(path.join(__dirname,file),path.join(out,'code',file));
  const save=()=>{manifest.costs=summarize(calls);manifest.reservedUpperEstimateUsd=observed.reservedUsd();fs.writeFileSync(mp,JSON.stringify(manifest,null,2)+'\n');};save();
  const jobs=[];for(let repetition=1;repetition<=2;repetition++)for(const row of cases)for(const variant of variants)jobs.push({row,variant,repetition,order:crypto.randomBytes(8).toString('hex')});jobs.sort((a,b)=>a.order.localeCompare(b.order));
  for(const [i,{row,variant,repetition}] of jobs.entries()){
    try{require('./flow-snapshot').validateSnapshot(communityIndex,attestation,baseline);}
    catch(error){manifest.status='stopped-invalid-snapshot';manifest.snapshotError=error.message;save();break;}
    active={caseId:row.id,variant:variant.id,repetition};const start=Date.now(),before=calls.length,id='flow-'+String(i+1).padStart(3,'0');let response=null,error=null;
    try{if(variant.current){const resolved=resolveConversationQuestion(row.question,row.context);
      response=await answerCommunityQuestion(resolved.resolvedQuestion,{index:communityIndex,communityId:profile.communityId,communityProfile:profile,answerRulesQuestion,now:new Date(now)});
    }else response=await runCandidate(row,{communityId:profile.communityId,retrieve,models:variant.models,fetchImpl:observed,now:today});}
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
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
