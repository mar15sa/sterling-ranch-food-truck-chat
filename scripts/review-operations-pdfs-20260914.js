const fs=require('node:fs');const{fetchOfficialDocument}=require('../lib/community-ingest');
(async()=>{fs.mkdirSync('tmp/operations-review',{recursive:true});for(const id of [2352,2502,2419,710])fs.writeFileSync(`tmp/operations-review/${id}.pdf`,await fetchOfficialDocument(`https://sterlingranchcab.com/DocumentCenter/View/${id}`));})();
