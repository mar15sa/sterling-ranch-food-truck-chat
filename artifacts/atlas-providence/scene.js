import * as THREE from './vendor/three.module.js';
import {project,contains,clipPolygon,clipLine,pointInPolygon,distanceToSegment} from './spatial.mjs';

const palette={ground:0xb8bd96,edge:0xb9a789,road:0xe4dac1,curb:0x9f9f84,park:0x779760,water:0x4d9796,path:0xa98054,ink:0x304d3c};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const ease=t=>1-Math.pow(1-t,3);

function merge(parts){
  const positions=[],normals=[],colors=[];
  for(const {geometry,color} of parts){const g=geometry.index?geometry.toNonIndexed():geometry;const c=new THREE.Color(color);positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);for(let i=0;i<g.attributes.position.count;i++)colors.push(c.r,c.g,c.b);if(g!==geometry)g.dispose();geometry.dispose();}
  const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));result.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));result.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));result.computeBoundingSphere();return result;
}

export function createDistrict({host,labelHost,geo,area,places,onSelect,onStatus}){
  const bounds=area.bounds,byId=new Map(places.map(p=>[p.id,p]));
  const pos=p=>{const q=project(p,bounds);return new THREE.Vector3(q.x,0,q.z);};
  const nw=project([bounds.west,bounds.north],bounds),se=project([bounds.east,bounds.south],bounds),width=se.x-nw.x,depth=se.z-nw.z;
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setClearColor(0xeeeade);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.96;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.domElement.setAttribute('aria-label','Dimensional Providence map. Use the destination buttons and map controls to explore.');renderer.domElement.setAttribute('role','img');host.append(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xeeeade);
  const camera=new THREE.OrthographicCamera(-600,600,500,-500,1,5000);
  scene.add(new THREE.HemisphereLight(0xfff8e5,0x6c7955,1.45));
  const sun=new THREE.DirectionalLight(0xffeccd,2.15);sun.position.set(-600,850,-350);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-850,right:850,top:850,bottom:-850,near:1,far:2400});sun.shadow.bias=-.0003;sun.shadow.normalBias=1.2;scene.add(sun);
  const material=color=>new THREE.MeshStandardMaterial({color,roughness:.9});
  const main=new THREE.Group();scene.add(main);
  const add=(geometry,mat,parent=main)=>{const mesh=new THREE.Mesh(geometry,mat);mesh.receiveShadow=true;parent.add(mesh);return mesh;};
  const ground=add(new THREE.BoxGeometry(width,7,depth),[material(palette.edge),material(palette.edge),material(palette.ground),material(palette.edge),material(palette.edge),material(palette.edge)]);ground.position.y=-3.55;ground.receiveShadow=true;
  const floor=add(new THREE.PlaneGeometry(16000,16000),material(0xeeeade),scene);floor.rotation.x=-Math.PI/2;floor.position.y=-7.2;floor.receiveShadow=true;
  // The board edge is the chosen viewport, never a property or village boundary.
  const p2=coordinate=>{const p=project(coordinate,bounds);return [p.x,p.z];};
  const features=geo.features.map(f=>({...f,points:['building','park','pool','pitch','water'].includes(f.kind)?clipPolygon(f.coordinates,bounds):f.coordinates}));
  const buildings=features.filter(f=>f.kind==='building'&&f.points.length>3);
  const flatPolygon=(points,height=0,base=0,bevel=0)=>{
    const p=points.map(p2),shape=new THREE.Shape(p.map(q=>new THREE.Vector2(q[0],-q[1])));
    const geometry=height?new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelSegments:1,steps:1}):new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI/2);geometry.translate(0,base,0);return geometry;
  };
  const parkPolys=features.filter(f=>f.kind==='park'&&f.points.length>3).map(f=>f.points.map(p2));
  for(const kind of ['park','pitch','water','pool']){
    const selected=features.filter(f=>f.kind===kind&&f.points.length>3);if(!selected.length)continue;
    const colors={park:palette.park,pitch:0xb0b897,water:palette.water,pool:0x4f9f9d};
    const pieces=selected.map(f=>({geometry:flatPolygon(f.points,kind==='pool'?.8:.15,kind==='pool'?.25:.1),color:colors[kind]}));
    const mesh=add(merge(pieces),new THREE.MeshStandardMaterial({vertexColors:true,roughness:kind==='pool'?.25:.93}));mesh.castShadow=false;
    if(kind==='pool')for(const f of selected){const g=flatPolygon(f.points,0,1.08);const border=new THREE.LineSegments(new THREE.EdgesGeometry(g),new THREE.LineBasicMaterial({color:0xfffcdd}));main.add(border);}
  }
  const segments={road:[],trail:[],stream:[]};
  for(const f of features)if(segments[f.kind])for(const [a,b] of clipLine(f.coordinates,bounds))segments[f.kind].push({a:p2(a),b:p2(b),major:f.major,id:f.id});
  function ribbon(list,color,w,y){
    const points=[];for(const seg of list){const [ax,az]=seg.a,[bx,bz]=seg.b,dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);if(len<.01)continue;const size=typeof w==='function'?w(seg):w,nx=-dz/len*size/2,nz=dx/len*size/2;points.push(ax+nx,y,az+nz,bx+nx,y,bz+nz,bx-nx,y,bz-nz,ax+nx,y,az+nz,bx-nx,y,bz-nz,ax-nx,y,az-nz);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.computeVertexNormals();const m=new THREE.MeshStandardMaterial({color,roughness:.94,side:THREE.DoubleSide});return add(g,m);
  }
  ribbon(segments.road,palette.curb,s=>s.major?14:8.5,.3);ribbon(segments.road,palette.road,s=>s.major?11.5:6.5,.36);
  const paths=ribbon(segments.trail,palette.path,2.1,.42);ribbon(segments.stream,0x779f97,2.5,.39);
  const featureMap=new Map(features.map(f=>[f.id,f])),heroIds=new Set(area.landmarks.map(p=>p.buildingId).filter(Boolean));
  const walls=[],roofs=[],windowTransforms=[];
  const houseColors=[0xded1b3,0xebe0c5,0xba9980,0xd4c8b1],roofColors=[0x565a51,0x686d5f,0x77644f,0x847761];
  function pitchedRoof(polygon,height){
    let axis=[1,0],longest=0;
    for(let i=1;i<polygon.length;i++){const dx=polygon[i][0]-polygon[i-1][0],dz=polygon[i][1]-polygon[i-1][1],len=Math.hypot(dx,dz);if(len>longest){longest=len;axis=[dx/len,dz/len];}}
    const [ux,uz]=axis,vx=-uz,vz=ux,rotated=polygon.map(([x,z])=>[x*ux+z*uz,x*vx+z*vz]);
    const us=rotated.map(p=>p[0]),vs=rotated.map(p=>p[1]),u0=Math.min(...us),u1=Math.max(...us),v0=Math.min(...vs),v1=Math.max(...vs),mid=(v0+v1)/2,half=(v1-v0)/2;
    if(half<.2)return null;
    const y=v=>height+.8+Math.max(0,1-Math.abs(v-mid)/half)*Math.min(3.6,half*.5);
    const parts=[];
    for(const b of [{west:u0-1,east:u1+1,south:v0-1,north:mid},{west:u0-1,east:u1+1,south:mid,north:v1+1}]){
      const halfPoly=clipPolygon(rotated,b);if(halfPoly.length<3)continue;
      const world=halfPoly.map(([u,v])=>[u*ux+v*vx,u*uz+v*vz]);
      const shape=new THREE.Shape(world.map(([x,z])=>new THREE.Vector2(x,-z))),g=new THREE.ShapeGeometry(shape);g.rotateX(-Math.PI/2);
      const vertices=g.attributes.position;for(let i=0;i<vertices.count;i++){const v=vertices.getX(i)*vx+vertices.getZ(i)*vz;vertices.setY(i,y(v));}g.computeVertexNormals();parts.push(g);
      const sides=[];for(let i=0;i<halfPoly.length;i++){const j=(i+1)%halfPoly.length,a=halfPoly[i],b=halfPoly[j];if(Math.abs(a[1]-mid)<.001&&Math.abs(b[1]-mid)<.001)continue;const [ax,az]=world[i],[bx,bz]=world[j],ay=y(a[1]),by=y(b[1]),base=height+.4;sides.push(ax,base,az,bx,base,bz,bx,by,bz,ax,base,az,bx,by,bz,ax,ay,az);}const skirt=new THREE.BufferGeometry();skirt.setAttribute('position',new THREE.Float32BufferAttribute(sides,3));skirt.computeVertexNormals();parts.push(skirt);
    }
    return parts;
  }
  const housePolys=[];
  for(const f of buildings){
    const polygon=f.points.map(p2);housePolys.push(polygon);if(heroIds.has(f.id))continue;
    const seed=f.id%17,height=4.8+(seed%3)*1.4;
    walls.push({geometry:flatPolygon(f.points,height,.45),color:houseColors[seed%4]});
    const pitched=pitchedRoof(polygon,height);for(const geometry of pitched||[flatPolygon(f.points,.45,height+.9,.55)])roofs.push({geometry,color:roofColors[seed%4]});
    for(let i=1;i<polygon.length;i++){const [ax,az]=polygon[i-1],[bx,bz]=polygon[i],len=Math.hypot(bx-ax,bz-az);if(len<5||len>65)continue;for(let s=2;s<len-1;s+=4){windowTransforms.push({x:ax+(bx-ax)*s/len,z:az+(bz-az)*s/len,y:height*.55,angle:Math.atan2(bx-ax,bz-az),width:1.05,height:1.35});}}
  }
  const wallMesh=add(merge(walls),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96}));wallMesh.castShadow=true;
  const roofMesh=add(merge(roofs),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.93,side:THREE.DoubleSide}));roofMesh.castShadow=true;
  const paneGeom=new THREE.BoxGeometry(1,1,.12),paneMat=new THREE.MeshStandardMaterial({color:0x65766c,roughness:.4});
  const windows=new THREE.InstancedMesh(paneGeom,paneMat,windowTransforms.length),dummy=new THREE.Object3D();
  windowTransforms.forEach((t,i)=>{dummy.position.set(t.x,t.y,t.z);dummy.rotation.set(0,t.angle,0);dummy.scale.set(t.width,t.height,1);dummy.updateMatrix();windows.setMatrixAt(i,dummy.matrix);});main.add(windows);
  const heroes=new Map();
  for(const landmark of area.landmarks){
    const f=featureMap.get(landmark.buildingId);if(!f?.points.length)continue;
    const g=new THREE.Group();main.add(g);const height=landmark.height;
    const polygon=f.points.map(p2),parts=[],xs=polygon.map(p=>p[0]),x0=Math.min(...xs),x1=Math.max(...xs);
    const bodyGeometry=flatPolygon(f.points,height,.45);let bodyMaterial=material(landmark.wallColor);
    if(landmark.id==='sterling-center'){
      const colors=[];for(let i=0;i<bodyGeometry.attributes.position.count;i++){const x=bodyGeometry.attributes.position.getX(i),y=bodyGeometry.attributes.position.getY(i);const color=new THREE.Color(x<x0+(x1-x0)*.28?0xe2e2cf:y>5.2?0xb88652:0xa36048);colors.push(color.r,color.g,color.b);}bodyGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));bodyMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.84});
    }
    const body=add(bodyGeometry,bodyMaterial,g);body.castShadow=true;
    const roofGeometry=landmark.id==='overlook'?merge(pitchedRoof(polygon,height).map(geometry=>({geometry,color:landmark.roofColor}))):flatPolygon(f.points,.55,height+.8,.28);
    const roof=add(roofGeometry,landmark.id==='overlook'?new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8,side:THREE.DoubleSide}):material(landmark.roofColor),g);roof.castShadow=true;
    for(let i=1;i<polygon.length;i++){
      const a=polygon[i-1],b=polygon[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<2.5)continue;
      const windowsPerFloor=Math.floor(len/3.4);
      for(let floorIndex=0;floorIndex<(landmark.id==='sterling-center'?2:1);floorIndex++)for(let n=0;n<windowsPerFloor;n++){
        const t=(n+.5)/windowsPerFloor,geom=new THREE.BoxGeometry(Math.min(2.6,len/windowsPerFloor-.4),landmark.id==='sterling-center'?2.6:3,.25);
        geom.rotateY(-Math.atan2(dz,dx));geom.translate(a[0]+dx*t,2.1+floorIndex*4.5,a[1]+dz*t);parts.push({geometry:geom,color:landmark.id==='sterling-center'?0x678e87:0x79938a});
      }
    }
    if(parts.length){const glass=add(merge(parts),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.35,metalness:.08}),g);glass.castShadow=false;}
    // Separate roof + source-footprint reveal; the revealed color does not assert rooms or suites.
    const inner=add(flatPolygon(f.points,.1,height+.52),material(0xdfd0a7),g);inner.visible=false;
    heroes.set(landmark.id,{group:g,roof,inner,baseRoofY:0,lift:0});
  }
  // Planting provides miniature texture. It is decorative, never a claimed tree survey.
  let seed=41683;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  const trees=[],allLine=segments.road.concat(segments.trail),waterPolys=features.filter(f=>['water','pool'].includes(f.kind)&&f.points.length>3).map(f=>f.points.map(p2));
  const safeTree=p=>!housePolys.some(poly=>pointInPolygon(p,poly))&&!waterPolys.some(poly=>pointInPolygon(p,poly))&&!allLine.some(seg=>distanceToSegment(p,seg.a,seg.b)<(seg.major?10:5));
  // A regular spatial grid makes collision checks small and avoids planting in paths/buildings.
  for(let x=nw.x+9;x<se.x-8;x+=13)for(let z=nw.z+9;z<se.z-8;z+=13){const p=[x+(random()-.5)*10,z+(random()-.5)*10];const park=parkPolys.some(poly=>pointInPolygon(p,poly));if(random()>(park?.72:.34)||!safeTree(p))continue;trees.push({x:p[0],z:p[1],r:3.4+random()*2.2,h:5+random()*4,color:new THREE.Color([0x557c45,0x698652,0x547351,0x99945a,0x7d975b][Math.floor(random()*5)])});}
  const foliage=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),material(0xffffff),trees.length*2),trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.35,.5,1,5),material(0x8d8063),trees.length);
  trees.forEach((t,i)=>{dummy.position.set(t.x,t.h/2,t.z);dummy.rotation.set(0,0,0);dummy.scale.set(1,t.h,1);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);for(let k=0;k<2;k++){dummy.position.set(t.x+(k?.7:0),t.h+(k?1.4:0),t.z+(k?.8:0));dummy.rotation.set(random(),random(),0);dummy.scale.set(t.r*(k?.72:1),t.r*(k?1.15:1.2),t.r*(k?.78:1));dummy.updateMatrix();foliage.setMatrixAt(i*2+k,dummy.matrix);foliage.setColorAt(i*2+k,t.color);}});foliage.castShadow=true;main.add(foliage,trunks);
  const pickTargets=[],labels=[];
  const ringMat=new THREE.MeshBasicMaterial({color:0xfff6d7,side:THREE.DoubleSide,transparent:true,opacity:.95});
  for(const item of area.landmarks){
    const record=byId.get(item.id);if(!record?.coordinates||!contains(record.coordinates,bounds))continue;
    const anchor=pos(record.coordinates);anchor.y=(item.height||1)+3;
    const button=document.createElement('button');button.type='button';button.className='map-label';button.dataset.place=item.id;button.innerHTML='<span class="label-number"></span><span class="label-name"></span>';
    button.querySelector('.label-number').textContent=item.number;button.querySelector('.label-name').textContent=item.label;
    button.setAttribute('aria-label','Explore '+item.label);button.addEventListener('click',()=>onSelect(item.id));labelHost.append(button);
    const stem=document.createElement('span');stem.className='label-stem';labelHost.append(stem);
    const ring=new THREE.Mesh(new THREE.RingGeometry(7,8.5,36),ringMat.clone());ring.rotation.x=-Math.PI/2;ring.position.copy(pos(record.coordinates));ring.position.y=.65;ring.visible=false;main.add(ring);
    labels.push({item,record,anchor,button,stem,ring});
    const sphere=new THREE.Mesh(new THREE.SphereGeometry(11,8,8),new THREE.MeshBasicMaterial({visible:false}));sphere.position.copy(anchor);sphere.userData.id=item.id;main.add(sphere);pickTargets.push(sphere);
  }
  const routeOverlay=ribbon(segments.trail,0x36735f,4,.62);routeOverlay.visible=false;
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  let view={x:0,z:0,span:depth*1.07,yaw:-.18,tilt:1.05},animation=null,raf=0,mode='places',selected=null,opened=null,drag=null,destroyed=false;
  const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
  let W=0,H=0;
  function cameraUpdate(){
    const aspect=W/H,span=view.span;camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();
    const distance=1500;camera.position.set(view.x+Math.sin(view.yaw)*Math.cos(view.tilt)*distance,Math.sin(view.tilt)*distance,view.z+Math.cos(view.yaw)*Math.cos(view.tilt)*distance);camera.lookAt(view.x,0,view.z);camera.updateMatrixWorld();
  }
  function layoutLabels(){
    const occupied=[];
    for(const label of [...labels].sort((a,b)=>(b.item.id===selected)-(a.item.id===selected))){
      const q=label.anchor.clone().project(camera),x=(q.x*.5+.5)*W,y=(-q.y*.5+.5)*H;
      const show=Math.abs(q.x)<.98&&Math.abs(q.y)<.95&&q.z>-1&&q.z<1&&!opened;
      label.button.hidden=!show;label.stem.hidden=!show;if(!show)continue;
      const isSelected=selected===label.item.id;
      label.button.classList.toggle('selected',isSelected);label.button.classList.toggle('quiet',mode==='paths');label.button.setAttribute('aria-pressed',String(isSelected));
      label.button.classList.toggle('compact',W<650&&!isSelected&&!['sterling-center','overlook'].includes(label.item.id));
      let tx=x,ty=y-24;const bw=label.button.offsetWidth||110,bh=label.button.offsetHeight||30;
      // Labels move; their anchor stems stay attached to the saved coordinates.
      const candidates=[[-bw/2,-32],[-bw-15,-22],[15,-22],[-bw/2,18],[-bw/2,-67]];
      for(const [dx,dy] of candidates){tx=clamp(x+dx,8,W-bw-8);ty=clamp(y+dy,10,H-bh-52);if(!occupied.some(r=>tx<r.x+r.w+5&&tx+bw>r.x-5&&ty<r.y+r.h+5&&ty+bh>r.y-5))break;}
      occupied.push({x:tx,y:ty,w:bw,h:bh});label.button.style.transform=`translate(${tx}px,${ty}px)`;
      const endX=clamp(x,tx+8,tx+bw-8),endY=ty<y?ty+bh:ty,dx=endX-x,dy=endY-y;label.stem.style.cssText=`left:${x}px;top:${y}px;width:${Math.hypot(dx,dy)}px;transform:rotate(${Math.atan2(dy,dx)}rad)`;
    }
    const compass=document.querySelector('#compass-arrow');if(compass)compass.style.transform=`rotate(${-view.yaw*180/Math.PI}deg)`;
  }
  function render(time=0){
    raf=0;if(destroyed)return;
    if(animation){const t=reduced?1:clamp((time-animation.start)/900,0,1),k=ease(t);for(const key of Object.keys(view))view[key]=animation.from[key]+(animation.to[key]-animation.from[key])*k;if(t===1){animation=null;host.dataset.cameraMoving='false';}}
    let moving=false;
    for(const [id,hero] of heroes){const goal=id===opened?16:0;hero.lift=reduced?goal:hero.lift+(goal-hero.lift)*.14;if(Math.abs(goal-hero.lift)>.025)moving=true;else hero.lift=goal;hero.roof.position.y=hero.lift;hero.inner.visible=hero.lift>1;}
    cameraUpdate();renderer.render(scene,camera);layoutLabels();if(animation||moving)raf=requestAnimationFrame(render);
  }
  function request(){if(!raf)raf=requestAnimationFrame(render);}
  function move(to){host.dataset.cameraMoving='true';animation={from:{...view},to:{...view,...to},start:performance.now()};request();}
  function homeSpan(){return Math.max(depth*1.01,(width*.985+depth*.18)/(W/H))*1.08;}
  function resize(){W=host.clientWidth;H=host.clientHeight;if(!W||!H)return;renderer.setSize(W,H,false);if(!opened&&!animation&&view.span>600)view.span=homeSpan();request();}
  const observer=new ResizeObserver(resize);observer.observe(host);
  host.addEventListener('pointerdown',event=>{if(event.button!==0)return;drag={x:event.clientX,y:event.clientY,moved:false,view:{...view}};host.setPointerCapture(event.pointerId);animation=null;});
  host.addEventListener('pointermove',event=>{if(!drag)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;drag.moved ||= Math.hypot(dx,dy)>5;view.yaw=drag.view.yaw-dx*.004;view.tilt=clamp(drag.view.tilt+dy*.002,.45,1.5);request();});
  host.addEventListener('pointerup',event=>{if(!drag)return;const wasDrag=drag.moved;drag=null;if(!wasDrag){const rect=host.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(pickTargets)[0];if(hit)onSelect(hit.object.userData.id);}request();});
  host.addEventListener('pointercancel',()=>{drag=null;});
  host.addEventListener('wheel',event=>{if(!event.ctrlKey)return;event.preventDefault();animation=null;view.span=clamp(view.span*Math.exp(event.deltaY*.001),100,depth*1.8);request();},{passive:false});
  host.dataset.buildings=String(buildings.length);host.dataset.mappedPaths=String(new Set(segments.trail.map(s=>s.id)).size);host.dataset.landmarks=String(labels.length);host.dataset.geometryDate=geo.checkedAt;
  onStatus?.('Ready. Choose a place, or drag to turn the model.');resize();
  return {
    select(id,{focus=false,open=false}={}){selected=id;opened=open&&heroes.has(id)?id:null;for(const label of labels)label.ring.visible=label.item.id===id;
      if(focus&&byId.get(id)?.coordinates){const p=pos(byId.get(id).coordinates);move({x:p.x,z:p.z,span:open?(id==='sterling-center'?155:125):360,tilt:open?.67:1.1,yaw:open?-.5:-.18});}else request();},
    setMode(value){mode=value;routeOverlay.visible=mode==='paths';paths.material.color.set(mode==='paths'?0x58836a:palette.path);request();},
    reset(){opened=null;move({x:0,z:0,span:homeSpan(),yaw:-.18,tilt:1.05});},
    zoom(amount){move({span:clamp(view.span*amount,90,depth*1.8)});},
    turn(amount){move({yaw:view.yaw+amount});},
    top(){move({tilt:1.5,yaw:0});},
    dispose(){destroyed=true;observer.disconnect();cancelAnimationFrame(raf);scene.traverse(obj=>{obj.geometry?.dispose();const mats=Array.isArray(obj.material)?obj.material:[obj.material];mats.forEach(m=>m?.dispose());});renderer.dispose();host.replaceChildren();labelHost.replaceChildren();}
  };
}
