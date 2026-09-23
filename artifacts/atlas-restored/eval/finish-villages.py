from pathlib import Path
p=Path('future-ui.js');s=p.read_text(encoding='utf-8')
s=s.replace("$('#village-plan-detail').focus({preventScroll:true});changed();return;", "$('#village-plan-detail').focus({preventScroll:true});if(innerWidth<=720)$('#village-plan-detail').scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});changed();return;")
s=s.replace("if(b.dataset.futureMode){", "if('villageMap'in b.dataset){const pin=panel.querySelector('.village-plan-pin[aria-pressed=true]');pin?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});pin?.focus({preventScroll:true});}if(b.dataset.futureMode){")
p.write_text(s,encoding='utf-8')
p=Path('village-plans-ui.js');s=p.read_text(encoding='utf-8').replace('See the source plan ↗</a>`','See the source plan ↗</a><button class="village-return" data-village-map>Back to this area on the map ↑</button>`');p.write_text(s,encoding='utf-8')
p=Path('planned-villages.mjs');s=p.read_text(encoding='utf-8').replace('Older planning records also use Paramount Village; its current public name is not confirmed.','Its name on future developer announcements may change.');p.write_text(s,encoding='utf-8')
p=Path('app.js');s=p.read_text(encoding='utf-8').replace('matching future projects.','matching future areas or projects.');p.write_text(s,encoding='utf-8')
