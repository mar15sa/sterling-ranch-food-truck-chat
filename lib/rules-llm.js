// Optional plain-English rewrite of a rules answer using Claude.
//
// This is grounded strictly in the rule sections the keyword search already
// found: Claude only rephrases those sections in plain English, it never adds
// rules of its own. Everything degrades gracefully: if ANTHROPIC_API_KEY is
// unset, the request fails, times out, or is refused, this returns null and the
// caller falls back to the built-in heuristic answer. No external dependency:
// it uses the global fetch built into Node 18+ (this project requires Node >= 20).

const { llmRewriteIssues } = require("./rules-grounding");
const { recordRulesLlmRejected } = require("./rules-alerts");

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const MODEL = process.env.RULES_LLM_MODEL || "claude-haiku-4-5";
const MAX_TOKENS = Number(process.env.RULES_LLM_MAX_TOKENS) || 600;
const TIMEOUT_MS = Number(process.env.RULES_LLM_TIMEOUT_MS) || 15000;
const MAX_SOURCES = 5;
const MAX_SECTION_CHARS = 6000;
const CACHE_TTL_MS = Number(process.env.RULES_LLM_CACHE_TTL_MS) || 1000 * 60 * 30;
const MAX_CACHE_ENTRIES = Number(process.env.RULES_LLM_CACHE_MAX) || 100;

const rewriteCache = new Map();

const SYSTEM_PROMPT = [
  "You are a friendly, plain-spoken assistant for residents of Sterling Ranch, a Colorado community.",
  "A resident asked a question about the community's rules. You are rewriting an already-grounded draft answer in clear, everyday English. The draft answer is the source of truth.",
  "The community's governing body is the Sterling Ranch Community Authority Board, called the CAB. Refer to it by that exact name only; it is not an \"Architectural Board\" or anything else.",
  "",
  "What to say:",
  "- Lead with a direct, plain answer. Get to the point.",
  "- Translate legalese into plain words. Don't quote the rulebook verbatim.",
  "- Preserve every fact, number, fee, date, deadline, approval requirement, exception, and consequence from the draft answer.",
  "- Use the provided sections only to verify the draft. Never invent rules, numbers, fees, dates, names, or requirements.",
  "- If the draft gives exact amounts or dates, keep them exact. Do not use about, around, roughly, or approximately.",
  "- If the draft says \"approved non-seasonal settings,\" keep that phrase. Do not change it to turning lights off unless the draft itself says that.",
  "- If the sections don't fully answer the question, say what they do cover and suggest checking the official rulebook or contacting the CAB.",
  "- You can mention a section number when it helps, but the reader sees the full source list separately, so don't list them all.",
  "- Keep it short: 2 to 4 sentences. Use a short \"- \" bulleted list only if it genuinely makes things clearer.",
  "- Start with exactly \"Short answer:\".",
  "- If the draft includes \"What I found:\", keep a \"What I found:\" section with at least one \"- \" bullet.",
  "- If the draft includes a \"Before you act:\" line, keep a final line that begins exactly with \"Before you act:\".",
  "",
  "How to write it (this matters):",
  "- Sound like a real person. Use contractions (you'll, don't, it's).",
  "- Never use em dashes. Use commas, periods, colons, or parentheses instead.",
  "- Write plain sentences with no Markdown or formatting symbols: no asterisks for bold (no \"**\"), no \"#\" headings. For a short list, start each line with \"- \".",
  "- Plain words only. Don't use AI or corporate filler such as: leverage, utilize, robust, straightforward, comprehensive, ensure, it's important to note, furthermore, additionally, moreover.",
  "- Don't negate one framing to assert another (no \"it's not just X, it's Y\" and no \"not X, but Y\"). State the point directly.",
  "- Numbers as digits. Vary sentence length. No preamble, no restating the question, no meta-commentary.",
  "- This is general help, not legal advice. Don't mention that you are an AI.",
].join("\n");

