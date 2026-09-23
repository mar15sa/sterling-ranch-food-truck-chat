import fs from 'node:fs';
const edit=(p,f)=>fs.writeFileSync(p,f(fs.readFileSync(p,'utf8')));
edit('app.js',s=>"import {initDisplayPreferences} from './display.js';\n"+s.replace("const scrollBehavior=()=>matchMedia", "initDisplayPreferences();\nconst scrollBehavior=()=>window.atlasReducedMotion?.()?'auto':matchMedia").replace("(kind==='route'?'':accessBadges(p))","(kind==='route'?'':kind==='future'?'<span class=\"project-status\">'+esc(projectStatus(p,projectUpdates.find(u=>u.id===p.id)))+'</span>':accessBadges(p))"));
edit('index.html',s=>s.replace('</head>','<link rel="stylesheet" href="connections.css"><link rel="stylesheet" href="display.css"></head>').replace('http://127.0.0.1:4200/','http://127.0.0.1:4201/'));
edit('server.mjs',s=>s.replace('PORT || 4201','PORT || 4202'));
for(const file of ['discovery-ui.js','future-ui.js'])edit(file,s=>s.replace(/matchMedia\('\(prefers-reduced-motion: ?reduce\)'\)\.matches/g,"(window.atlasReducedMotion?.()??matchMedia('(prefers-reduced-motion: reduce)').matches)"));

