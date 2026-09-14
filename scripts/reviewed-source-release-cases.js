const { approvedActionIssues } = require('./reviewed-source-hosted-proof');
const actionDecisions = require('../data/community-source-approvals-v5.json').decisions;

const CASES = [
  { id: 'water-billing-contact', question: 'Who can help with my water bill?', positive: true, must: /833[\s)-]*772[\s-]*2240|amcobi/i },
  { id: 'landscape-inspection-process', question: 'How do I schedule a landscape inspection?', positive: true, must: /residentialinspections@sterlingranchcab\.com/i },
  { id: 'outdoor-water-method', question: 'What plant size should I use to calculate outdoor water usage?', positive: true, must: /full growth|matur/i, forbidden: /submit@sterlingranchdrc|\$\s*\d/ },
  { id: 'water-account-access', question: 'How do I see my water usage online?', positive: true, must: /utilityhawk|account|dashboard|portal/i, forbidden: /full growth|plant size|square foot/i },
  { id: 'dated-water-report', question: 'What did the 2026 water quality report find?', positive: true, must: /2025|2026/, also: /coliform|backflow|violation/i, forbidden: /water is safe (?:today|right now)|no violations/i },
  { id: 'dominion-report-identity', question: 'What did the Dominion water quality report say about its 2026 inspection violations?', positive: true, must: /Dominion/i, also: /2026/ },
  { id: 'castle-rock-report-identity', question: 'What monitoring violations did Castle Rock report for 2025?', positive: true, must: /Castle Rock/i, also: /2025/ },
  { id: 'compound-report-systems', question: 'What did the CAB, Dominion and Castle Rock water quality report say about violations?', positive: true, must: /CAB/i, also: /(?=[\s\S]*Dominion)(?=[\s\S]*Castle Rock)/i },
  { id: 'cab-report-year-boundary', question: 'What did the CAB water quality report say about coliform in 2024?', notVerified: true },
  { id: 'dominion-report-year-boundary', question: 'What did the Dominion water quality report say about inspection violations in 2025?', notVerified: true },
  { id: 'compound-report-year-boundary', question: 'What did the CAB and Dominion water quality report say about violations in 2025?', notVerified: true, forbidden: /2\/13\/2026|4\/24\/2026|F325|M610/ },
  { id: 'swapped-report-year-boundary', question: 'What did the CAB water quality report find in 2026 and Dominion find in 2025?', notVerified: true, forbidden: /January 15th, 2025|2\/13\/2026|4\/24\/2026/ },
  { id: 'distinct-report-years', question: 'What did the CAB water quality report find in 2025 and Dominion find in 2026?', positive: true, must: /January 15th, 2025/, also: /(?=[\s\S]*Dominion)(?=[\s\S]*2\/13\/2026)/i },
  { id: 'current-water-safety-boundary', question: 'Does the 2026 water report prove my drinking water is safe right now?', notVerified: true, forbidden: /(?:water is|it is|it's) safe (?:today|right now|to drink)/i },
  { id: 'internet-contact-boundary', question: 'What is the internet billing phone number?', notVerified: true, forbidden: /833[\s)-]*772[\s-]*2240|amcobi/i },
  { id: 'internet-support-boundary', question: 'Who do I contact about internet service?', notVerified: true, forbidden: /833[\s)-]*772[\s-]*2240|amcobi/i },
  { id: 'adopted-rule-and-process', question: 'Can I build a shed and where do I apply?', positive: true, must: /approv|review|application/i },
  { id: 'facility-booking', question: 'How do I reserve the Great Hall?', positive: true, requiredActionDecision: 'great-hall-booking-link', must: /reserv|book|rental|request/i },
  { id: 'great-hall-price-scope', question: 'How much does the Great Hall cost?', positive: true, must: /100/, forbidden: /pavilion|\$25\b/i },
  { id: 'pavilion-price-scope', question: 'How much does the North Pavilion cost?', positive: true, must: /25/, forbidden: /Great Hall|\$100\b/i },
  { id: 'nonresident-membership-scope', question: 'How much is nonresident clubhouse membership?', positive: true, must: /850/, forbidden: /Great Hall|pavilion|\$100\b|\$25\b/i },
  { id: 'non-resident-membership-variant', question: 'How much is non-resident membership?', positive: true, must: /850/, forbidden: /no additional cost|Great Hall|pavilion/i },
  { id: 'caregiver-pass-scope', question: 'What does the annual caregiver pass cost and who is eligible?', positive: true, must: /300/, also: /must be with the person|One caregiver can use the pass/i, forbidden: /850|Great Hall|pavilion/i },
  { id: 'guest-quantity-boundary', question: 'How many guest passes come with membership?', notVerified: true, forbidden: /(?:six|6|25) guest passes/i },
  { id: 'equipment-check-instructions', question: 'How can I check whether my Rachio watering schedule is running?', positive: true, must: /Rachio|schedule|tab/i },
  { id: 'equipment-live-status-boundary', question: 'Is my sprinkler running right now?', notVerified: true },
  { id: 'home-control-access-support', question: 'I lost access to home seer steward system. How do I restore it?', positive: true, must: /Lumiere\.technology\/help/i, also: /help@lumierefiber\.com/i },
  { id: 'mature-plant-method', question: 'How do I calculate the watering area for mature plants?', positive: true, must: /full growth|matur/i, forbidden: /\$\s*\d/ },
];

function answerIssues(body, item) {
  const text = [body.answer, body.directAnswer].filter(Boolean).join('\n');
  const errors = [];
  if (item.positive && body.confidence?.canAnswer !== true) errors.push(`Expected supported answer; received ${body.answerStatus}`);
  if (item.notVerified && body.answerStatus === 'verified') errors.push('Unsupported request was labeled fully verified');
  if (item.requiredActionDecision) errors.push(...approvedActionIssues(body, actionDecisions.find(decision => decision.decisionId === item.requiredActionDecision)));
  if (item.must && !item.must.test(text)) errors.push('Required source-supported detail absent');
  if (item.also && !item.also.test(text)) errors.push('Required finding absent');
  if (item.forbidden && item.forbidden.test(text)) errors.push('Unrelated, outdated, or overbroad detail present');
  if ((body.claims || []).some(claim => !claim.verified)) errors.push('Unverified claim returned');
  if ((body.sources || []).some(source => /\/DocumentCenter\/View\/(1456|2419)\//.test(source.sourceUrl || source.url || ''))) errors.push('Excluded historical source cited');
  return errors;
}
module.exports = { CASES, answerIssues };

