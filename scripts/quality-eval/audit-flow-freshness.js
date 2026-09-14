"use strict";
const fs=require('node:fs'),path=require('node:path');
const {hash}=require('./flow-evidence');
async function audit(directory){
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'))),index=require('../../data/community-index.json');
  const rules=await require('../../lib/rules-assistant').loadRulesIndex();
  if(hash([index.communityId,index,rules])!==manifest.sourceSnapshotHash)throw new Error('Repository snapshot no longer matches captured evidence');
  const records=new Map();
  for(const line of fs.readFileSync(path.join(directory,'calls.jsonl'),'utf8').trim().split('\n').filter(Boolean)){
    const call=JSON.parse(line);for(const message of call.request?.messages||[]){let payload;try{payload=JSON.parse(message.content);}catch{continue;}
      for(const evidence of payload.evidence||[]){const source=index.sources.find(s=>s.id===evidence.sourceId&&s.contentHash===evidence.version);if(!source)continue;
        const key=source.id+':'+source.contentHash,existing=records.get(key)||{sourceId:source.id,version:source.contentHash,sourceUrl:source.sourceUrl,
          lifecycle:source.lifecycle,checkedAt:source.checkedAt,staleAfter:source.staleAfter,expired:Boolean(source.staleAfter&&new Date(source.staleAfter)<new Date(manifest.startedAt)),cases:[]};
        if(!existing.cases.includes(call.caseId))existing.cases.push(call.caseId);records.set(key,existing);
      }
    }
  }
  const rows=[...records.values()],report={checkedAt:new Date().toISOString(),captureStartedAt:manifest.startedAt,sourceSnapshotHash:manifest.sourceSnapshotHash,
    exactSnapshotVerified:true,staticRecordsProvided:rows.length,expiredRecordsProvided:rows.filter(r=>r.expired).length,records:rows,
    implication:'Expired evidence was provided to models. This does not prove every resulting fact is false, but the run cannot establish current-source-safe quality.'};
  fs.writeFileSync(path.join(directory,'freshness-audit.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(require.main===module)audit(path.resolve(process.argv[2])).then(r=>console.log(JSON.stringify({records:r.staticRecordsProvided,expired:r.expiredRecordsProvided,exactSnapshotVerified:r.exactSnapshotVerified}))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={audit};
