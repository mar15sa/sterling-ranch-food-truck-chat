import * as THREE from './vendor/three.module.js';

const ROOT_IDS = new Set([
  'sterling-center','overlook','providence-park','burns','yard-27','zippity',
  'ascent-pavilion','prospect-park','willow-creek','broadstone','prose','john-adams',
  'high-top','horsebrush','mccormick','pat-gallagher','pioneer','primrose',
]);
const FUTURE_IDS = new Set(['burns-next','prospect-next','willow-repair']);
const STRONG_LABELS = new Set(['sterling-center','overlook','burns','prospect-park','providence-park','prose','willow-creek']);
const SHORT_NAMES = {
  'sterling-center':'Sterling Center','overlook':'The Overlook','providence-park':'The Lawn',
  burns:'Burns Park','yard-27':'Yard 27',zippity:'Zippity','ascent-pavilion':'Gathering Green',
  'prospect-park':'Prospect Park','willow-creek':'Willow Creek',broadstone:'Broadstone',
  prose:'Prose','john-adams':'John Adams','high-top':'High Top',horsebrush:'Horsebrush',
  mccormick:'McCormick','pat-gallagher':'Pat Gallagher',pioneer:'Pioneer',primrose:'Primrose',
  'burns-next':'Burns later phases','prospect-next':'Prospect later phases','willow-repair':'Bike repair station',
};
const COLORS = {
  background:0xf4eddc, slabTop:0xe8dcc2, slabSide:0xbba789, road:0xf8f2e5,
  roadMajor:0xfffbf1, building:0xd5c4a4, buildingSide:0xb39e7b, park:0x466f59,
  pitch:0x789074, water:0x55a9aa, trail:0xc58b42, stream:0x67aeb0,
  amenity:0x277c78, service:0x8f6546, future:0xc18345, ink:0x213c35,
};

function validPoint(p){ return Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]); }
function insidePoint(p,b){ return validPoint(p) && p[0]>=b.west && p[0]<=b.east && p[1]>=b.south && p[1]<=b.north; }

// Sutherland-Hodgman clipping keeps all supplied area geometry inside the declared viewport.
function clipPolygon(points,b){
  let out=points.filter(validPoint);
  const edges=[
    [p=>p[0]>=b.west,(a,c)=>[b.west,a[1]+(c[1]-a[1])*(b.west-a[0])/(c[0]-a[0])]],
    [p=>p[0]<=b.east,(a,c)=>[b.east,a[1]+(c[1]-a[1])*(b.east-a[0])/(c[0]-a[0])]],
    [p=>p[1]>=b.south,(a,c)=>[a[0]+(c[0]-a[0])*(b.south-a[1])/(c[1]-a[1]),b.south]],
    [p=>p[1]<=b.north,(a,c)=>[a[0]+(c[0]-a[0])*(b.north-a[1])/(c[1]-a[1]),b.north]],
  ];
  for(const [inside,intersect] of edges){
    const input=out;out=[];if(!input.length)break;
    let a=input[input.length-1];
    for(const c of input){
      if(inside(c)){if(!inside(a))out.push(intersect(a,c));out.push(c);}
      else if(inside(a))out.push(intersect(a,c));
      a=c;
    }
  }
  return out.filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));
}

