const { listOwnerMarkedQuestions } = require('../lib/rules-question-log');

async function main() {
  const items = await listOwnerMarkedQuestions((url, options) =>
    fetch(url, { ...options, signal: AbortSignal.timeout(20000) }));
  // Public workflow evidence contains counts only, never resident text or record IDs.
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    monitor: 'owner-marked-questions',
    completeHistory: true,
    pendingCount: items.length,
    reviewUrl: 'https://sterlingranchsociety.com/community-assistant/questions',
    marksChanged: false,
  }));
  if (items.length) {
    console.error('Owner-marked questions still require review in the private Questions page.');
    process.exitCode = 1;
  }
}

main().catch(() => {
  console.error('Owner-question monitoring could not finish. Check its private Notion connection; no marks were changed.');
  process.exitCode = 1;
});
