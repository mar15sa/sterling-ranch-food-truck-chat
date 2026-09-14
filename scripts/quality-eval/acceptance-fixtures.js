"use strict";
const existing=require('./assessment-fixtures');
const base=existing.find(r=>r.id==='specific-supported');
module.exports=[...existing,
  {id:'honest-partial',question:'Do I need approval for a storage structure and a patio roof?',response:{...existing.find(r=>r.id==='compound-missing-part').response,
    answer:'A detached storage structure requires design review approval. I cannot confirm the patio roof requirement from the available approved information.'},expected:{mustReject:false,outcome:'partial'}},
  {id:'honest-source-gap',question:'What does a patio roof application cost?',response:{answer:'I cannot confirm the patio roof application fee from the available approved information.',sources:[]},expected:{mustReject:false,outcome:'missing-evidence'}},
  {id:'expired-source',question:base.question,response:{...base.response,sources:base.response.sources.map(s=>({...s,freshness:'expired-fixture'}))},expected:{mustReject:true,reason:'Expired evidence cannot establish the current requirement.'}},
  {id:'unapproved-source',question:base.question,response:{...base.response,sources:base.response.sources.map(s=>({...s,reviewStatus:'unapproved-fixture'}))},expected:{mustReject:true,reason:'Unapproved evidence cannot establish an official requirement.'}},
  {id:'invented-action',question:'Where can I get the design review application?',response:{...existing.find(r=>r.id==='document-channel-substitution').response,
    answer:'Open the design review application below.',actions:[{label:'Open application',url:'https://alpha.example/unverified-form'}]},expected:{mustReject:true,reason:'An email submission process does not establish a form URL.'}},
];
