import fs from 'node:fs';const edit=(p,f)=>fs.writeFileSync(p,f(fs.readFileSync(p,'utf8')));
edit('app.js',s=>s.replace("const selectedModelButton=$('#model-rail", "$('#back-to-map').textContent='← '+$('#return-context').textContent;const selectedModelButton=$('#model-rail")
.replace("walkMinutes=30;setView('walks');","walkMinutes=30;setView('walks');$('.view-nav').scrollIntoView({block:'start',behavior:scrollBehavior()});"));
edit('package.json',s=>s.replace('resident-data.test.mjs eval/check.test.mjs','resident-data.test.mjs display.test.mjs complete-plan.test.mjs eval/check.test.mjs'));

