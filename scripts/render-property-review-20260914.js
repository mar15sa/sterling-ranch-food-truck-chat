const fs=require('node:fs');
const {PDFParse}=require('pdf-parse');
const {fetchOfficialDocument}=require('../lib/community-ingest');
async function main(){
 const dir='artifacts/source-review-2026-09-14/property-images';fs.mkdirSync(dir,{recursive:true});
 for(const [id,pages] of [[1964,[1,2,3,4]],[1574,[1]],[620,[1,2]],[190,[1]],[2411,[3,5,8,12]]]){
  const parser=new PDFParse({data:await fetchOfficialDocument('https://sterlingranchcab.com/DocumentCenter/View/'+id)});
  const result=await parser.getScreenshot({partial:pages,desiredWidth:1100});
  for(let i=0;i<result.pages.length;i++){const file=`${dir}/${id}-${pages[i]}.png`;fs.writeFileSync(file,result.pages[i].data);console.log(file);}
  await parser.destroy();
 }
}
main().catch(e=>{console.error(e);process.exit(1)});
