const test=require('node:test'), assert=require('node:assert/strict');
const {faqRows}=require('../lib/community-faq-records');
const row=(id,question,answer)=>`<li class="faq-question-item" id="question-${id}"><h3><button>${question}</button></h3><div class="accordion-text">${answer}</div></li>`;
test('FAQ records preserve nested answer lists and separate questions and action links',()=>{
 const rows=faqRows(row(1,'How do I apply?','<p>Contact apply@alpha.gov.</p><ul><li>Complete the form.</li><li><a href="/apply">Apply here</a></li></ul>')+row(2,'How do I pay?','<p>Contact billing@alpha.gov.</p><a href="/pay">Pay here</a>'),'https://alpha.gov/m/faq');
 assert.equal(rows.length,2);
 assert.match(rows[0].text,/Complete the form/);
 assert.doesNotMatch(rows[0].text,/billing/);
 assert.doesNotMatch(rows[0].html,/\/pay/);
 assert.equal(rows[1].subjectKey,'faq-question-2');
});
test('FAQ identity remains stable across category views while changed answers remain visible',()=>{
 const a=faqRows(row(1,'How do I apply?','Old instructions.'),'https://alpha.gov/m/faq?cat=1')[0];
 const b=faqRows(row(1,'How do I apply?','New instructions.'),'https://alpha.gov/FAQ.aspx?QID=1')[0];
 assert.equal(a.subjectKey,b.subjectKey);
 assert.notEqual(a.text,b.text);
 assert.equal(faqRows(row(1,'How?','Answer.').repeat(2),'https://alpha.gov/m/faq').length,1);
});
test('incomplete or unrelated FAQ layouts fall back without dropping unknown content',()=>{
 assert.equal(faqRows(row(1,'How?','Answer.'),'https://alpha.gov/other'),null);
 assert.equal(faqRows(row(1,'How?','Answer.')+row(2,'Where?',''),'https://alpha.gov/m/faq'),null);
});
