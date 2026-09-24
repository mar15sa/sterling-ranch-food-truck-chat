import fs from 'node:fs';const edit=(p,f)=>fs.writeFileSync(p,f(fs.readFileSync(p,'utf8')));
edit('app.js',s=>{const assign="if((view==='neighborhood'||view==='walks')&&open){returnMap=pendingReturnMap||currentMapContext();pendingReturnMap=null;}";
 return s.replace(assign,'').replace("function select(id,open=false){","function select(id,open=false){\n "+assign)
 .replace("pendingReturnMap=currentMapContext();","pendingReturnMap={...currentMapContext(),opener:e.target.closest('[data-open]').dataset.open};")
 .replace("const focusTarget=discovery.state().unfolded?$('#unfold-sheets button'):$('#place-note');","const opener=returnMap?.opener;const focusTarget=(opener&&document.querySelector((discovery.state().unfolded?'#unfold-sheets':'#place-note')+' [data-open=\"'+opener+'\"]'))||(discovery.state().unfolded?$('#unfold-sheets button'):$('#place-note'));");
});
edit('navigation.mjs',s=>s.replace("view:q.get('returnView')","opener:id(q.get('returnOpener')),view:q.get('returnView')").replace("const r=s.returnMap;q.set('return','1');","const r=s.returnMap;q.set('return','1');if(r.opener)q.set('returnOpener',r.opener);"));
edit('connections.js',s=>s.replace("import { outing }","import { outing, projectStatus }").replace('Related future plan · status & source ↗', "'+esc(projectStatus(p,p.project))+' · status & source ↗"));

