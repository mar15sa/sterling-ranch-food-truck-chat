const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fetchPublicPage } = require('../lib/community-onboarding');
const { pageText, linksFromHtml, contentHtml, fetchOfficialDocument, extractPdfBufferText } = require('../lib/community-ingest');
const audit = require('../data/community-full-url-audit.json');
const dir = path.join(__dirname, '../artifacts/source-review-2026-09-14');
async function main() {
 const rows = audit.records.filter(r => r.categoryIds.includes('property-changes') && ['review-required','unavailable-recheck','answer-evidence','safe-link'].includes(r.disposition));
 const results=[];
 for(let i=0;i<rows.length;i+=4) {
  await Promise.all(rows.slice(i,i+4).map(async r=>{
   const row={...r, checkedAt:new Date().toISOString()};
   try {
    if(r.kind==='document') {
      const b=await fetchOfficialDocument(r.sourceUrl);
      row.documentFingerprint=crypto.createHash('sha256').update(b).digest('hex');
      row.fullText=await extractPdfBufferText(b); row.links=[];
    } else { const p=await fetchPublicPage(new URL(r.sourceUrl)); row.finalUrl=p.finalUrl||r.sourceUrl; row.fullText=pageText(p.html); row.links=linksFromHtml(contentHtml(p.html),row.finalUrl); }
    row.contentHash=crypto.createHash('sha256').update(row.fullText).digest('hex'); row.hashScheme='page-text-v1';
   }catch(e){row.error=e.message;}
   results.push(row); console.log(r.sourceUrl+' '+(row.error||row.fullText.length));
  }));
 }
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'property-raw.json'),JSON.stringify(results,null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exit(1)});
