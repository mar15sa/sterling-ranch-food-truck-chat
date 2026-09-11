#!/usr/bin/env node
/*
 * Keep resident facts in reviewed source projections, not in answer code.
 *
 * This deliberately inspects only fields that flow into a resident answer.
 * It is not a repository-wide word search: parser/configuration strings and
 * source-processing code are outside its scope.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const RESPONSE_FILES = [
  "lib/community-assistant.js",
  "lib/community-food-trucks.js",
  "lib/community-proactive.js",
  "lib/rules-assistant.js",
  "lib/rules-focused-answers.js",
];

const BASELINE_PATH = path.join(__dirname, "..", "data", "community-resident-literal-baseline.json");

const RESPONSE_FIELDS = new Set(["directAnswer", "answer", "nextStep", "keyDetails", "label", "url"]);
const DYNAMIC_PRESENTATION_FIELDS = new Set(["label", "url", "keyDetails"]);

// These are source-independent interface sentences. Additions need review: a
// resident fact belongs in a source claim/action projection instead.
const GENERIC_COPY = new Set([
  "I can’t currently confirm the access requirements from exact owner-approved claims.",
  "I could not verify an answer from approved, up-to-date community sources.",
  "I could not confirm Sec.  from the current official source, so I won't substitute a different section.",
  "Check the official source for the current section wording or try the section title.",
  "I could not verify a current pickup date from the live collection service.",
  "I could not verify that from the connected official community sources.",
  "I found conflicting values in the connected official sources, so I can’t safely choose one for you.",
  "I can help with community questions, but I can’t follow instructions that try to change my safeguards or reveal private information.",
  "What would you like to know about the community?",
  "Hi! Ask me about community rules, services, forms, facilities, events, or current status.",
  "What would you like help with in the community?",
  "What would you like permission or help to do?",
  "I could not check the live food-truck schedule just now.",
  "I could not check the official community calendar just now.",
  "Open the official community source below for the current information.",
  "Check the community’s official website or contact its current resident-support team.",
  "Check the controlling official page below while its information is being reconfirmed.",
  "Check the controlling official page below while its access instructions are being reconfirmed.",
  "The latest refresh failed, so this may be an older status.",
  "The schedule may not be posted yet. Check the official calendar before making plans.",
  "The official facility page is awaiting a fresh source check.",
  "I found a relevant official section, but I could not extract its current date, amount, or limit safely.",
  "I don't have enough rulebook evidence to answer that confidently.",
  "I don't have enough rulebook evidence to give a definite answer. These sections look like the closest starting points.",
  "The official material I found does not explicitly confirm whether the requested list exists, so I won't treat a search miss as proof that it is unavailable.",
  "Open the linked official source to confirm the current resource.",
  "Chapter  appears to cover .",
  " I pulled the changing dates, amounts, and limits from the current controlling source below.",
  "I pulled the controlling dates, amounts, and limits from the current official source below.",
  "Use the selected official community contact source rather than an unrelated service number.",
  "Check the community’s official website for the current contact source.",
  "Try adding the service, facility, form, or rule you mean, or use the official community website below.",
  "Open the official facility page below for the latest hours and closure notices before you go.",
  "Check the official facility page for current closure notices before you go.",
  "Open the official calendar below before making plans.",
  "Use the official calendar below before making plans.",
  "Open the calendar or one of the listed events to review the full details.",
  "Open the official calendar below to check for newly added events.",
  "Open an event link below for its full details and any registration instructions.",
  "Add that detail and I’ll check the appropriate official source.",
  "I could not verify the application or submission step from an exact owner-approved action source. Use the controlling rule below while that process is confirmed.",
  "Ask about a community rule, service, form, facility, event, or current status instead.",
  "I can verify official community information, but I can’t reliably identify or describe a person from the rulebook.",
  "Open the linked official section and confirm the current detail before acting.",
  "I could not verify whether the requested detail is covered by the selected official source.",
  "Open the linked official section if you need the complete wording.",
  "Use these current source details for planning, and open the linked section if you need the complete wording.",
  "Use the linked sections to find the exact rule language, especially if you are planning a project or submitting something for review.",
  "Use the linked sections to confirm the exact details in the official rulebook.",
  "Use the linked section to confirm the contact detail is current before relying on it.",
  "Try asking with a more specific object or action, or check the official rulebook for an answer.",
  "Try rephrasing with more detail, open the linked sections, or confirm through the official process before acting.",
  "I could not find a local rulebook index yet. Please refresh the source index, then try the question again.",
  "The approved evidence for this source does not cover that request.",
  "Open the linked official CAB website to confirm the current service details.",
  "Do you mean using a community court or building a private court at a home?",
  "Tell me which court you mean so I can use the matching official source.",
  "Confirm which cited fence type applies before using the matching finish.",
  "What would you like to know or do?",
  "Tell me the question, task, or problem you want help with.",
  "Use the applicable source path below for your situation.",
  "These are the published hours for that weekday.",
  "The official source does not say whether that placement is allowed.",
  "The cited source does not confirm whether the requested plant is included.",
]);

// These are the fixed portions of dynamic, source-independent answer frames.
// They never supply a community fact: the value after interpolation must still
// come from the selected reviewed source or the resident's question.
const GENERIC_DYNAMIC_COPY = new Set([
  "The selected official rules do not name  specifically.",
  "The official passage I found mentions  only as an example in a different rule, so it does not establish whether the project itself is allowed.",
  "The selected official passages do not state whether  removal is allowed.",
  "The cited official rule restricts this:",
  "The cited official rule requires a specific step:",
  "The cited official rule says:",
  "Allowed choices from the selected source:",
  "Allowed:",
  "No.",
  "Yes.",
  "No. The requested time is inside the restricted window:",
  "Yes, temporarily.",
  "The current cited rule does not set the requested numeric maximum.",
  "The current cited rule does not set a numeric maximum height for the .",
  "The controlling source does not specify the requested detail.",
  "The selected controlling source does not give a specific curb-placement or removal time.",
  "Fence height depends on the fence type and lot. The selected standard says",
  "No. The requested stay of  exceeds the source-derived -hour limit.",
  "The selected official passages establish maintenance responsibility, but they do not state who owns .",
  "The selected official passages describe , but they do not state whether the resident choice in the question is required or allowed.",
  "Chapter  is the  chapter. It includes .",
  "Prohibited under the cited rule:",
  "Allowed under the cited exception:",
  "The selected source does not address reimbursement.",
  "The rulebook search does not define  or publish current access details.",
  "Open the linked official resource for .",
  "The published fee section lists",
  "The approved source does not publish separate  hours, so I can’t verify that its regular  schedule applies on .",
  "The approved source does not publish hours specifically for , so I can’t verify the holiday schedule.",
  "The approved source does not publish separate  hours, so I can’t verify the holiday schedule for .",
  "It is listed as  tall with a spread of .",
  "It is listed as .",
  "tall",
  "a spread of",
  "deep",
  "long",
]);

function isTernaryControlLiteral(tokens, index) {
  // A literal immediately followed by `?` is the value being compared in a
  // conditional expression (for example, `reason === "person-identity" ?`).
  // It selects an answer branch; it is not itself resident-facing copy.
  return tokens[index]?.type === "string" && tokens[index + 1]?.value === "?";
}

function lineAt(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function readString(source, start) {
  const quote = source[start];
  if (!['"', "'", "`"].includes(quote)) return null;
  let value = "";
  let dynamic = false;
  let index = start + 1;
  for (; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\") { value += source[index + 1] || ""; index += 1; continue; }
    if (quote === "`" && char === "$" && source[index + 1] === "{") {
      const expression = skipTemplateExpression(source, index + 2);
      if (expression == null) return null;
      dynamic = true;
      // The loop advances once more before reading the next template byte.
      index = expression - 1;
      continue;
    }
    if (char === quote) return { value, end: index + 1, dynamic };
    value += char;
  }
  return null;
}

function skipRegex(source, start) {
  let inClass = false;
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === "\\") { index += 1; continue; }
    if (source[index] === "[") inClass = true;
    if (source[index] === "]") inClass = false;
    if (source[index] === "/" && !inClass) {
      index += 1;
      while (/[A-Za-z]/.test(source[index] || "")) index += 1;
      return index;
    }
    if (source[index] === "\n" || source[index] === "\r") return null;
  }
  return null;
}

function skipTemplateExpression(source, start) {
  let depth = 1;
  let index = start;
  let previous = null;
  while (index < source.length && depth) {
    if (/\s/.test(source[index])) { index += 1; continue; }
    if (source.startsWith("//", index)) { index = source.indexOf("\n", index + 2); if (index < 0) return null; continue; }
    if (source.startsWith("/*", index)) { index = source.indexOf("*/", index + 2); if (index < 0) return null; index += 2; continue; }
    const literal = readString(source, index);
    if (literal) { index = literal.end; previous = "value"; continue; }
    if (source[index] === "/" && canStartRegex(previous)) {
      const end = skipRegex(source, index);
      if (end == null) return null;
      index = end;
      previous = "value";
      continue;
    }
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    previous = source[index];
    index += 1;
  }
  return depth === 0 ? index : null;
}

