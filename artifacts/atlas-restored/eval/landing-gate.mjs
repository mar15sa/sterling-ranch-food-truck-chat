export function landingMeasurementIssues(m){
 const issues=[],overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
 for(const device of ['desktop','phone']){
  const s=m?.[device],r=s?.map,v=s?.viewport;
  if(!r||!v||r.top<0||r.bottom>v.height||r.left<0||r.right>v.width||r.width<(device==='phone'?300:550)||Math.abs(r.width/r.height-1.5)>.03)issues.push(device+': complete usable map must fit the first viewport');
  if(s?.neutral!==true||s.selected!==0)issues.push(device+': landing must start without a selected destination');
  if(s?.labels?.length!==4)issues.push(device+': all four villages must be readable');
  for(const [i,l]of (s?.labels||[]).entries()){
   if(l.rect.width<44||l.rect.height<44||!l.text.match(/\d+ places/))issues.push(device+': village label needs a place count and 44px target');
   if(r&&(l.rect.left<r.left||l.rect.right>r.right||l.rect.top<r.top||l.rect.bottom>r.bottom))issues.push(device+': village label outside map');
   for(const o of s.labels.slice(i+1))if(overlaps(l.rect,o.rect))issues.push(device+': village labels overlap');
  }
  const c=m?.[device==='phone'?'chooserPhone':'chooserDesktop'];
  if(c?.choices?.length!==4||!c.map)issues.push(device+': whole-Ranch chooser missing');
  for(const b of c?.choices||[])if(!b.unobscured||b.rect.width<44||b.rect.height<44||b.rect.bottom>c.map.top)issues.push(device+': chooser must be unobscured above the map');
 }
 if(m?.phone?.overflow!==false)issues.push('Phone must not overflow horizontally');
 if(m?.reset?.neutral!==true||m.reset.selected!==0)issues.push('Whole Ranch reset must restore the neutral overview');
 if(m?.chooserSelection?.village!=='Prospect'||m.chooserSelection.unfolded!==true)issues.push('Chooser must open the selected village connections');
 if(m?.largeTextPhone?.title!=='48px'||m.largeTextPhone.titleBase!=='24'||m.largeTextPhone.overflow!==false)issues.push('Landing heading must remain true 200% text after reload');
 return issues;
}
