const APPROVAL_TIME = '2026-09-09T21:44:12.406Z';
const STALE_AFTER = '2026-09-10T21:44:12.406Z';
const POOL_URL = 'https://sterlingranchcab.com/187/Pool';
const DRC_URL = 'https://sterlingranchcab.com/175/Design-Review';
const DIRECTORY_URL = 'https://sterlingranchcab.com/201/Design-Review-Documents';
const WATER_FAQ_URL = 'https://sterlingranchcab.com/m/faq?cat=16';

const versions = {
  pool: '14b45b6b4f23a88e324faa20e50db7ca149a7348c8d164d3935cd6a1b17bb8f0',
  drc: '863438e8fbeacb8b43ef4d128f216eb9e6b83fca7388e7189e9810842f548191',
  directory: '09c149f72138b58d6b926fc7fa8c0eb0958b656a7e4848b89cbd90f044608c8b',
  monitoring: '5778ae7799053e4aaf8bb7fa0935e6636149d7abe1230ad20681c7c99b3dd514',
};

const drcText = 'Design Review. To have your request reviewed, submit to the DRC a completed Application via email to ResidentSubmit@SterlingRanchCAB.com or dropped it off during office hours at the Resident Resource Center. All submittals must be received by end of the business day on the Friday prior to a DRC meeting.';

function sourceBase(id, title, sourceUrl, contentHash, text, sourceType = 'services') {
  return { id, communityId: 'sterling-ranch', title, sourceUrl, sourceType, connectorType: 'civicplus-pages', authorityScore: 1, text, excerpt: '', actions: [], facts: [], contentHash, checkedAt: APPROVAL_TIME, staleAfter: STALE_AFTER, lifecycle: 'current', reviewStatus: 'candidate' };
}
function claim(id, context, approvalClaim, reviewDecisionId, type = 'information', value = context) {
  return { id, type, value, context, approvalClaim, reviewDecisionId, sourceVersion: '', reviewStatus: 'approved', reviewedBy: 'owner', reviewedAt: APPROVAL_TIME };
}
function action(id, label, url, context, approvalClaim, reviewDecisionId) {
  return { id, label, url, context, actionType: 'information', approvalClaim, reviewDecisionId, sourceVersion: '', reviewStatus: 'approved', reviewedBy: 'owner', reviewedAt: APPROVAL_TIME };
}

function buildApprovedSources(index) {
  const poolPage = (index.pages || []).find((page) => page.canonicalUrl === POOL_URL && page.contentHash === versions.pool);
  const poolParts = (index.sources || []).filter((source) => source.sourceUrl === POOL_URL && /^sterling-ranch-overlook-outdoor-pool-[12]$/.test(source.id));
  const directory = (index.sources || []).find((source) => source.sourceUrl === DIRECTORY_URL && source.contentHash === versions.directory);
  const monitoring = (index.sources || []).find((source) => source.sourceUrl === WATER_FAQ_URL && source.contentHash === versions.monitoring);
  if (!poolPage || poolParts.length !== 2 || !directory || !monitoring) throw new Error('Approved source version is unavailable; do not project its claims.');
  const poolHours = 'The pool is open Memorial Day weekend through Labor Day. Monday-Friday: 5:00 am - 9:00 am: Lap Swim. Tuesday & Thursday - 7:00 am - 8:45 am: Pool cleaning and maintenance. 9:00 am - 8:45 pm: Open Swim. School back in session: Lifeguard hours are 4:00 pm - 8:45 pm. Saturday: 7:00 am - 8:45 pm. Sunday: 7:00 am - 8:45 pm.';
  const pool = sourceBase('approved-pool-hours-current-page', 'Overlook Outdoor Pool hours', POOL_URL, versions.pool, poolHours, 'facilities');
  pool.facts = [claim('pool-regular-hours', poolHours, 'pool-season-and-regular-hours', 'pool-hours-current-page', 'schedule')];
  const drc = sourceBase('approved-drc-contact-current', 'Design Review contact and submission', DRC_URL, versions.drc, drcText, 'forms');
  drc.facts = [
    claim('drc-email', 'Submit a completed application by email to ResidentSubmit@SterlingRanchCAB.com.', 'drc-email', 'drc-contact-current', 'email', 'ResidentSubmit@SterlingRanchCAB.com'),
    claim('drc-general-submission', 'A completed application may be emailed or dropped off during office hours at the Resident Resource Center.', 'drc-general-submission-method', 'drc-contact-current'),
    claim('drc-friday-deadline', 'All submittals must be received by the end of the business day on the Friday before a DRC meeting.', 'drc-friday-deadline', 'drc-contact-current'),
  ];
  const directorySource = sourceBase('approved-drc-application-directory', 'Design Review applications and forms', DIRECTORY_URL, versions.directory, directory.text, 'forms');
  directorySource.actions = [action('open-drc-directory', 'Open Design Review applications and forms', DIRECTORY_URL, 'Open the official Design Review applications and forms directory.', 'drc-application-directory', 'drc-contact-current')];
  const rainDrc = sourceBase('approved-rain-barrel-conditional-submission', 'Rain-barrel conditional DRC submission', DRC_URL, versions.drc, drcText, 'forms');
  rainDrc.facts = [claim('rain-barrel-general-submission', 'If the controlling rain-barrel rule says approval is needed, submit the completed application by email to ResidentSubmit@SterlingRanchCAB.com or drop it off during office hours at the Resident Resource Center.', 'rain-barrel-conditional-drc-submission', 'rain-barrel-conditional-submission')];
  const rainDirectory = sourceBase('approved-rain-barrel-conditional-directory', 'Rain-barrel application directory', DIRECTORY_URL, versions.directory, directory.text, 'forms');
  rainDirectory.actions = [action('open-rain-barrel-directory', 'Open Design Review applications and forms', DIRECTORY_URL, 'If the controlling rain-barrel rule says approval is needed, open the official Design Review applications and forms directory. Choose the correct form with the DRC; this source does not identify a rain-barrel form.', 'rain-barrel-conditional-application-directory', 'rain-barrel-conditional-submission')];
  const monitoringText = 'Go to https://srcab.utilityhawk.us, select Registration, and follow the instructions to register. UtilityHawk lets residents set monthly dollar thresholds for water and irrigation usage; set daily, weekly, or monthly usage thresholds and receive trend notifications; receive alerts when problems are detected; and choose text, email, or phone alerts.';
  const water = sourceBase('approved-utilityhawk-water-monitoring-2026', 'UtilityHawk water-usage monitoring', WATER_FAQ_URL, versions.monitoring, monitoringText);
  water.facts = [
    claim('utilityhawk-registration', 'Go to https://srcab.utilityhawk.us, select Registration, and follow the instructions to register.', 'utilityhawk-water-monitoring-registration', 'utilityhawk-water-monitoring-2026'),
    claim('utilityhawk-capabilities', 'UtilityHawk lets residents set monthly dollar thresholds for water and irrigation usage; set daily, weekly, or monthly usage thresholds and receive trend notifications; receive alerts when problems are detected; and choose text, email, or phone alerts.', 'utilityhawk-water-monitoring-capabilities', 'utilityhawk-water-monitoring-2026'),
  ];
  return [pool, drc, directorySource, rainDrc, rainDirectory, water];
}
module.exports = { APPROVAL_TIME, buildApprovedSources, versions };
