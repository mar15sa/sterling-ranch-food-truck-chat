const test=require('node:test'),assert=require('node:assert/strict');
const {eligibleCorpus,eligibleForQuestion,sectionKey,windowsForDocument,fuse}=require('../scripts/quality-eval/semantic-corpus');
const doc={id:'a::1',nodeId:'a',sourceUrl:'https://alpha.example/policy',communityId:'alpha',productId:1,jobId:2,title:'Policy',text:'Approved text'};
test('semantic corpus preserves community, freshness, searchable status and owner withholding',()=>{
  const docs=[doc,{...doc,id:'other',communityId:'beta'},{...doc,id:'expired',expiresAt:'2020-01-01'},
    {...doc,id:'pending',reviewStatus:'pending-review'},{...doc,id:'excluded',searchable:false}];
  assert.deepEqual(eligibleCorpus({documents:docs},'alpha'),[doc]);
  assert.equal(eligibleForQuestion({...doc,ownerReview:{withheldQuestionPatterns:['live safety']}},'Tell me about live safety'),false);
  assert.notEqual(sectionKey(doc),sectionKey({...doc,jobId:3}));
});
test('embedding windows retain every source character and fit the token budget without silent tail loss',async()=>{
  const text='A source clause with conditions.\n'.repeat(90)+'FINAL EXCEPTION';
  const windows=await windowsForDocument({...doc,text},async s=>s.length,{maxTokens:160,maxChars:1200});
  assert.equal(windows[0].start,0);assert.equal(windows.at(-1).end,text.length);
  for(let i=0;i<windows.length;i++){
    const w=windows[i];assert.ok(w.tokens<=160);assert.ok(w.input.endsWith(text.slice(w.start,w.end)));
    if(i)assert.ok(w.start<=windows[i-1].end);
  }
  assert.match(windows.at(-1).input,/FINAL EXCEPTION$/);
});
test('fusion combines ranks without allowing identical text from another version to share a score',()=>{
  const b={...doc,id:'b::1',nodeId:'b'},different={...doc,jobId:3};
  const rows=fuse([{document:doc},{document:b}],[{document:b},{document:different}]);
  assert.equal(rows.length,3);assert.equal(rows[0].document.nodeId,'b');
  assert.deepEqual(rows[0].ranks,{keyword:2,semantic:1});
});
