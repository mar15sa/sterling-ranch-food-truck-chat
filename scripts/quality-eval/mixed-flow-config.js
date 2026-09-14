"use strict";
const {createConnectorAdapters}=require('../../lib/community-connector-adapter');
const {getCommunityEvents}=require('../../lib/community-events');
const {getCommunityPoolStatus}=require('../../lib/community-pool-status');
const {getCommunityFoodTruckSchedule}=require('../../lib/community-food-truck-live');
const {getWasteSchedule}=require('../../lib/community-waste-schedule');
const {highConfidenceDateRange}=require('../../lib/community-interpretation');
const {createLiveEvidenceRetriever}=require('./live-evidence');
const cases=[
 {id:'recycling-storage',family:'waste-and-rule',question:"What's the next recycling pickup for Ascent Village, and where can I keep my bins?",context:[]},
 {id:'food-menu',family:'food-truck',question:'Which food truck is here today, and what is on its menu?',context:[]},
 {id:'pool-hours',family:'facility-status',question:'Is the pool open right now, and what are the regular hours?',context:[]},
 {id:'yoga-followup',family:'event-followup',question:'What about tomorrow?',context:[{question:'When is the next yoga class?'}]},
 {id:'shed-form',family:'rules-and-form',question:'What are the height rules for a backyard shed, and which application form do I use?',context:[]},
 {id:'lighting-followup',family:'rule-followup',question:'Can those stay up all year?',context:[{question:'What is the process to get permanent lights approved for seasonal/holiday use?'}]}
];
const variants=[{id:'current-local',current:true},
 {id:'sonnet-compose',models:{interpret:'claude-haiku-4-5',compose:'claude-sonnet-5',check:'claude-sonnet-5'}},
 {id:'opus-compose',models:{interpret:'claude-haiku-4-5',compose:'claude-opus-5',check:'claude-sonnet-5'}}];
function liveOptions(profile,{fetchImpl=fetch,clock=Date.now}={}){
 const adapters=createConnectorAdapters(profile),calendar=adapters.find(a=>a.family==='civicplus-calendar');
 return {liveRetrieve:createLiveEvidenceRetriever({profile,fetchImpl,clock}),current:{
  getCommunityEvents:request=>getCommunityEvents(request,{profile,adapter:calendar,fetchImpl,now:new Date(clock())}),
  getPoolStatus:()=>getCommunityPoolStatus({profile,fetchImpl,now:()=>new Date(clock())}),
  getWasteSchedule:options=>getWasteSchedule({...options,profile,fetchImpl,now:new Date(clock())}),
  getFoodTruckAnswer:(request,question)=>{
   const range=typeof request==='object'?request.dateRange:highConfidenceDateRange(question||request,new Date(clock()),profile.timezone);
   if(!range||range.start!==range.end)throw new Error('Comparison control needs a resolved single food-truck day');
   return getCommunityFoodTruckSchedule({dateRange:range},{profile,fetchImpl,now:new Date(clock())});
  }
 }};
}
module.exports={cases,variants,liveOptions};
