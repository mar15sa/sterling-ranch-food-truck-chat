(function(root,factory){
  const api=factory(typeof module==='object' && module.exports ? require('../atlas-core') : root.AtlasCore);
  if(typeof module==='object' && module.exports)module.exports=api;else root.OpenedLandmarks=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  function validate(data,places){
    const byId=new Map(places.map(p=>[p.id,p])),seen=new Set();
    for(const m of data.models){
      const p=byId.get(m.id);
      if(!p || p.parentId || p.future || seen.has(m.id) || !m.title || !m.alt || !m.basis || !/^\.\/assets\/[a-z-]+\.png$/.test(m.image) || !C.safeLink(m.source?.url))throw Error('Landmark model needs review.');
      seen.add(m.id);
      if(new Set(m.features).size!==m.features.length || !m.features.every(id=>byId.get(id)?.parentId===m.id && !byId.get(id).future))throw Error('Landmark amenities need review.');
      for(const [id,point] of Object.entries(m.focus||{}))if(!m.features.includes(id)||point.length!==3||!point.every(Number.isFinite)||point[0]<0||point[0]>100||point[1]<0||point[1]>100||point[2]<1||point[2]>1.3)throw Error('Landmark focus needs review.');
    }
    for(const [id,n] of Object.entries(data.notes||{})){
      const p=byId.get(id);
      if(!p || (!seen.has(id)&&!seen.has(p.parentId)) || !n.summary || !n.sources?.length || !Array.isArray(n.actions) || ![...n.sources,...n.actions].every(a=>a.label&&C.safeLink(a.url)))throw Error('Landmark visitor notes need review.');
    }
    return data;
  }
  return {validate};
});
