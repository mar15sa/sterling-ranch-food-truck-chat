const fs=require('node:fs');
const {fetchOfficialDocument}=require('../lib/community-ingest');
const {PDFParse}=require('pdf-parse');
async function main(){
 fs.mkdirSync('tmp/pdfs/utilities-review',{recursive:true});
 for(const [id,pages] of [[770,[1,2]],[2398,[1,7,8,9,16,17,35,36,37]],[1412,[1]],[1413,[1]],[1414,[1]],[1870,[1]]]){
  const data=await fetchOfficialDocument(`https://sterlingranchcab.com/DocumentCenter/View/${id}`);
  const parser=new PDFParse({data});try{const result=await parser.getScreenshot({partial:pages,desiredWidth:1400});for(const page of result.pages){fs.writeFileSync(`tmp/pdfs/utilities-review/${id}-${page.pageNumber}.png`,page.data);console.log(id,page.pageNumber)}}finally{await parser.destroy()}
 }
}
main().catch(e=>{console.error(e);process.exit(1)});
