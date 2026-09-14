const fs = require('node:fs');
const { pageText, contentHtml, linksFromHtml, extractPdfText } = require('../lib/community-ingest');
const { sourceHash } = require('../lib/community-approved-revalidation');
const audit = require('../data/community-full-url-audit.json');
async function main() {
 const assigned = audit.records.filter(r=>r.categoryIds.includes('utilities-support')&&!r.categoryIds.includes('property-changes')&&['review-required','unavailable-recheck'].includes(r.disposition));
 const records=[];
 for(const r of assigned) {
  const checkedAt=new Date().toISOString();
  try {
   let fullText, links=[], finalUrl=r.sourceUrl, documentFingerprint='';
   if(r.kind==='document') fullText=await extractPdfText(r.sourceUrl,{onDocumentFingerprint:v=>documentFingerprint=v});
   else {const response=await fetch(r.sourceUrl,{signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error(`HTTP ${response.status}`);finalUrl=response.url; const html=await response.text();fullText=pageText(html);links=linksFromHtml(contentHtml(html),finalUrl);}
   records.push({...r,checkedAt,finalUrl,fullText,links,contentHash:sourceHash(fullText),hashScheme:'page-text-v1',documentFingerprint});
   console.log(r.sourceUrl, fullText.length);
  } catch(error) {records.push({...r,checkedAt,error:error.message});console.log(r.sourceUrl,error.message);}
 }
 fs.mkdirSync('artifacts/source-review-2026-09-14',{recursive:true});
 fs.writeFileSync('artifacts/source-review-2026-09-14/utilities-observed.json',JSON.stringify(records,null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exit(1)});
