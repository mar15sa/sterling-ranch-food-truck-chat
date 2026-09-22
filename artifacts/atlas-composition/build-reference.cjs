const fs=require('node:fs'),path=require('node:path');
const sharp=require('C:/Users/mar15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const geo=require('./geography-reference.json'),catalog=require('./catalog-reference.json').places;
const bounds={west:-105.0735,east:-105.026,south:39.477,north:39.5105};
const W=1400,H=1100,pad=75;
const xy=p=>[pad+(p[0]-bounds.west)/(bounds.east-bounds.west)*(W-2*pad),H-pad-(p[1]-bounds.south)/(bounds.north-bounds.south)*(H-2*pad)];
const inBounds=p=>p&&p[0]>=bounds.west&&p[0]<=bounds.east&&p[1]>=bounds.south&&p[1]<=bounds.north;
const d=p=>p.map((x,i)=>(i?'L':'M')+xy(x).map(n=>n.toFixed(1)).join(',')).join('');
const styles={building:['#d2bda7','none',0],park:['#b5c59e','none',0],pitch:['#86a994','#fff',1],pool:['#74b8c2','#fff',1],water:['#9fbec1','none',0],road:['none','#e5d7ba',6],trail:['none','#b28662',1.8],stream:['none','#7cb6ba',2]};
let svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'"><rect width="100%" height="100%" fill="#faf8ef"/><defs><clipPath id="map"><rect x="'+pad+'" y="'+pad+'" width="'+(W-2*pad)+'" height="'+(H-2*pad)+'"/></clipPath></defs><g clip-path="url(#map)">';
for(const kind of ['park','water','pitch','pool','road','trail','stream','building'])for(const f of geo.features.filter(x=>x.kind===kind)){const s=styles[kind],closed=['building','park','pitch','pool','water'].includes(kind);svg+='<path d="'+d(f.coordinates)+(closed?'Z':'')+'" fill="'+s[0]+'" stroke="'+s[1]+'" stroke-width="'+s[2]+'" stroke-linejoin="round"/>';}
svg+='</g>';
for(const [id,title] of [['sterling-center','01 STERLING CENTER'],['overlook','02 THE OVERLOOK'],['burns','03 BURNS / 8 COURTS'],['prospect-park','04 PROSPECT PARK']]){const p=catalog.find(x=>x.id===id),[x,y]=xy(p.coordinates);svg+='<circle cx="'+x+'" cy="'+y+'" r="12" fill="#983d2d" stroke="#fff" stroke-width="4"/><rect x="'+(x-105)+'" y="'+(y-47)+'" width="210" height="29" rx="4" fill="#fffdf6"/><text x="'+x+'" y="'+(y-27)+'" text-anchor="middle" font-family="Arial" font-size="14" fill="#382d28">'+title+'</text>';}
svg+='<text x="75" y="40" font-family="Arial" font-size="22" fill="#304a3c">STERLING RANCH · REAL GEOGRAPHY REFERENCE · NORTH UP</text><text x="75" y="1080" font-family="Arial" font-size="14" fill="#687562">Saved OSM geometry and catalog anchors. Background coverage is incomplete. No invented park boundaries.</text></svg>';
fs.writeFileSync(path.join(__dirname,'geography-reference.svg'),svg);
sharp(Buffer.from(svg)).png().toFile(path.join(__dirname,'assets/geography-reference.png')).then(()=>console.log('Reference generated.'));
