import * as THREE from './vendor/three.module.js';

const ROOT_IDS = new Set([
  'sterling-center','overlook','providence-park','burns','yard-27','zippity',
  'ascent-pavilion','prospect-park','willow-creek','broadstone','prose','john-adams',
  'high-top','horsebrush','mccormick','pat-gallagher','pioneer','primrose',
]);
const FUTURE_IDS = new Set(['burns-next','prospect-next','willow-repair']);
const MODEL_LABELS = {
  'sterling-center':'./assets/sterling-center.png','overlook':'./assets/overlook-model.png',
  burns:'./assets/burns-model.png','prospect-park':'./assets/prospect-model.png',
};
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
  background:0xfbf8ef, slabTop:0xaeb28e, slabSide:0xc8b99e, road:0xf5edda,
  roadMajor:0xfffbf2, building:0xeee3ce, buildingSide:0xb8a58a, park:0x365f49,
  pitch:0x71866a, water:0x45a5a4, trail:0xb9784b, stream:0x5baeb0,
  amenity:0x277c78, service:0x8f6546, future:0xc18345, ink:0x213c35,
  wood:0x866b50, stone:0xd8cbb7, tree:0x28523e, shrub:0x647a57,
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
  const positions=[],normals=[],groups=[];let vertexOffset=0;
  for(const source of geometries){
    const g=source.index?source.toNonIndexed():source;
    for(const group of g.groups)groups.push({start:vertexOffset+group.start,count:group.count,materialIndex:group.materialIndex});
    positions.push(...g.getAttribute('position').array);
    const normal=g.getAttribute('normal');if(normal)normals.push(...normal.array);
    vertexOffset+=g.getAttribute('position').count;
    if(g!==source)g.dispose();source.dispose();
  }
  if(!positions.length)return null;
  const merged=new THREE.BufferGeometry();
  merged.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  if(normals.length===positions.length)merged.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  else merged.computeVertexNormals();
  for(const group of groups)merged.addGroup(group.start,group.count,group.materialIndex);
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
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
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
  function prairieTexture(){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d'),image=ctx.createImageData(128,128);
    let seed=17391;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
    for(let i=0;i<image.data.length;i+=4){const value=218+Math.floor(random()*25);image.data[i]=value;image.data[i+1]=value+3;image.data[i+2]=value-2;image.data[i+3]=255;}
    ctx.putImageData(image,0,0);ctx.globalAlpha=.13;ctx.strokeStyle='#66705b';ctx.lineWidth=.45;
    for(let i=0;i<90;i++){const x=random()*128,y=random()*128;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+random()*5-2.5,y+random()*3-1.5);ctx.stroke();}
    const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(11,10);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());resources.push(texture);return texture;
  }
  function roundedSlabGeometry(width,depth,thickness,radius,topY,bevel=.25){
    const shape=new THREE.Shape();shape.moveTo(-width/2+radius,-depth/2);shape.lineTo(width/2-radius,-depth/2);shape.quadraticCurveTo(width/2,-depth/2,width/2,-depth/2+radius);
    shape.lineTo(width/2,depth/2-radius);shape.quadraticCurveTo(width/2,depth/2,width/2-radius,depth/2);shape.lineTo(-width/2+radius,depth/2);
    shape.quadraticCurveTo(-width/2,depth/2,-width/2,depth/2-radius);shape.lineTo(-width/2,-depth/2+radius);shape.quadraticCurveTo(-width/2,-depth/2,-width/2+radius,-depth/2);
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:true,bevelSegments:2,bevelSize:bevel,bevelThickness:bevel*.65,curveSegments:4});
    geometry.rotateX(Math.PI/2);geometry.translate(0,topY,0);return geometry;
  }
  const sw=worldWidth+6,sd=worldDepth+6,sr=3.2;
  const slabMat=material({color:COLORS.slabTop,map:prairieTexture(),roughness:.94,metalness:0}),underside=material({color:COLORS.slabSide,roughness:.98});
  const slabGeometry=roundedSlabGeometry(sw,sd,1.35,sr,.08,.38);
  const slab=new THREE.Mesh(slabGeometry,[slabMat,underside]);resources.push(slab.geometry);slab.receiveShadow=true;slab.castShadow=true;scene.add(slab);
  const woodGeometry=roundedSlabGeometry(sw+1.2,sd+1.2,1.05,sr+.3,-1.12,.3),woodLayer=new THREE.Mesh(woodGeometry,material({color:COLORS.wood,roughness:.82}));
  resources.push(woodGeometry);woodLayer.castShadow=true;woodLayer.receiveShadow=true;scene.add(woodLayer);
  const stoneGeometry=roundedSlabGeometry(sw+2.3,sd+2.3,.8,sr+.55,-2.05,.22),stoneLayer=new THREE.Mesh(stoneGeometry,material({color:COLORS.stone,roughness:1}));
  resources.push(stoneGeometry);stoneLayer.castShadow=true;stoneLayer.receiveShadow=true;scene.add(stoneLayer);

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
  const buildings=addPolygons('building',COLORS.building,1.38,.12,{cast:true,roughness:.86});if(buildings)contextMeshes.push(buildings);
  const roofs=addPolygons('building',COLORS.buildingSide,.13,1.5,{cast:true,roughness:.78});if(roofs)contextMeshes.push(roofs);

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

  function pointInPolygon(point,polygon){
    let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
      const a=polygon[i],b=polygon[j],crosses=(a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0];if(crosses)inside=!inside;
    }return inside;
  }
  function distanceToSegment(point,a,b){
    const dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;if(!length)return Math.hypot(point[0]-a[0],point[1]-a[1]);
    const t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dz)/length)),x=a[0]+t*dx,z=a[1]+t*dz;return Math.hypot(point[0]-x,point[1]-z);
  }
  function worldPolygon(feature){return clipPolygon(feature.coordinates||[],bounds).map(c=>{const p=project(c);return [p.x,p.z];});}
  const plantingExclusions=geo.features.filter(f=>['building','pitch','water','pool'].includes(f.kind)).map(worldPolygon).filter(p=>p.length>2);
  const pathExclusions=[];
  for(const f of geo.features)if(f.kind==='road'||f.kind==='trail')for(let i=1;i<(f.coordinates||[]).length;i++){
    const segment=clipSegment(f.coordinates[i-1],f.coordinates[i],bounds);if(!segment)continue;const a=project(segment[0]),b=project(segment[1]);pathExclusions.push({a:[a.x,a.z],b:[b.x,b.z],clearance:f.kind==='road'?(f.major?1.35:.82):.48});
  }
  const plantings=[];
  for(const feature of geo.features.filter(f=>f.kind==='park')){
    const polygon=worldPolygon(feature);if(polygon.length<3)continue;
    const xs=polygon.map(p=>p[0]),zs=polygon.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
    let area=0;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++)area+=polygon[j][0]*polygon[i][1]-polygon[i][0]*polygon[j][1];area=Math.abs(area/2);
    const wanted=Math.min(16,Math.max(2,Math.floor(area/34)));let seed=(Number(feature.id)||7919)>>>0;
    const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
    for(let attempt=0,added=0;attempt<wanted*35&&added<wanted&&plantings.length<92;attempt++){
      const candidate=[minX+random()*(maxX-minX),minZ+random()*(maxZ-minZ)];
      if(!pointInPolygon(candidate,polygon)||plantingExclusions.some(p=>pointInPolygon(candidate,p)))continue;
      if(pathExclusions.some(s=>distanceToSegment(candidate,s.a,s.b)<s.clearance))continue;
      if(plantings.some(p=>Math.hypot(candidate[0]-p.x,candidate[1]-p.z)<1.75))continue;
      plantings.push({x:candidate[0],z:candidate[1],scale:.72+random()*.48,shrub:random()<.28,turn:random()*Math.PI*2});added++;
    }
  }
  const trees=plantings.filter(p=>!p.shrub),shrubs=plantings.filter(p=>p.shrub),dummy=new THREE.Object3D();
  function instancedPlant(geometry,matColor,items,transform){
    if(!items.length){geometry.dispose();return null;}const mat=material({color:matColor,roughness:.96}),mesh=new THREE.InstancedMesh(geometry,mat,items.length);resources.push(geometry);
    items.forEach((item,index)=>{transform(dummy,item);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);});mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);contextMeshes.push(mesh);return mesh;
  }
  instancedPlant(new THREE.CylinderGeometry(.11,.15,.9,6),0x725a42,trees,(o,p)=>{o.position.set(p.x,.45+.45*p.scale,p.z);o.rotation.set(0,p.turn,0);o.scale.setScalar(p.scale);});
  instancedPlant(new THREE.IcosahedronGeometry(.66,1),COLORS.tree,trees,(o,p)=>{o.position.set(p.x,1.67*p.scale,p.z);o.rotation.set(0,p.turn,0);o.scale.set(p.scale,p.scale*1.16,p.scale);});
  instancedPlant(new THREE.IcosahedronGeometry(.42,1),COLORS.shrub,shrubs,(o,p)=>{o.position.set(p.x,.62,p.z);o.rotation.set(0,p.turn,0);o.scale.set(p.scale*1.15,p.scale*.72,p.scale);});

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
    const isModel=Object.hasOwn(MODEL_LABELS,record.id);button.classList.toggle('ranch-label--model',isModel);button.setAttribute('aria-label',`Open ${record.place.name}`);
    if(isModel){const image=document.createElement('img');image.src=new URL(MODEL_LABELS[record.id],import.meta.url).href;image.alt='';image.decoding='async';image.draggable=false;image.setAttribute('aria-hidden','true');image.addEventListener('load',requestRender,{once:true});button.appendChild(image);}
    const text=document.createElement('span');text.className='ranch-label-name';text.setAttribute('aria-hidden','true');text.textContent=SHORT_NAMES[record.id]||record.place.name;button.appendChild(text);
    if(isModel){const connector=document.createElement('span');connector.className='ranch-label-connector';connector.setAttribute('aria-hidden','true');button.appendChild(connector);}
    if(record.isFuture){button.dataset.future='true';button.classList.add('is-future');}
    const click=(event)=>{event.stopPropagation();onSelect?.(record.id);};button.addEventListener('click',click);labelLayer.appendChild(button);
    const lr={record,button,click,isModel};labelRecords.push(lr);return lr;
  }
  markerRecords.forEach(makeLabel);
  const compass=document.createElement('div');compass.className='ranch-compass';compass.setAttribute('role','img');compass.setAttribute('aria-label','Map orientation: north');
  const compassNeedle=document.createElement('span');compassNeedle.className='ranch-compass-needle';compassNeedle.setAttribute('aria-hidden','true');
  const compassNorth=document.createElement('span');compassNorth.className='ranch-compass-north';compassNorth.setAttribute('aria-hidden','true');compassNorth.textContent='N';
  compass.append(compassNeedle,compassNorth);labelLayer.appendChild(compass);

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
    const centerScreen=new THREE.Vector3(target.x,0,target.z).project(camera),northScreen=new THREE.Vector3(target.x,0,target.z-10).project(camera);
    const northAngle=Math.atan2(northScreen.x-centerScreen.x,-(northScreen.y-centerScreen.y))*180/Math.PI,angle=`${northAngle.toFixed(2)}deg`;
    compass.style.setProperty('--north-angle',angle);compassNeedle.style.transform=`rotate(${angle})`;
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
      const selected=r.id===selectedId,priority=lr.isModel?(selected?130:120):selected?110:r.isFuture?70:STRONG_LABELS.has(r.id)?60:r.place.category==='parks'?35:25;
      candidates.push({lr,x,y,priority,selected});
    }
    candidates.sort((a,b)=>b.priority-a.priority);
    const boxes=[];let named=0;const layerRect=labelLayer.getBoundingClientRect();
    const overlaps=(rect)=>boxes.some(box=>rect.left<box.right+6&&rect.right>box.left-6&&rect.top<box.bottom+6&&rect.bottom>box.top-6);
    const overlapScore=(rect)=>boxes.reduce((sum,box)=>sum+Math.max(0,Math.min(rect.right,box.right)-Math.max(rect.left,box.left))*Math.max(0,Math.min(rect.bottom,box.bottom)-Math.max(rect.top,box.top)),0);
    for(const c of candidates){
      const {button,isModel}=c.lr;button.hidden=false;button.style.left=`${c.x}px`;button.style.top=`${c.y}px`;button.classList.remove('is-dot');
      let rect=button.getBoundingClientRect(),dx=0,dy=0;
      if(isModel&&overlaps(rect)){
        const w=Math.max(1,rect.width),h=Math.max(1,rect.height),offsets=[[w*.72,0],[-w*.72,0],[w*.48,-h*.78],[-w*.48,-h*.78],[0,-h*.92],[w*.5,h*.32],[-w*.5,h*.32]];
        let best={rect,dx:0,dy:0,score:overlapScore(rect)+1};
        for(const [ox,oy] of offsets){button.style.left=`${c.x+ox}px`;button.style.top=`${c.y+oy}px`;const test=button.getBoundingClientRect(),outside=test.left<layerRect.left+3||test.right>layerRect.right-3||test.top<layerRect.top+3||test.bottom>layerRect.bottom-3,score=overlapScore(test)+(outside?100000:0);if(score<best.score)best={rect:test,dx:ox,dy:oy,score};if(score===0)break;}
        ({rect,dx,dy}=best);button.style.left=`${c.x+dx}px`;button.style.top=`${c.y+dy}px`;
      }
      const collides=overlaps(rect),showName=isModel||c.selected||(!collides&&named<9&&(c.priority>=60||named<7));
      button.classList.toggle('is-dot',!showName);button.classList.toggle('is-selected',c.selected);
      button.classList.toggle('is-offset',isModel&&(Math.abs(dx)>1||Math.abs(dy)>1));button.style.setProperty('--anchor-offset-x',`${-dx}px`);button.style.setProperty('--anchor-offset-y',`${-dy}px`);
      button.style.setProperty('--connector-length',`${Math.hypot(dx,dy)}px`);button.style.setProperty('--connector-angle',`${Math.atan2(-dy,-dx)*180/Math.PI}deg`);
      button.classList.toggle('is-covered',!showName&&collides);
      button.setAttribute('aria-pressed',String(c.selected));
      if(showName){named++;boxes.push(rect);}
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
    compass.remove();
    for(const r of resources)r.dispose?.();for(const m of new Set(materials))m.dispose?.();renderer.dispose();renderer.domElement.remove();
  }
  return {setFilter,setExploded,focusPlace,reset,zoom,orbit,resize,destroy};
}
