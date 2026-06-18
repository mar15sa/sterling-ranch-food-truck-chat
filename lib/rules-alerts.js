const ALERT_WEBHOOK_URL = process.env.RULES_ALERT_WEBHOOK_URL || "";
const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_API_KEY =
  process.env.RULES_ALERT_RESEND_API_KEY || process.env.RESEND_API_KEY || "";
const ALERT_EMAIL_TO = process.env.RULES_ALERT_EMAIL_TO || "";
const ALERT_EMAIL_FROM = process.env.RULES_ALERT_EMAIL_FROM || "";
const ALERT_EMAIL_SUBJECT_PREFIX =
  process.env.RULES_ALERT_EMAIL_SUBJECT_PREFIX ||
  "Sterling Ranch Rules Assistant alert";
const ALERT_COOLDOWN_MS = Number(process.env.RULES_ALERT_COOLDOWN_MS) || 1000 * 60 * 15;
const ALERT_WINDOW_MS = Number(process.env.RULES_ALERT_WINDOW_MS) || 1000 * 60 * 5;
const ABUSE_ALERT_THRESHOLD = Number(process.env.RULES_ABUSE_ALERT_THRESHOLD) || 10;
const LLM_REJECTION_ALERT_THRESHOLD =
  Number(process.env.RULES_LLM_REJECTION_ALERT_THRESHOLD) || 5;

const recentEvents = new Map();
const lastAlertedAt = new Map();

function pruneEvents(type, now = Date.now()) {
  const events = recentEvents.get(type) || [];
  const kept = events.filter((event) => now - event.at <= ALERT_WINDOW_MS);
  recentEvents.set(type, kept);
  return kept;
}

function recordEvent(type, detail = {}) {
  const now = Date.now();
  const events = pruneEvents(type, now);
  events.push({ at: now, detail });
  recentEvents.set(type, events);
  return events.length;
}

function shouldSendAlert(key, now = Date.now()) {
  const lastSent = lastAlertedAt.get(key) || 0;
  if (now - lastSent < ALERT_COOLDOWN_MS) return false;
  lastAlertedAt.set(key, now);
  return true;
}

function formatAlert(title, fields = {}) {
  const lines = [`Sterling Ranch Rules Assistant alert: ${title}`];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;
    lines.push(`${key}: ${String(value)}`);
  }
  return lines.join("\n");
}

function alertRecipients() {
  return ALERT_EMAIL_TO.split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

async function sendEmailAlert(title, text) {
  const recipients = alertRecipients();
  if (!RESEND_API_KEY || !ALERT_EMAIL_FROM || !recipients.length || typeof fetch !== "function") {
    return;
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: ALERT_EMAIL_FROM,
        to: recipients,
        subject: `${ALERT_EMAIL_SUBJECT_PREFIX}: ${title}`,
        text,
      }),
    });

    if (!response.ok) {
      console.warn(`Rules alert email failed: HTTP ${response.status}`);
    }
  } catch (error) {
    console.warn(
      `Rules alert email failed: ${error && error.message ? error.message : error}`
    );
  }
}

async function postAlert(text) {
  console.warn(text);

  if (ALERT_WEBHOOK_URL && typeof fetch === "function") {
    try {
      await fetch(ALERT_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
    } catch (error) {
      console.warn(
        `Rules alert webhook failed: ${error && error.message ? error.message : error}`
      );
    }
  }

  const title = text
    .split("\n")[0]
    .replace(/^Sterling Ranch Rules Assistant alert:\s*/i, "");
  await sendEmailAlert(title, text);
}

function sendAlert(key, title, fields = {}) {
  if (!shouldSendAlert(key)) return;
  postAlert(formatAlert(title, fields));
}

function recordRulesRateLimitBlocked(detail = {}) {
  const count = recordEvent("rate-limit-blocked", detail);
  if (count >= ABUSE_ALERT_THRESHOLD) {
    sendAlert("abuse-spike", "possible abuse spike", {
      blockedRequests: count,
      windowMinutes: Math.round(ALERT_WINDOW_MS / 60000),
      client: detail.clientKey,
    });
  }
}

function alertRulesRefreshFailed(error, detail = {}) {
  sendAlert("rules-refresh-failed", "rule source refresh failed", {
    reason: detail.reason,
    error: error && error.message ? error.message : error,
  });
}

function recordRulesLlmRejected(detail = {}) {
  const count = recordEvent("llm-rejected", detail);
  if (count >= LLM_REJECTION_ALERT_THRESHOLD) {
    sendAlert("llm-rejections", "LLM rewrites are being rejected often", {
      rejections: count,
      windowMinutes: Math.round(ALERT_WINDOW_MS / 60000),
      reason: detail.reason,
    });
  }
}

module.exports = {
  alertRulesRefreshFailed,
  recordRulesLlmRejected,
  recordRulesRateLimitBlocked,
};
