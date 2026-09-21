(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('../atlas-core'):root.AtlasCore);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.NeighborhoodGuide=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  function build(places,trails){
    const byId=new Map(places.map(p=>[p.id,p]));
    const roots=places.filter(p=>!p.parentId&&!p.future);
    const future=C.directoryGroups(places,'future','').map(g=>({parent:g.place,projects:g.matches.filter(p=>p.future)}));
    const areas=['Providence','Ascent','Parkvale','Prospect'].map(name=>({name,roots:roots.filter(p=>p.village===name)}));
    const assigned=new Set(areas.flatMap(a=>a.roots.map(p=>p.id)));
    areas.push({name:'Around the Ranch',roots:roots.filter(p=>!assigned.has(p.id))});
    const walks=trails.routes.map(r=>{
      if(!r.nearbyPlaceIds.every(id=>byId.has(id)&&!byId.get(id).future))throw Error('Walking guide references need review.');
      return {...r,nearby:r.nearbyPlaceIds.map(id=>byId.get(id)),minutes:[Math.ceil(r.miles/3*60),Math.ceil(r.miles/2*60)]};
    });
    function descendants(id){
      const result=[],queue=[id],seen=new Set(queue);
      while(queue.length){const parent=queue.shift();for(const p of places.filter(p=>p.parentId===parent)){if(seen.has(p.id))continue;seen.add(p.id);result.push(p);queue.push(p.id);}}
      return result;
    }
    return {roots,areas,walks,future,mapped:roots.filter(p=>p.coordinates),descendants};
  }
  return {build};
});
