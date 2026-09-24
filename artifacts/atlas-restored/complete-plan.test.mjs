import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {globalSearch} from './journeys.mjs';
import {connectionData,connectionRouteOverlay,connectionScene} from './connections.js';
import {overviewPoint} from './walk-overview.js';
import {planningLayoutIssues} from './eval/check.mjs';
test('a broad search preserves walking guides after more than twelve matching places',()=>{
 const places=Array.from({length:20},(_,i)=>({id:'p'+i,name:'Trail place '+i}));
 const routes=Array.from({length:8},(_,i)=>({id:'r'+i,name:'Walking guide '+i,description:'',area:'Ascent'}));
 const found=globalSearch(places,[],routes,'trail');
 assert.equal(found.filter(p=>p.resultKind==='route').length,8);
 assert.equal(found.length,28);
});
test('connections discover nested businesses and routes associated with descendants',()=>{
 const places=[{id:'center',name:'Center'},{id:'social',name:'Social',parentId:'center'},{id:'coffee',name:'Coffee',parentId:'social'},{id:'future',name:'Addition',parentId:'center',future:true}];
 const route={id:'walk',name:'Nearby walk',miles:.3,type:'Loop',nearbyPlaceIds:['social'],paths:[[[10,20],[30,40]]]};
 const args={places,roots:[places[0]],trails:{routes:[route]},models:{},selected:'center',village:'all',focusKind:'place'};
 const result=connectionData(args);
 assert.equal(result.walks.length,1);assert.equal(result.future[0].id,'future');
 assert.match(connectionScene(args),/data-open="coffee"/);
 const overlay=connectionRouteOverlay(result.walks);
 assert.match(overlay,/polyline/);
 assert.ok(overlay.includes(overviewPoint([10,20]).join(',')));
 assert.match(overlay,/no connecting path implied/);
});
test('illustrated planning review cannot pass without source comparison and orientation context',()=>{
 const m={image:{visible:true,loaded:true,src:'http://test/assets/wider-ranch-landscape-v1.png',x:0,y:0,width:300,height:300*2088/1296},pins:Array.from({length:5},(_,i)=>({x:30,y:30+i*70,width:44,height:44})),namedCardsOnMap:0,directoryNames:5,horizontalOverflow:false};
 assert.ok(planningLayoutIssues(m).some(s=>s.includes('source comparison')));
 assert.deepEqual(planningLayoutIssues({...m,sourceComparisonAvailable:true,orientationVillages:4,futureAreaLabels:5}),[]);
});

