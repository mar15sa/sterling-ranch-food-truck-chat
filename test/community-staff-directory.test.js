const test=require('node:test');
const assert=require('node:assert/strict');
const {staffDirectoryRows}=require('../lib/community-staff-directory');
const url='https://alpha.gov/m/directory';
const person=(id,name,email)=>`<li class="list-group-item"><a href="/m/directory/employee?eid=${id}">${name}</a><div>Operations Manager</div><ul><li><a href="/m/directory/department?did=1">Resident Services</a></li></ul><a href="mailto:${email}">Email ${name}</a><a href="tel:720-555-0100,352">720-555-0100 Ext: 352</a></li>`;
test('staff directory preserves separate named people and nested departments',()=>{
 const rows=staffDirectoryRows(person(2,'Person One','one@alpha.gov')+person(3,'Person Two','two@alpha.gov'),url);
 assert.equal(rows.length,2);
 assert.equal(rows[0].subjectKey,'directory-person-2');
 assert.match(rows[0].text,/Departments: Resident Services/);
 assert.match(rows[0].text,/one@alpha.gov/);
 assert.doesNotMatch(rows[0].text,/two@alpha.gov/);
 assert.match(rows[0].text,/Ext: 352/);
 assert.match(rows[0].text,/Operations Manager/);
});
test('identical mobile and desktop department rows deduplicate but differing details remain',()=>{
 const row=email=>`<div class="directory-table-row"><div><a href="/m/directory/department?did=1">Resident Services</a></div><div><a href="mailto:${email}">${email}</a></div></div>`;
 assert.equal(staffDirectoryRows(row('one@alpha.gov').repeat(2),url).length,1);
 const changed=staffDirectoryRows(row('one@alpha.gov')+row('changed@alpha.gov'),url);
 assert.equal(changed.length,2);
 assert.equal(changed[0].subjectKey,changed[1].subjectKey);
});
test('unknown pages and ambiguous contact identities fall back without guessing',()=>{
 assert.equal(staffDirectoryRows(person(2,'Person One','one@alpha.gov'),'https://alpha.gov/unrelated'),null);
 assert.equal(staffDirectoryRows('<li class="list-group-item"><a href="mailto:one@alpha.gov">Email</a></li>',url),null);
});