function canStartRegex(previous) {
  return previous == null
    || ["return", "throw", "case", "delete", "typeof", "void", "new", "in", "of", "yield", "await", "else", "do"].includes(previous)
    || !["value", ")", "]", "}", "+", "-"].includes(previous);
}

function tokensFor(source) {
  const tokens = [];
  let previous = null;
  for (let index = 0; index < source.length;) {
    if (/\s/.test(source[index])) { index += 1; continue; }
    if (source.startsWith("//", index)) { index = source.indexOf("\n", index); if (index < 0) break; continue; }
    if (source.startsWith("/*", index)) { index = source.indexOf("*/", index + 2); if (index < 0) break; index += 2; continue; }
    const literal = readString(source, index);
    if (literal) { tokens.push({ type: "string", value: literal.value, offset: index, dynamic: literal.dynamic }); index = literal.end; previous = "value"; continue; }
    if (source[index] === "/" && canStartRegex(previous)) {
      const end = skipRegex(source, index);
      if (end != null) { index = end; previous = "value"; continue; }
    }
    const identifier = source.slice(index).match(/^[A-Za-z_$][\w$]*/);
    if (identifier) { tokens.push({ type: "identifier", value: identifier[0], offset: index }); index += identifier[0].length; previous = identifier[0]; continue; }
    tokens.push({ type: "punctuation", value: source[index], offset: index }); index += 1;
    previous = tokens[tokens.length - 1].value;
  }
  return tokens;
}

