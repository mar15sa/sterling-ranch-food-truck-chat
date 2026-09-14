"use strict";
const fs=require('node:fs'),path=require('node:path');
const {searchRulesIndex}=require('../../lib/rules-assistant');
const {eligibleForQuestion}=require('./semantic-corpus');
const directory=path.resolve(process.argv[2]);
const {documents}=JSON.parse(fs.readFileSync(path.join(directory,'corpus.json'),'utf8'));
const cases=require('./diagnostic-cases.json').cases;
const rows=[];
for(const row of cases){
  const original=JSON.parse(fs.readFileSync(path.join(directory,row.id+'.json'),'utf8'));
  const results=searchRulesIndex({documents:documents.filter(d=>eligibleForQuestion(d,original.query))},original.query,10);
  rows.push({id:row.id,isTest:true,mismatches:results.flatMap((r,i)=>{
    const d=documents.find(x=>x.id===r.id);
    return d?.text===r.text?[]:[{rank:i+1,returnedId:r.id,title:r.title,exactTextIds:documents.filter(x=>x.text===r.text).map(x=>x.id)}];
  })});
}
const report={isTest:true,cases:rows.length,casesWithMismatch:rows.filter(r=>r.mismatches.length).length,
  mismatchedResults:rows.reduce((n,r)=>n+r.mismatches.length,0),rows};
const output=path.resolve(process.argv[3]);fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({...report,rows:undefined}));
