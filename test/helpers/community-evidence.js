const fs = require('node:fs');
const path = require('node:path');

const checkedInIndexPath = path.join(__dirname, '..', '..', 'data', 'community-index.json');

// Match the existing release bridge contract used by the source, retrieval,
// and answer-audit gates. Loading a fixture never renews or approves evidence.
function loadCommunityEvidenceFixture(environment = process.env) {
  const inputPath = environment.COMMUNITY_EVIDENCE_INDEX || checkedInIndexPath;
  return JSON.parse(fs.readFileSync(inputPath, 'utf8'));
}

module.exports = { loadCommunityEvidenceFixture };