function responseLiterals(source) {
  const tokens = tokensFor(source);
  const literals = [];
  const bindings = new Map();
  const isLocaleFormatOption = (index) => {
    for (let cursor = Math.max(0, index - 14); cursor < index; cursor += 1) {
      if (["toLocaleTimeString", "toLocaleDateString", "DateTimeFormat"].includes(tokens[cursor].value)) return true;
    }
    return false;
  };
  // Bindings may be captured from a parent scope, but must never cross from
  // one sibling function or block into another. The earlier flat lookup could
  // mistake unrelated metadata named `answer` for a resident response.
  const scopes = [{ parent: null }];
  const scopeAt = [];
  let activeScope = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    scopeAt[index] = activeScope;
    if (tokens[index].value === "{") {
      scopes.push({ parent: activeScope });
      activeScope = scopes.length - 1;
    } else if (tokens[index].value === "}") {
      activeScope = scopes[activeScope].parent ?? 0;
    }
  }
  const scopeContains = (ancestor, descendant) => {
    for (let current = descendant; current != null; current = scopes[current].parent) {
      if (current === ancestor) return true;
    }
    return false;
  };
  for (let index = 0; index < tokens.length - 3; index += 1) {
    if (!["const", "let"].includes(tokens[index].value) || tokens[index + 1].type !== "identifier" || tokens[index + 2].value !== "=") continue;
    let depth = 0;
    let end = index + 3;
    for (; end < tokens.length; end += 1) {
      const token = tokens[end];
      if (["(", "[", "{"].includes(token.value)) depth += 1;
      if ([")", "]", "}"].includes(token.value)) depth -= 1;
      if (depth === 0 && [";"].includes(token.value)) break;
    }
    const name = tokens[index + 1].value;
    const occurrences = bindings.get(name) || [];
    occurrences.push({ declaration: index, start: index + 3, end, scope: scopeAt[index] });
    bindings.set(name, occurrences);
  }

  // This is deliberately a small, conservative expression walker. It follows
  // a named value only when that value is used in a response slot, and it
  // treats every fixed string in a value branch as resident-facing. We do not
  // try to understand JavaScript generally: strings in the condition before a
  // ternary `?` are selectors, while both value branches are inspected.
  function stringsInExpression(start, end, seen = new Set(), resolveBindings = false) {
    let depth = 0;
    let question = -1;
    for (let cursor = start; cursor < end; cursor += 1) {
      const token = tokens[cursor];
      if (["(", "[", "{"].includes(token.value)) depth += 1;
      if ([")", "]", "}"].includes(token.value)) depth -= 1;
      if (token.value === "?" && depth === 0) { question = cursor; break; }
    }
    if (question >= 0) {
      depth = 0;
      for (let cursor = question + 1; cursor < end; cursor += 1) {
        const token = tokens[cursor];
        if (["(", "[", "{"].includes(token.value)) depth += 1;
        if ([")", "]", "}"].includes(token.value)) depth -= 1;
        if (token.value === ":" && depth === 0) return [
          ...stringsInExpression(question + 1, cursor, seen, resolveBindings),
          ...stringsInExpression(cursor + 1, end, seen, resolveBindings),
        ];
      }
      // An incomplete expression is uncertain. Preserve any fixed text we can
      // see instead of silently allowing a new resident answer through.
    }
    const found = [];
    for (let cursor = start; cursor < end; cursor += 1) {
      const token = tokens[cursor];
      if (token.type === "string" && !isLocaleFormatOption(cursor)) found.push(token);
      // A property receiver (for example `candidate.directAnswer`) is not a
      // locally named response value. Following it would drag arbitrary data
      // objects into this narrow guard.
      const candidates = bindings.get(token.value) || [];
      // Use the closest declaration above this use. This preserves ordinary
      // function-local shadowing without attempting a complete JS scope parse.
      const binding = candidates.filter((candidate) => candidate.declaration < cursor && scopeContains(candidate.scope, scopeAt[cursor])).at(-1);
      if (resolveBindings && token.type === "identifier" && binding && !seen.has(token.value)
        && tokens[cursor - 1]?.value !== "." && tokens[cursor + 1]?.value !== "." && seen.size < 24) {
        const nextSeen = new Set(seen);
        nextSeen.add(token.value);
        found.push(...stringsInExpression(binding.start, binding.end, nextSeen, true));
      }
    }
    return found;
  }

  function addExpression(field, start, end) {
    // Follow a local binding only when the whole response value is the name.
    // This avoids treating ordinary metadata objects as a response pathway.
    const resolveBindings = end === start + 1 && tokens[start]?.type === "identifier";
    if (!resolveBindings) {
      for (let cursor = start; cursor < end; cursor += 1) {
        const literal = tokens[cursor];
        if (literal.type === "string" && !isTernaryControlLiteral(tokens, cursor) && !isLocaleFormatOption(cursor)) {
          literals.push({ field, value: literal.value, offset: literal.offset, dynamic: literal.dynamic });
        }
      }
      return;
    }
    for (const literal of stringsInExpression(start, end, new Set(), resolveBindings)) {
      literals.push({ field, value: literal.value, offset: literal.offset, dynamic: literal.dynamic });
    }
  }
  function isResidentActionProperty(index) {
    let start = -1;
    let depth = 0;
    for (let cursor = index; cursor >= 0; cursor -= 1) {
      if (tokens[cursor].value === "}") depth += 1;
      if (tokens[cursor].value === "{") { if (depth === 0) { start = cursor; break; } depth -= 1; }
    }
    if (start < 0) return false;
    depth = 0;
    let end = tokens.length;
    for (let cursor = start; cursor < tokens.length; cursor += 1) {
      if (tokens[cursor].value === "{") depth += 1;
      if (tokens[cursor].value === "}") { depth -= 1; if (depth === 0) { end = cursor; break; } }
    }
    let hasLabel = false;
    let hasUrl = false;
    for (let cursor = start + 1; cursor < end - 1; cursor += 1) {
      if (tokens[cursor].value === "label" && tokens[cursor + 1]?.value === ":") hasLabel = true;
      if (tokens[cursor].value === "url" && tokens[cursor + 1]?.value === ":") hasUrl = true;
    }
    return hasLabel && hasUrl;
  }
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (tokens[index].type !== "identifier" || !RESPONSE_FIELDS.has(tokens[index].value) || tokens[index + 1].value !== ":") continue;
    const field = tokens[index].value;
    if (["label", "url"].includes(field) && !isResidentActionProperty(index)) continue;
    const depth = { "(": 0, "[": 0, "{": 0 };
    let end = tokens.length;
    for (let cursor = index + 2; cursor < tokens.length; cursor += 1) {
      const token = tokens[cursor];
      if (["(", "[", "{"].includes(token.value)) depth[token.value] += 1;
      if (token.value === ")") depth["("] -= 1;
      if (token.value === "]") depth["["] -= 1;
      if (token.value === "}") {
        if (depth["{"] === 0 && depth["("] === 0 && depth["["] === 0) { end = cursor; break; }
        depth["{"] -= 1;
      }
      if (token.value === "," && depth["("] === 0 && depth["["] === 0 && depth["{"] === 0) { end = cursor; break; }
    }
    addExpression(field, index + 2, end);
  }
  // Computed response keys are still response paths. This covers ordinary
  // `{"answer": value}` alternatives written as `{["answer"]: value}`.
  for (let index = 0; index < tokens.length - 4; index += 1) {
    if (tokens[index].value !== "[" || tokens[index + 1].type !== "string" || tokens[index + 2].value !== "]" || tokens[index + 3].value !== ":") continue;
    const field = tokens[index + 1].value;
    if (!RESPONSE_FIELDS.has(field)) continue;
    const depth = { "(": 0, "[": 0, "{": 0 };
    let end = tokens.length;
    for (let cursor = index + 4; cursor < tokens.length; cursor += 1) {
      const token = tokens[cursor];
      if (["(", "[", "{"].includes(token.value)) depth[token.value] += 1;
      if (token.value === ")") depth["("] -= 1;
      if (token.value === "]") depth["["] -= 1;
      if (token.value === "}") { if (depth["{"] === 0 && depth["("] === 0 && depth["["] === 0) { end = cursor; break; } depth["{"] -= 1; }
      if (token.value === "," && depth["("] === 0 && depth["["] === 0 && depth["{"] === 0) { end = cursor; break; }
    }
    addExpression(field, index + 4, end);
  }
  // Object shorthand is another direct response path: `return { answer }`.
  for (let index = 1; index < tokens.length - 1; index += 1) {
    if (tokens[index].type !== "identifier" || !RESPONSE_FIELDS.has(tokens[index].value)) continue;
    if (!["{", ","].includes(tokens[index - 1].value) || ![",", "}"].includes(tokens[index + 1].value)) continue;
    addExpression(tokens[index].value, index, index + 1);
  }
  // A small response wrapper is still an answer path. Discover wrappers from
  // their returned object shape, then inspect the corresponding call argument
  // instead of trusting the wrapper name.
  const wrappers = new Map();
  for (let index = 0; index < tokens.length - 4; index += 1) {
    if (tokens[index].value !== "function" || tokens[index + 1]?.type !== "identifier" || tokens[index + 2]?.value !== "(") continue;
    const params = [];
    let cursor = index + 3;
    while (cursor < tokens.length && tokens[cursor].value !== ")") {
      if (tokens[cursor].type === "identifier") params.push(tokens[cursor].value);
      cursor += 1;
    }
    if (tokens[cursor + 1]?.value !== "{") continue;
    const bodyStart = cursor + 1;
    let depth = 1;
    let bodyEnd = bodyStart + 1;
    for (; bodyEnd < tokens.length && depth; bodyEnd += 1) {
      if (tokens[bodyEnd].value === "{") depth += 1;
      if (tokens[bodyEnd].value === "}") depth -= 1;
    }
    const outputs = [];
    for (let fieldAt = bodyStart; fieldAt < bodyEnd - 2; fieldAt += 1) {
      const direct = tokens[fieldAt].type === "identifier" && RESPONSE_FIELDS.has(tokens[fieldAt].value) && tokens[fieldAt + 1]?.value === ":"
        ? { field: tokens[fieldAt].value, valueAt: fieldAt + 2 }
        : tokens[fieldAt].value === "[" && tokens[fieldAt + 1]?.type === "string" && RESPONSE_FIELDS.has(tokens[fieldAt + 1].value) && tokens[fieldAt + 2]?.value === "]" && tokens[fieldAt + 3]?.value === ":"
          ? { field: tokens[fieldAt + 1].value, valueAt: fieldAt + 4 }
          : null;
      if (!direct || tokens[direct.valueAt]?.type !== "identifier") continue;
      const parameterIndex = params.indexOf(tokens[direct.valueAt].value);
      if (parameterIndex >= 0) outputs.push({ field: direct.field, parameterIndex });
    }
    if (outputs.length) wrappers.set(tokens[index + 1].value, outputs);
  }
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const outputs = wrappers.get(tokens[index].value);
    if (!outputs?.length || tokens[index + 1].value !== "(") continue;
    const argumentsAt = [];
    let depth = 0;
    let start = index + 2;
    for (let cursor = start; cursor < tokens.length; cursor += 1) {
      const token = tokens[cursor];
      if (["(", "[", "{"].includes(token.value)) depth += 1;
      if ([")", "]", "}"].includes(token.value)) {
        if (depth === 0 && token.value === ")") { argumentsAt.push([start, cursor]); break; }
        depth -= 1;
      }
      if (token.value === "," && depth === 0) { argumentsAt.push([start, cursor]); start = cursor + 1; }
    }
    for (const output of outputs) {
      const argument = argumentsAt[output.parameterIndex];
      if (argument) addExpression(output.field, argument[0], argument[1]);
    }
  }
  // The legacy rule engine's resident replies flow through these helpers
  // rather than object fields. Treat their first and third arguments as direct
  // answer and next-step copy, so existing debt is inventoried and new routes
  // fail regardless of the presentation helper used.
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (!['helpfulAnswer', 'structuredHelpfulAnswer'].includes(tokens[index].value) || tokens[index + 1].value !== "(") continue;
    let depth = 0;
    let argument = 0;
    let argumentStart = index + 2;
    for (let cursor = index + 2; cursor < tokens.length; cursor += 1) {
      const token = tokens[cursor];
      if (["(", "[", "{"].includes(token.value)) depth += 1;
      if ([")", "]", "}"].includes(token.value)) {
        if (depth === 0 && token.value === ")") {
          if (argument === 0 || argument === 2) addExpression(argument === 0 ? "directAnswer" : "nextStep", argumentStart, cursor);
          break;
        }
        depth -= 1;
      }
      if (token.value === "," && depth === 0) {
        if (argument === 0 || argument === 2) addExpression(argument === 0 ? "directAnswer" : "nextStep", argumentStart, cursor);
        argument += 1;
        argumentStart = cursor + 1;
      }
    }
  }
  return literals;
}

