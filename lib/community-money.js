// Retain written multipliers when comparing amounts; pricing units are separate.
const MONEY_PATTERN = /\$\d[\d,]*(?:\.\d+)?(?:\s+(?:thousand|million|billion|trillion)\b)?(?:\s*(?:per|\/)\s*(?:hour|month|unit|person|day|event|1,000 gallons?))?/gi;

function moneyAmount(value) {
  const match = String(value || '').match(/^\$?\s*(\d[\d,]*(?:\.\d+)?)(?:\s+(thousand|million|billion|trillion)\b)?/i);
  if (!match) return NaN;
  const scale = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 }[match[2]?.toLowerCase()] || 1;
  return Number(match[1].replace(/,/g, '')) * scale;
}

module.exports = { MONEY_PATTERN, moneyAmount };
