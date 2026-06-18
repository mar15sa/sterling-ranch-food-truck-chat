// Optional plain-English rewrite of a rules answer using Claude.
//
// This is grounded strictly in the rule sections the keyword search already
// found: Claude only rephrases those sections in plain English, it never adds
// rules of its own. Everything degrades gracefully — if ANTHROPIC_API_KEY is
// unset, the request fails, times out, or is refused, this returns null and the
// caller falls back to the built-in heuristic answer. No external dependency:
// it uses the global fetch built into Node 18+ (this project requires Node >= 20).

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const MODEL = process.env.RULES_LLM_MODEL || "claude-haiku-4-5";
const MAX_TOKENS = Number(process.env.RULES_LLM_MAX_TOKENS) || 600;
const TIMEOUT_MS = Number(process.env.RULES_LLM_TIMEOUT_MS) || 15000;
const MAX_SOURCES = 5;
const MAX_SECTION_CHARS = 1500;

const SYSTEM_PROMPT = [
  "You are a friendly, plain-spoken assistant for residents of Sterling Ranch, a Colorado community.",
  "A resident has asked a question about the community's rules. Using ONLY the rule sections provided below, answer in clear, everyday English — the way a helpful neighbor would explain it, not like a legal document.",
  "",
  "Rules for your answer:",
  "- Lead with a direct, plain answer to the question. Get to the point.",
  "- Translate legalese into plain words. Do not quote the rulebook verbatim.",
  "- Use only what the provided sections actually say. Never invent rules, numbers, fees, dates, or requirements.",
  "- If the sections don't fully answer the question, say what they do cover, and suggest checking the official rulebook or contacting the CAB.",
  "- You may mention a section number when it helps, but the reader sees the full list of sources separately, so don't list them all.",
  "- Keep it short: 2-4 sentences is ideal. Use a short \"- \" bulleted list only if it genuinely makes the answer clearer.",
  "- If the answer involves doing something that may need approval, a permit, or a fee, or could otherwise have consequences, end with a final line that begins exactly with \"Before you act:\" followed by one sentence of practical caution.",
  "- This is general help, not legal advice. Do not mention that you are an AI. Reply with only the answer: no preamble, no restating the question, no meta-commentary.",
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
        .join(" — ");
      const body = String(source.text || source.excerpt || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_SECTION_CHARS);
      return `[${index + 1}] ${label}\n${body}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

async function rewriteAnswerWithLLM(question, sources) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (typeof fetch !== "function") return null;
  if (!question || !Array.isArray(sources) || !sources.length) return null;

  const sourcesBlock = buildSourcesBlock(sources);
  if (!sourcesBlock) return null;

  const userContent =
    `A Sterling Ranch resident asks:\n${question}\n\n` +
    `Rule sections that may be relevant:\n\n${sourcesBlock}`;

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
      return null;
    }

    const data = await response.json();
    if (data.stop_reason === "refusal") return null;

    const text = Array.isArray(data.content)
      ? data.content
          .filter((block) => block && block.type === "text" && typeof block.text === "string")
          .map((block) => block.text)
          .join("")
          .trim()
      : "";

    return text || null;
  } catch (error) {
    console.warn(`Rules LLM error: ${error && error.message ? error.message : error}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { rewriteAnswerWithLLM };