// Liang-Barsky clipping treats roads/trails/streams as linework even when their endpoints close.
function clipSegment(a,c,b){
  if(!validPoint(a)||!validPoint(c))return null;
  const dx=c[0]-a[0],dy=c[1]-a[1],p=[-dx,dx,-dy,dy],q=[a[0]-b.west,b.east-a[0],a[1]-b.south,b.north-a[1]];
  let lo=0,hi=1;
  for(let i=0;i<4;i++){
    if(p[i]===0){if(q[i]<0)return null;continue;}
    const t=q[i]/p[i];
    if(p[i]<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
    if(lo>hi)return null;
  }
  return [[a[0]+lo*dx,a[1]+lo*dy],[a[0]+hi*dx,a[1]+hi*dy]];
}

function mergeGeometry(geometries){
  const positions=[],normals=[];
  for(const source of geometries){
    const g=source.index?source.toNonIndexed():source;
    positions.push(...g.getAttribute('position').array);
    const normal=g.getAttribute('normal');if(normal)normals.push(...normal.array);
    if(g!==source)g.dispose();source.dispose();
  }
  if(!positions.length)return null;
  const merged=new THREE.BufferGeometry();
  merged.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  if(normals.length===positions.length)merged.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  else merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

function rootFor(place,byId){
  let p=place, guard=0;
  while(p?.parentId&&byId.has(p.parentId)&&guard++<12)p=byId.get(p.parentId);
  return p||place;
}

export async function createNeighborhood({host,labelLayer,places,geo,onSelect,onStatus}){
  if(!host || !labelLayer)throw new Error('The neighborhood view needs a host and label layer.');
  if(!Array.isArray(places) || !geo?.bounds || !Array.isArray(geo.features))throw new Error('The neighborhood data is unavailable.');
  const bounds=geo.bounds;
  if(!['west','east','south','north'].every(k=>Number.isFinite(bounds[k])))throw new Error('The neighborhood bounds are unavailable.');
  if(!window.WebGLRenderingContext)throw new Error('This browser cannot display the 3D neighborhood.');

  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setClearColor(COLORS.background,1);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-label','Interactive three-dimensional model of Sterling Ranch');
  renderer.domElement.style.cssText='display:block;width:100%;height:100%;touch-action:none;cursor:grab;';
  host.appendChild(renderer.domElement);

  const scene=new THREE.Scene();scene.background=new THREE.Color(COLORS.background);
  const camera=new THREE.OrthographicCamera(-70,70,46,-46,.1,500);
  const worldWidth=120;
  const latitudeScale=Math.cos(((bounds.south+bounds.north)/2)*Math.PI/180);
  const worldDepth=worldWidth*((bounds.north-bounds.south)/((bounds.east-bounds.west)*latitudeScale));
  const project=([lon,lat])=>new THREE.Vector3(
    ((lon-bounds.west)/(bounds.east-bounds.west)-.5)*worldWidth,
    0,
    (.5-(lat-bounds.south)/(bounds.north-bounds.south))*worldDepth
  );
  const target=new THREE.Vector3(0,0,0),homeTarget=target.clone();
  let yaw=-.68,zoomLevel=1,filter='all',exploded=false,explosionProgress=0,selectedId=null,destroyed=false,raf=0,cameraRaf=0,explodeRaf=0;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const resources=[], materials=[], markerRecords=[], labelRecords=[];
  const byId=new Map(places.map(p=>[p.id,p]));
  const roots=[];
  for(const id of ROOT_IDS){
    const p=byId.get(id);if(p&&insidePoint(p.coordinates,bounds))roots.push(p);
  }

  scene.add(new THREE.HemisphereLight(0xffffff,0x819078,1.65));
  const sun=new THREE.DirectionalLight(0xfff9ef,2.1);sun.position.set(-70,110,-45);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-90;sun.shadow.camera.right=90;sun.shadow.camera.top=90;sun.shadow.camera.bottom=-90;
  sun.shadow.camera.near=15;sun.shadow.camera.far=260;sun.shadow.bias=-.00015;scene.add(sun);

  const material=(params)=>{const m=new THREE.MeshStandardMaterial(params);materials.push(m);return m;};
  const slabMat=material({color:COLORS.slabTop,roughness:.9,metalness:0}),underside=material({color:COLORS.slabSide,roughness:1});
  const sw=worldWidth+6,sd=worldDepth+6,sr=3.2,slabShape=new THREE.Shape();
  slabShape.moveTo(-sw/2+sr,-sd/2);slabShape.lineTo(sw/2-sr,-sd/2);slabShape.quadraticCurveTo(sw/2,-sd/2,sw/2,-sd/2+sr);
  slabShape.lineTo(sw/2,sd/2-sr);slabShape.quadraticCurveTo(sw/2,sd/2,sw/2-sr,sd/2);slabShape.lineTo(-sw/2+sr,sd/2);
  slabShape.quadraticCurveTo(-sw/2,sd/2,-sw/2,sd/2-sr);slabShape.lineTo(-sw/2,-sd/2+sr);slabShape.quadraticCurveTo(-sw/2,-sd/2,-sw/2+sr,-sd/2);
  const slabGeometry=new THREE.ExtrudeGeometry(slabShape,{depth:2.7,bevelEnabled:true,bevelSegments:2,bevelSize:.7,bevelThickness:.45,curveSegments:4});
  slabGeometry.rotateX(Math.PI/2);slabGeometry.translate(0,.08,0);
  const slab=new THREE.Mesh(slabGeometry,[slabMat,underside]);resources.push(slab.geometry);slab.receiveShadow=true;slab.castShadow=true;scene.add(slab);

  function polygonGeometry(coords,height,baseY=0){
    const clipped=clipPolygon(coords,bounds);if(clipped.length<3)return null;
    const shape=new THREE.Shape();const first=project(clipped[0]);shape.moveTo(first.x,-first.z);
    for(let i=1;i<clipped.length;i++){const p=project(clipped[i]);shape.lineTo(p.x,-p.z);}
    const g=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:height>.35,bevelSegments:1,bevelSize:Math.min(.16,height*.18),bevelThickness:Math.min(.12,height*.14),curveSegments:1});
    // Shape Y is -world Z. Rotating -90° restores world Z and turns extrusion depth into height.
    g.rotateX(-Math.PI/2);g.translate(0,baseY,0);return g;
  }
  function addPolygons(kind,color,height,baseY,opts={}){
    const gs=[];for(const f of geo.features)if(f.kind===kind){const g=polygonGeometry(f.coordinates,height,baseY);if(g)gs.push(g);}
    const g=mergeGeometry(gs);if(!g)return null;
    const m=material({color,roughness:opts.roughness??.86,metalness:0,transparent:!!opts.transparent,opacity:opts.opacity??1});
    const mesh=new THREE.Mesh(g,m);mesh.castShadow=!!opts.cast;mesh.receiveShadow=true;resources.push(g);scene.add(mesh);return mesh;
  }
  const contextMeshes=[];
  const parks=addPolygons('park',COLORS.park,.42,.03,{roughness:.95});if(parks)contextMeshes.push(parks);
  const pitches=addPolygons('pitch',COLORS.pitch,.18,.47,{roughness:.9});if(pitches)contextMeshes.push(pitches);
  const water=addPolygons('water',COLORS.water,.14,.12,{roughness:.35});if(water)contextMeshes.push(water);
  const pools=addPolygons('pool',COLORS.water,.22,.5,{roughness:.24});if(pools)contextMeshes.push(pools);
  const buildings=addPolygons('building',COLORS.building,1.65,.12,{cast:true,roughness:.82});if(buildings)contextMeshes.push(buildings);

  function addRibbons(kind,color,width,y,majorOnly=null){
    const positions=[];
    for(const f of geo.features){
      if(f.kind!==kind || (majorOnly!==null&&!!f.major!==majorOnly))continue;
      const c=f.coordinates||[];
      for(let i=1;i<c.length;i++){
        const clipped=clipSegment(c[i-1],c[i],bounds);if(!clipped)continue;
        const a=project(clipped[0]),b=project(clipped[1]),dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.001)continue;
        const nx=-dz/len*width/2,nz=dx/len*width/2;
        positions.push(a.x+nx,y,a.z+nz,b.x+nx,y,b.z+nz,b.x-nx,y,b.z-nz,a.x+nx,y,a.z+nz,b.x-nx,y,b.z-nz,a.x-nx,y,a.z-nz);
      }
    }
    if(!positions.length)return null;
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();resources.push(g);
    const m=material({color,roughness:.92,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(g,m);mesh.receiveShadow=true;scene.add(mesh);contextMeshes.push(mesh);return mesh;
  }
  addRibbons('road',COLORS.road,.34,.08,false);addRibbons('road',COLORS.roadMajor,.72,.09,true);
  addRibbons('trail',COLORS.trail,.16,.54);addRibbons('stream',COLORS.stream,.20,.3);

  // Village names are orientation labels only; no boundary is implied.
  const villageGroup=new THREE.Group();scene.add(villageGroup);
  for(const item of geo.labels||[]){
    if(item.kind!=='village'||!insidePoint(item.coordinates,bounds))continue;
    const p=project(item.coordinates),ring=new THREE.Mesh(new THREE.RingGeometry(2.2,2.32,40),material({color:0x8fa18e,transparent:true,opacity:.42,side:THREE.DoubleSide,roughness:1}));
    resources.push(ring.geometry);ring.rotation.x=-Math.PI/2;ring.position.set(p.x,.57,p.z);villageGroup.add(ring);
  }

  function markerColor(p){return p.category==='parks'?COLORS.park:p.category==='services'?COLORS.service:COLORS.amenity;}
  function makeMarker(p,isFuture=false){
    const ground=project(p.coordinates),node=new THREE.Group();node.position.copy(ground);node.position.y=.62;
    const diskMat=material({color:isFuture?COLORS.future:markerColor(p),roughness:.54,emissive:COLORS.ink,emissiveIntensity:0});
    const disk=new THREE.Mesh(new THREE.CylinderGeometry(isFuture?1.35:1.05,isFuture?1.55:1.24,.55,24),diskMat);resources.push(disk.geometry);disk.position.y=.3;disk.castShadow=true;disk.receiveShadow=true;node.add(disk);
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(isFuture?1.12:.86,isFuture?1.12:.86,.08,24),material({color:isFuture?0xf7ddb7:0xf9f1de,roughness:.65,emissive:0xffffff,emissiveIntensity:0}));
    resources.push(cap.geometry);cap.position.y=.615;cap.castShadow=true;node.add(cap);
    if(isFuture){
      const ring=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({length:32},(_,i)=>{const a=i/32*Math.PI*2;return new THREE.Vector3(Math.cos(a)*1.9,.72,Math.sin(a)*1.9);})),new THREE.LineDashedMaterial({color:COLORS.future,dashSize:.45,gapSize:.28}));
      resources.push(ring.geometry);materials.push(ring.material);ring.computeLineDistances();node.add(ring);
    }
    const tetherGeom=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ground.x,.58,ground.z),new THREE.Vector3(ground.x,.58,ground.z)]);
    const tetherMat=new THREE.LineBasicMaterial({color:markerColor(p),transparent:true,opacity:.5});resources.push(tetherGeom);materials.push(tetherMat);
    const tether=new THREE.Line(tetherGeom,tetherMat);tether.visible=false;scene.add(tether);
    node.userData={id:p.id,ground,hit:disk,isFuture};scene.add(node);
    markerRecords.push({id:p.id,place:p,node,disk,cap,tether,isFuture,visible:true});return node;
  }
  for(const p of roots)makeMarker(p,false);
  for(const id of FUTURE_IDS){const p=byId.get(id);if(p&&insidePoint(p.coordinates,bounds))makeMarker(p,true);}

  function makeLabel(record){
    const button=document.createElement('button');button.type='button';button.className='ranch-label';button.dataset.place=record.id;
    button.setAttribute('aria-label',`Open ${record.place.name}`);const text=document.createElement('span');text.setAttribute('aria-hidden','true');text.textContent=SHORT_NAMES[record.id]||record.place.name;button.appendChild(text);
    if(record.isFuture){button.dataset.future='true';button.classList.add('is-future');}
    const click=(event)=>{event.stopPropagation();onSelect?.(record.id);};button.addEventListener('click',click);labelLayer.appendChild(button);
    const lr={record,button,click,compact:false};labelRecords.push(lr);return lr;
  }
  markerRecords.forEach(makeLabel);

  function categoryVisible(record){
    if(filter==='future')return record.isFuture;
    if(record.isFuture)return false;
    if(filter==='outside')return record.place.category==='parks';
    if(filter==='everyday')return record.place.category!=='parks';
    return true;
  }
  function updateCamera(){
    const distance=145, elevation=1.02;
    camera.position.set(target.x+Math.sin(yaw)*distance,target.y+Math.sin(elevation)*distance,target.z+Math.cos(yaw)*distance);
    camera.lookAt(target);camera.updateMatrixWorld(true);
    const aspect=Math.max(.2,(host.clientWidth||1)/(host.clientHeight||1)),corners=[];
    for(const x of [-sw/2-1,sw/2+1])for(const y of [-3.5,1])for(const z of [-sd/2-1,sd/2+1])corners.push(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
    const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y),fitHeight=Math.max(Math.max(...ys)-Math.min(...ys),(Math.max(...xs)-Math.min(...xs))/aspect)*1.08;
    camera.left=-fitHeight*aspect/2;camera.right=fitHeight*aspect/2;camera.top=fitHeight/2;camera.bottom=-fitHeight/2;
    camera.zoom=zoomLevel;camera.updateProjectionMatrix();
  }
  function requestRender(){if(destroyed||raf)return;raf=requestAnimationFrame(()=>{raf=0;render();});}
  function updateLabels(){
    const width=host.clientWidth,height=host.clientHeight;if(!width||!height)return;
    const candidates=[];
    for(const lr of labelRecords){
      const r=lr.record,b=lr.button;if(!r.visible){b.hidden=true;continue;}
      const p=r.node.position.clone();p.y+=2.1;p.project(camera);
      const x=(p.x*.5+.5)*width,y=(-p.y*.5+.5)*height;
      if(p.z>1||x<4||x>width-4||y<4||y>height-4){b.hidden=true;continue;}
      const selected=r.id===selectedId,priority=selected?100:r.isFuture?70:STRONG_LABELS.has(r.id)?60:r.place.category==='parks'?35:25;
      candidates.push({lr,x,y,priority,selected});
    }
    candidates.sort((a,b)=>b.priority-a.priority);
    const boxes=[];let named=0;
    for(const c of candidates){
      const {button}=c.lr;button.hidden=false;button.style.left=`${c.x}px`;button.style.top=`${c.y}px`;
      const overlaps=boxes.some(box=>Math.abs(box.x-c.x)<112&&Math.abs(box.y-c.y)<36);
      const showName=c.selected || (!overlaps && named<9 && (c.priority>=60 || named<7));
      button.classList.toggle('is-dot',!showName);button.classList.toggle('is-selected',c.selected);
      button.classList.toggle('is-covered',!showName&&boxes.some(box=>Math.abs(box.x-c.x)<70&&c.y>box.y-36&&c.y<box.y+10));
      button.setAttribute('aria-pressed',String(c.selected));
      if(showName){named++;boxes.push({x:c.x,y:c.y});}
    }
  }
  function render(){if(destroyed||!host.clientWidth||!host.clientHeight)return;updateCamera();renderer.render(scene,camera);updateLabels();}
  function resize(){
    const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
    renderer.setSize(w,h,false);requestRender();
  }
  function cancelCameraMotion(){if(cameraRaf){cancelAnimationFrame(cameraRaf);cameraRaf=0;}}
  function animateTo(nextTarget,nextZoom,duration=620){
    cancelCameraMotion();
    const startTarget=target.clone(),startZoom=zoomLevel,start=performance.now(),ms=reduced?0:duration;
    function tick(now){const raw=ms?Math.min(1,(now-start)/ms):1,t=1-Math.pow(1-raw,3);target.lerpVectors(startTarget,nextTarget,t);zoomLevel=THREE.MathUtils.lerp(startZoom,nextZoom,t);render();if(raw<1&&!destroyed)cameraRaf=requestAnimationFrame(tick);else cameraRaf=0;}
    if(ms)cameraRaf=requestAnimationFrame(tick);else tick(start);
  }
  function applyState(){
    for(let i=0;i<markerRecords.length;i++){
      const r=markerRecords[i],visible=categoryVisible(r);r.visible=visible;r.node.visible=visible;
      const selected=r.id===selectedId,park=r.place.category==='parks';
      const lift=(r.isFuture?17:park?10:6)*explosionProgress+(selected?1.3:0);r.node.position.y=.62+lift;r.tether.visible=visible&&lift>.01;
      const attr=r.tether.geometry.getAttribute('position');attr.setXYZ(1,r.node.position.x,r.node.position.y,r.node.position.z);attr.needsUpdate=true;
      r.node.scale.setScalar(selected?1.28:1);r.disk.material.emissiveIntensity=selected?.72:0;r.cap.material.emissiveIntensity=selected?.36:0;
    }
    const dim=THREE.MathUtils.lerp(1,.72,explosionProgress);for(const mesh of contextMeshes){mesh.material.transparent=explosionProgress>0;mesh.material.opacity=dim;mesh.material.needsUpdate=true;}
    villageGroup.visible=explosionProgress<.66;requestRender();
  }
  function setFilter(next){
    filter=['all','outside','everyday','future'].includes(next)?next:'all';
    if(filter==='future')onStatus?.('Three projects have mapped reference areas. All future projects are in the list.');
    else onStatus?.(filter==='outside'?'Showing parks and outdoor places.':filter==='everyday'?'Showing everyday buildings and services.':'Showing all located places.');
    applyState();
  }
  function setExploded(next){
    exploded=!!next;if(explodeRaf){cancelAnimationFrame(explodeRaf);explodeRaf=0;}
    const from=explosionProgress,to=exploded?1:0,start=performance.now(),duration=reduced?0:800;
    if(Math.abs(from-to)<.001){explosionProgress=to;applyState();return;}
    function tick(now){const raw=duration?Math.min(1,(now-start)/duration):1,t=raw<.5?4*raw*raw*raw:1-Math.pow(-2*raw+2,3)/2;explosionProgress=THREE.MathUtils.lerp(from,to,t);applyState();if(raw<1&&!destroyed)explodeRaf=requestAnimationFrame(tick);else explodeRaf=0;}
    if(duration)explodeRaf=requestAnimationFrame(tick);else tick(start);
  }
  function focusPlace(id){
    const direct=markerRecords.find(r=>r.id===id);let record=direct;
    if(!record){const p=byId.get(id),root=p&&rootFor(p,byId),group=p?.locationGroup;record=markerRecords.find(r=>r.id===root?.id||r.place.locationGroup===group);}
    if(!record)return false;
    selectedId=record.id;if(!categoryVisible(record))filter=record.isFuture?'future':'all';applyState();
    animateTo(new THREE.Vector3(record.node.position.x,0,record.node.position.z),Math.min(1.9,Math.max(1.42,zoomLevel)),560);return true;
  }
  function reset(){selectedId=null;filter='all';yaw=-.68;setExploded(false);animateTo(homeTarget,1,650);onStatus?.('Showing all located places.');}
  function zoom(delta){cancelCameraMotion();zoomLevel=THREE.MathUtils.clamp(zoomLevel+delta,.72,2.25);requestRender();}
  function orbit(delta){cancelCameraMotion();yaw+=delta;requestRender();}

  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let drag=null;
  function pointerDown(e){if(e.button!==0)return;cancelCameraMotion();renderer.domElement.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,moved:false};renderer.domElement.style.cursor='grabbing';}
  function pointerMove(e){if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.lastX;drag.lastX=e.clientX;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>6)drag.moved=true;if(drag.moved)orbit(-dx*.006);}
  function finishPointer(e,cancelled=false){
    if(!drag||drag.id!==e.pointerId)return;const wasTap=!drag.moved&&!cancelled;drag=null;renderer.domElement.style.cursor='grab';
    if(wasTap){const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
      const hits=raycaster.intersectObjects(markerRecords.filter(r=>r.visible).map(r=>r.disk),false);if(hits[0]){const record=markerRecords.find(r=>r.disk===hits[0].object);if(record){focusPlace(record.id);onSelect?.(record.id);}}}
  }
  function wheel(e){e.preventDefault();zoom(-e.deltaY*.0014);}
  renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointermove',pointerMove);
  const pointerCancel=e=>finishPointer(e,true);
  renderer.domElement.addEventListener('pointerup',finishPointer);renderer.domElement.addEventListener('pointercancel',pointerCancel);
  renderer.domElement.addEventListener('wheel',wheel,{passive:false});
  const observer=new ResizeObserver(resize);observer.observe(host);resize();applyState();

  function destroy(){
    if(destroyed)return;destroyed=true;if(raf)cancelAnimationFrame(raf);if(cameraRaf)cancelAnimationFrame(cameraRaf);if(explodeRaf)cancelAnimationFrame(explodeRaf);observer.disconnect();
    renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointermove',pointerMove);
    renderer.domElement.removeEventListener('pointerup',finishPointer);renderer.domElement.removeEventListener('pointercancel',pointerCancel);renderer.domElement.removeEventListener('wheel',wheel);
    for(const lr of labelRecords){lr.button.removeEventListener('click',lr.click);lr.button.remove();}
    for(const r of resources)r.dispose?.();for(const m of new Set(materials))m.dispose?.();renderer.dispose();renderer.domElement.remove();
  }
  return {setFilter,setExploded,focusPlace,reset,zoom,orbit,resize,destroy};
}
