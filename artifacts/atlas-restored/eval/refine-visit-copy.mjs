import fs from 'node:fs';
import {mergeCatalog} from '../catalog.mjs';
const root=new URL('../data/',import.meta.url),read=n=>JSON.parse(fs.readFileSync(new URL(n+'.json',root)));
const catalog=mergeCatalog(read('places'),read('directory'),read('visitor-notes'),read('area-visit'));
const replacements=new Map([
 ['Verify restrooms, shade, parking, play ages and accessible route before displaying badges.','Restrooms, shade, parking, play ages and accessible routes are not confirmed.'],
 ['Current exact-location hours and closure notices?','Check the operator for holiday hours or temporary closures.'],
 ['Direct menu/order/booking link and useful visit details?','Same-day menus and availability may change; check the operator before visiting.'],
 ['Verify current access, exact position within the parent and relevant visit details.','The exact location within the parent property has not been confirmed.'],
 ['Confirm current location, access and useful visit details.','The exact entrance and current availability have not been confirmed.'],
 ['Obtain official segment geometry; distinguish habitat from public trail.','Public trail segments and their exact routes remain unconfirmed.'],
 ['Is this the same project, or a component of Medley Park? Keep separate until confirmed.','Its relationship to Medley Park has not been confirmed.'],
 ['Confirm map label and boundary placement; do not add visitor directions.','The mapped boundary and visitor access remain unconfirmed.'],
 ['Accessible entrances, parking and tenant-specific wayfinding?','Accessible entrances, parking and directions to individual tenants remain unconfirmed.'],
 ['Current event and food-truck schedule?','Check the calendar for date-specific events and food trucks.'],
 ['Which seating or gathering spaces require reservations?','Reservation requirements for individual gathering spaces are unconfirmed.'],
 ['Which segments and crossing are actually open?','Current conditions at individual trail segments and crossings are unconfirmed.'],
 ['Which areas require resident access?','Check individual amenities for access restrictions and guest arrangements.'],
 ['Current fitness hours, class schedule, guest passes and rental process?','Fitness schedules and guest arrangements should be checked with CAB before a visit.'],
 ['Distinguish developer welcome desk from CAB resident-service hours.','The welcome desk and CAB service counter may keep different hours.'],
 ['Exact public entrance/address and offered age programs?','Visitor entry and available programs should be confirmed with the school.'],
 ['Visitor/leasing entrance and resident guest rules?','Confirm the leasing entrance and guest rules with the apartment operator.'],
 ['Visitor/leasing entrance and guest rules?','Confirm the leasing entrance and guest rules with the apartment operator.'],
 ['Which facilities are open and who may use them?','Confirm the availability and access rules for the specific amenity with the operator.'],
 ['Does the older map location still apply?','The older map location has not been freshly confirmed.'],
]);
for(const file of ['visit-parks','visit-business']){
 const data=read(file);
 for(const [id,p] of Object.entries(data.places)){
  const previous=catalog.find(x=>x.id===id);
  p.unknowns=(p.unknowns||previous?.unknowns||[]).map(s=>replacements.get(s)||s);
  if(p.visit.actions){p.actions=p.visit.actions;delete p.visit.actions;}
  if(id==='atlas-coffee'||id==='salta'){
   p.unknowns=['Check the operator for holiday hours, the current menu and same-day availability.'];
   p.visitNotes=[];p.facts=[];
  }
 }
 fs.writeFileSync(new URL(file+'.json',root),JSON.stringify(data,null,2)+'\n');
}
