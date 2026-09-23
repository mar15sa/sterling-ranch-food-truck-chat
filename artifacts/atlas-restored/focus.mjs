// Camera positions refer to the saved illustration, never legal village boundaries.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function cameraFor({points,kind='village',mobile=false}){
  const safe=(points||[]).filter(p=>Array.isArray(p)&&p.length===2&&Number.isFinite(p[0])&&Number.isFinite(p[1]));
  if(!safe.length)return null;
  const xs=safe.map(p=>p[0]/1536*100),ys=safe.map(p=>p[1]/1024*100);
  const x=(Math.min(...xs)+Math.max(...xs))/2,y=(Math.min(...ys)+Math.max(...ys))/2;
  const spanX=Math.max(...xs)-Math.min(...xs),spanY=Math.max(...ys)-Math.min(...ys);
  const zoom=kind==='place'?(mobile?2.6:3):clamp(Math.min((mobile?76:57)/(spanX+17),76/(spanY+19)),1.45,2.55);
  return {x,y,zoom,tx:clamp((mobile?50:64)-x*zoom,100-100*zoom,0),ty:clamp(50-y*zoom,100-100*zoom,0),radiusX:kind==='place'?14:Math.max(18,spanX/2+10),radiusY:kind==='place'?19:Math.max(21,spanY/2+12)};
}
export function inVillage(place,name){return name==='all'||place.village===name||place.village===name+' area'||place.village?.startsWith(name+' /');}
export function futureOnly(places){return places.filter(p=>p.future===true);}