function looksLikeFact(value) {
  return /https?:\/\/|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}|\$\s*\d|\b\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b(?:allowed|prohibited|required|must|may|cannot|can’t|can't|approval)\b.{0,80}\b(?:pool|mailbox|fence|tree|shed|truck|parking|water|trash|quiet|instagram|helipad|hoa)\b/i.test(value);
}

function isGenericDynamicFragment({ field, value, dynamic }) {
  if (!dynamic || looksLikeFact(value)) return false;
  if (GENERIC_DYNAMIC_COPY.has(value.trim())) return true;
  // Dynamic labels, URLs, and details are presentation wrappers around a
  // reviewed action or source value. Their changing portion is not a fixed
  // resident fact. Answer sentences get this exception only when their fixed
  // wording is a generic evidence/navigation boundary; factual wording still
  // remains visible to the guard.
  if (DYNAMIC_PRESENTATION_FIELDS.has(field)) return true;
  return ["directAnswer", "nextStep"].includes(field)
    && /^(?:Chapter\s+appears to cover\.|I found this contact detail in the rulebook:\s*\.|I (?:could not|can’t) (?:safely |currently |reliably )?(?:confirm|verify|read)|I did not find an event|I found\s+official calendar|The official calendar does not list|For\s*, the published\s+hours are:|(?:'s next\s+)?pickup is\s*—?\.?|\s*pickup is\s*—?\.?|Open\b|Use\b)/i.test(value.trim());
}

function isNonResidentStructuralFragment(value) {
  // Template punctuation can be split out by the lightweight scanner (for
  // example, `${headline}. ${summary}`). It cannot communicate a resident
  // claim on its own, so retain only fragments that contain a letter or digit.
  return !/[\p{L}\p{N}]/u.test(value);
}

function isSchemaToken(value) {
  // Internal routing and action identifiers are compact machine tokens, not
  // resident prose. Human-facing fixed copy contains a phrase, sentence, or
  // a factual value and remains subject to the guard.
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)
    || /^[a-z0-9][a-z0-9._-]*\.(?:json|[cm]?js)$/i.test(value)
    || value === "Official community website";
}

function fingerprint(finding) {
  return crypto.createHash("sha256").update(`${finding.filename}\u0000${finding.field}\u0000${finding.value}`).digest("hex");
}

function inspectSource(source, filename = "inline.js", { factsOnly = false } = {}) {
  return responseLiterals(source)
    .filter((literal) => literal.value.trim() && !isNonResidentStructuralFragment(literal.value) && !isSchemaToken(literal.value) && !GENERIC_COPY.has(literal.value) && !isGenericDynamicFragment(literal) && (!factsOnly || looksLikeFact(literal.value)))
    .map(({ field, value, offset }) => ({ filename, field, value, line: lineAt(source, offset) }));
}

function checkProject(root = path.join(__dirname, "..")) {
  const findings = RESPONSE_FILES.flatMap((relative) => {
    const filename = path.join(root, relative);
    return inspectSource(fs.readFileSync(filename, "utf8"), relative);
  });
  const baselineFile = path.join(root, "data", "community-resident-literal-baseline.json");
  const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
  const allowedCounts = new Map((baseline.findings || []).map((finding) => [finding.fingerprint, Number(finding.count) || 1]));
  const observedCounts = new Map();
  for (const finding of findings) {
    const key = fingerprint(finding);
    observedCounts.set(key, (observedCounts.get(key) || 0) + 1);
  }
  const additions = findings.filter((finding) => (observedCounts.get(fingerprint(finding)) || 0) > (allowedCounts.get(fingerprint(finding)) || 0));
  if (additions.length) {
    console.error("New resident-facing fixed copy must come from an approved claim/action projection:");
    for (const finding of additions.filter((finding, index, all) => all.findIndex((other) => fingerprint(other) === fingerprint(finding)) === index)) console.error(`- ${finding.filename}:${finding.line} (${finding.field}) ${JSON.stringify(finding.value)}`);
    return false;
  }
  console.log(`Community resident-literal guard passed (${findings.length} tracked migration-debt nodes).`);
  return true;
}

if (require.main === module) process.exitCode = checkProject() ? 0 : 1;

module.exports = { BASELINE_PATH, GENERIC_COPY, RESPONSE_FILES, fingerprint, inspectSource, responseLiterals, checkProject };
