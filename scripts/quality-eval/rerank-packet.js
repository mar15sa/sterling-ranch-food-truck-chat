"use strict";
const {budgetPacketSources}=require('./flow-evidence');
function rerankOrder(candidates,needs,scores,{balanced=false}={}){
 if(!candidates.length||candidates.length>100||!needs.length||needs.length>12||scores.length!==needs.length||scores.some(row=>row.length!==candidates.length||row.some(x=>!Number.isFinite(x))))throw Error('Invalid bounded rerank scores');
 if(new Set(candidates.map(c=>c.id)).size!==candidates.length||new Set(needs.map(n=>n.id)).size!==needs.length)throw Error('Duplicate rerank identity');
 const maxima=candidates.map((_,i)=>Math.max(...scores.map(row=>row[i]))),order=candidates.map((_,i)=>i).sort((a,b)=>maxima[b]-maxima[a]||a-b),chosen=[];
 if(balanced)for(const row of scores){const first=candidates.map((_,i)=>i).sort((a,b)=>row[b]-row[a]||a-b)[0];if(!chosen.includes(first))chosen.push(first);}
 return [...chosen,...order.filter(i=>!chosen.includes(i))].map(i=>candidates[i]);
}
function packetSelection(candidates){
 const units=budgetPacketSources(candidates,{maxSources:12,maxChars:30000,project:s=>s.text});
 return {sources:units.filter(u=>u.text).map(u=>({...u.source,text:u.text})),omissions:units.filter(u=>!u.text).map(u=>({id:u.source.id,needIds:u.source.retrievedForNeedIds,reason:u.contextCoverage}))};
}
module.exports={rerankOrder,packetSelection};