function buildSourcesBlock(sources) {
  return sources
    .slice(0, MAX_SOURCES)
    .map((source, index) => {
      const label = [
        source.title,
        [source.chapter, source.article].filter(Boolean).join(" · "),
      ]
        .filter(Boolean)
        .join(" | ");
      const body = String(source.text || source.excerpt || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_SECTION_CHARS);
      return `[${index + 1}] ${label}\n${body}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

// Belt-and-suspenders cleanup of the model's text: even with the prompt asking
// for none of this, models occasionally emit em dashes or Markdown. Strip them
// deterministically so the plain-text UI never shows a stray "—" or "**".
function sanitizeAnswer(text) {
  return String(text || "")
    .replace(/\s*—\s*/g, ", ") // em dash -> comma
    .replace(/\s*–\s*/g, "-") // en dash -> hyphen
    .replace(/\*\*/g, "") // **bold** markers
    .replace(/__/g, "") // __bold__ markers
    .replace(/^[ \t]*#{1,6}\s+/gm, "") // # headings
    .replace(/^[ \t]*[*•]\s+/gm, "- ") // normalize bullets to "- "
    .replace(/^(Before you act:\s*)([a-z])/gim, (_, label, letter) => `${label}${letter.toUpperCase()}`)
    .replace(/[ \t]{2,}/g, " ") // collapse doubled spaces left by replacements
    .trim();
}

function normalizeCachePart(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function cacheKeyFor(question, draftAnswer, sources) {
  const sourceIds = sources
    .slice(0, MAX_SOURCES)
    .map((source) => source.nodeId || source.sourceUrl || source.title || "")
    .join("|");
  return [normalizeCachePart(question), normalizeCachePart(draftAnswer), sourceIds].join("\n");
}

function getCachedRewrite(key) {
  const cached = rewriteCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.savedAt > CACHE_TTL_MS) {
    rewriteCache.delete(key);
    return null;
  }
  return cached.text;
}

function setCachedRewrite(key, text) {
  if (!CACHE_TTL_MS || CACHE_TTL_MS < 0) return;
  if (rewriteCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = rewriteCache.keys().next().value;
    if (oldestKey) rewriteCache.delete(oldestKey);
  }
  rewriteCache.set(key, { text, savedAt: Date.now() });
}

async function rewriteAnswerWithLLM(question, draftAnswer, sources) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (typeof fetch !== "function") return null;
  if (!question || !Array.isArray(sources) || !sources.length) return null;
  if (!draftAnswer) return null;

  const sourcesBlock = buildSourcesBlock(sources);
  if (!sourcesBlock) return null;

  const cacheKey = cacheKeyFor(question, draftAnswer, sources);
  const cached = getCachedRewrite(cacheKey);
  if (cached) return cached;

  const userContent =
    `A Sterling Ranch resident asks:\n${question}\n\n` +
    `Draft answer to rewrite. Preserve its facts exactly:\n${draftAnswer}\n\n` +
    `Cited rule sections for verification only:\n\n${sourcesBlock}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(`Rules LLM request failed: HTTP ${response.status}`);
      recordRulesLlmRejected({ reason: `http-${response.status}` });
      return null;
    }

    const data = await response.json();
    if (data.stop_reason === "refusal") {
      recordRulesLlmRejected({ reason: "model-refusal" });
      return null;
    }

    const text = Array.isArray(data.content)
      ? data.content
          .filter((block) => block && block.type === "text" && typeof block.text === "string")
          .map((block) => block.text)
          .join("")
          .trim()
      : "";
    const cleaned = sanitizeAnswer(text);
    if (!cleaned) return null;

    const issues = llmRewriteIssues(cleaned, draftAnswer, sources);
    if (issues.length) {
      console.warn(`Rules LLM rewrite rejected: ${issues.join("; ")}`);
      recordRulesLlmRejected({ reason: issues[0] });
      return null;
    }

    setCachedRewrite(cacheKey, cleaned);
    return cleaned;
  } catch (error) {
    console.warn(`Rules LLM error: ${error && error.message ? error.message : error}`);
    recordRulesLlmRejected({
      reason: error && error.message ? error.message : "request-error",
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { rewriteAnswerWithLLM };
