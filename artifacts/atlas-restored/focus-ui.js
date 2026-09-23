import {cameraFor,inVillage} from './focus.mjs';

export function createFocus({roots,point,onReset}){
  const plane=document.querySelector('#map-plane'),landscape=document.querySelector('#landscape');
  let target=null,manual=1;
  plane.insertAdjacentHTML('beforeend','<div class="focus-haze" aria-hidden="true"></div><div class="focus-ring" aria-hidden="true"></div>');
  landscape.insertAdjacentHTML('beforeend','<div class="focus-caption" hidden><button type="button" data-clear-focus>← Whole Ranch</button><span></span><small></small></div>');
  const caption=landscape.querySelector('.focus-caption');
  plane.addEventListener('transitionrun',e=>{if(e.propertyName==='transform')landscape.closest('.map-stage').classList.add('camera-moving');});
  for(const event of ['transitionend','transitioncancel'])plane.addEventListener(event,e=>{if(e.propertyName==='transform')landscape.closest('.map-stage').classList.remove('camera-moving');});
  function apply(){
    const points=target?.kind==='village'?roots.filter(p=>inVillage(p,target.name)).map(p=>point(p.id)):[point(target?.id)];
    let camera=target?cameraFor({points,kind:target.kind,mobile:innerWidth<=720}):null;
    if(camera&&manual!==1){camera={...camera,zoom:Math.max(1,Math.min(4,camera.zoom*manual))};camera.tx=Math.max(100-100*camera.zoom,Math.min(0,(innerWidth<=720?50:64)-camera.x*camera.zoom));camera.ty=Math.max(100-100*camera.zoom,Math.min(0,50-camera.y*camera.zoom));}
    const active=!!camera;landscape.classList.toggle('has-focus',active);landscape.dataset.focusKind=active?target.kind:'';
    const c=camera||{x:50,y:50,zoom:manual,tx:50-50*manual,ty:50-50*manual,radiusX:100,radiusY:100};
    for(const [name,value] of Object.entries({x:c.x+'%',y:c.y+'%',zoom:c.zoom,tx:c.tx+'%',ty:c.ty+'%',rx:c.radiusX+'%',ry:c.radiusY+'%'}))plane.style.setProperty('--camera-'+name,value);
    caption.hidden=!active;
    caption.querySelector('span').textContent=target?.name||'';
    caption.querySelector('small').textContent=target?.kind==='village'?'Explore the area':'A closer look';
    landscape.classList.toggle('zoomed',c.zoom>1);
    return active;
  }
  function clear(){target=null;manual=1;apply();}
  caption.querySelector('button').onclick=()=>{clear();onReset();};
  addEventListener('resize',apply);
  return {
    place(id,name){target={kind:'place',id,name};manual=1;if(!apply())target=null;},
    village(name){target=name==='all'?null:{kind:'village',name};manual=1;apply();},
    zoom(delta){manual=Math.max(.65,Math.min(3,manual+delta));if(!target)manual=Math.max(1,manual);apply();},
    clear,refresh:apply,state:()=>target,snapshot:()=>({target:target?{...target}:null,manual}),restore(s={}){target=s.target?{...s.target}:null;manual=Number.isFinite(s.manual)?Math.max(.65,Math.min(3,s.manual)):1;apply();}
  };
}
