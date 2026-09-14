const approvals = require('./community-source-approvals-v7.json');

const decision = approvals.decisions[0];
const version = decision.versions[0];

function reviewedFact(id, value, approvalClaim, facet, scopeKey, type = 'information') {
  return {
    id,
    type,
    value,
    context: value,
    facet,
    scopeKey,
    approvalClaim,
    reviewDecisionId: decision.decisionId,
    reviewStatus: 'approved',
    reviewedBy: 'owner',
    reviewedAt: approvals.decidedAt,
  };
}

function reviewedAction() {
  const proof = decision.approvedActions[0];
  return {
    id: 'open-pickleball-courtreserve',
    label: proof.display.label,
    url: proof.evidence.url,
    context: proof.display.label,
    actionType: proof.display.actionType,
    evidence: proof.evidence,
    approvalClaim: 'pickleball-courtreserve-route',
    reviewDecisionId: decision.decisionId,
    reviewStatus: 'approved',
    reviewedBy: 'owner',
    reviewedAt: approvals.decidedAt,
  };
}

function buildApprovedV7Sources() {
  const facts = [
    reviewedFact('pickleball-general-hours', 'The pickleball courts are open weekdays from 7 a.m. to dusk and weekends from 8 a.m. to dusk.', 'pickleball-general-hours', 'facility-hours', 'general-hours', 'time'),
    reviewedFact('pickleball-location-parking-pets', 'The courts are at Sterling Ranch Avenue and Middle Fork Street. Free street parking is available nearby, and pets are not allowed inside the courts.', 'pickleball-location-parking-pets', 'information', 'location-parking-pets'),
    reviewedFact('pickleball-play-modes-daily-limit', 'The courts allow reservations and drop-in play. Court reservations are limited to two hours per day through CourtReserve.', 'pickleball-play-modes-daily-limit', 'reservation-policy', 'play-modes-daily-limit', 'limit'),
    reviewedFact('pickleball-advance-booking-limits', 'Residents can reserve up to seven days in advance. Nonresidents can reserve up to three days in advance.', 'pickleball-advance-booking-limits', 'reservation-policy', 'advance-booking-limits', 'limit'),
    reviewedFact('pickleball-current-prices', 'Pickleball is free for residents. The nonresident price is $40 per court for up to four players, or $20 for two nonresident players during open play.', 'pickleball-current-prices', 'fee', 'resident-nonresident-prices', 'money'),
    reviewedFact('pickleball-open-play-hours', 'Open play is Monday through Friday from 7–11 a.m. and 5–8 p.m., and Saturday and Sunday from 8–11 a.m. and 5–8 p.m.', 'pickleball-open-play-hours', 'facility-hours', 'open-play-hours', 'time'),
    reviewedFact('pickleball-reservation-hours', 'Reservation hours are 11 a.m.–5 p.m. every day.', 'pickleball-reservation-hours', 'reservation-policy', 'reservation-hours', 'time'),
    reviewedFact('pickleball-program-precedence', 'Sterling Ranch CAB tournaments and lessons take precedence over ordinary play.', 'pickleball-program-precedence', 'restriction', 'program-precedence'),
    reviewedFact('pickleball-equipment-guidance', 'Players must bring their own paddles and balls and wear tennis or court shoes.', 'pickleball-equipment-guidance', 'restriction', 'equipment-guidance'),
    reviewedFact('pickleball-court-use-restrictions', 'The courts are for pickleball and personal play only. Paid or private events are prohibited. Bikes, skateboards, pets, ball machines, generators, chairs, tables, and glass items are not allowed on the courts.', 'pickleball-court-use-restrictions', 'restriction', 'court-use-restrictions'),
    reviewedFact('pickleball-weather-snow-guidance', 'Courts may be slippery when wet. Snow shoveling is prohibited, and gates are locked when the courts are snow-covered.', 'pickleball-weather-snow-guidance', 'restriction', 'weather-snow-guidance'),
    reviewedFact('pickleball-child-supervision', 'Children under 13 must have a Sterling Ranch resident age 16 or older present.', 'pickleball-child-supervision', 'restriction', 'child-supervision'),
    reviewedFact('pickleball-rotation-etiquette', 'When courts are full, games are limited to 11 points and players rotate using the paddle rack. Groups of four take priority, and challenge play is not allowed while others are waiting.', 'pickleball-rotation-etiquette', 'restriction', 'rotation-etiquette'),
    reviewedFact('pickleball-contact-number', 'For pickleball-court questions, call Sterling Ranch CAB at 720-728-7257.', 'pickleball-contact-number', 'contact', 'pickleball-contact', 'phone'),
  ];
  return [{
    id: 'approved-pickleball-current-operations',
    communityId: approvals.communityId,
    title: 'Pickleball Courts',
    sourceUrl: version.canonicalUrl,
    sourceType: 'facilities',
    connectorType: 'civicplus-pages',
    authorityClass: 'official-page',
    authorityScore: 1,
    text: facts.map((fact) => fact.value).join(' '),
    excerpt: facts.map((fact) => fact.value).join(' '),
    facts,
    actions: [reviewedAction()],
    contentHash: version.contentHash,
    hashScheme: version.hashScheme,
    checkedAt: approvals.decidedAt,
    staleAfter: approvals.decidedAt,
    lifecycle: 'current',
    reviewStatus: 'candidate',
  }];
}

module.exports = { approvals, buildApprovedV7Sources };
