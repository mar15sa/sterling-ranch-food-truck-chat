const { buildAnswerContract } = require("./community-contracts");
const { createConnectorAdapters, emitEvidenceEnvelope } = require("./community-connector-adapter");

function isFoodTruckBusinessQuestion(question = "") {
  const text = String(question).toLowerCase();
  return /\b(?:run|operate|start|own|park)\b.{0,45}\bfood\s*trucks?\b|\bfood\s*trucks?\b.{0,45}\b(?:business|catering|driveway|operate|run|start)\b/i.test(text);
}
function isFoodTruckQuestion(question = "") { const text = String(question).toLowerCase(); return !isFoodTruckBusinessQuestion(text) && /\bfood\s*trucks?\b.{0,60}\b(?:today|tomorrow|tonight|menu|price|cost|here|coming|scheduled|schedule|calendar|which|who|when|date|day)\b|\b(?:today|tomorrow|tonight|which|who|when)\b.{0,60}\bfood\s*trucks?\b|\btruck\b.{0,45}\b(?:today|tomorrow|tonight|menu|price|cost|here|coming|scheduled)\b|\b(?:menu|price|cost|what(?:'s| is) on)\b.{0,45}\b(?:their|truck)\b/i.test(text); }
function isFoodTruckRequest(interpretation = {}, question = "") { const text = `${question || ""} ${interpretation.subject || ""} ${(interpretation.searchQueries || []).join(" ")}`.toLowerCase(); return /\bfood\s*trucks?\b/.test(text) && !isFoodTruckBusinessQuestion(text) && (interpretation.intent === "events" || ["schedule", "status", "cost", "information"].some((goal) => (interpretation.goals || [interpretation.goal]).includes(goal))); }
function formatTruckList(names) { return names.length <= 1 ? names[0] || "" : names.length === 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`; }

function configuredFoodTruckAdapter(profile) {
  const connector = (profile?.connectors || []).find((item) => item.adapter?.foodTruck && item.adapter?.capabilities?.includes("events"));
  const adapter = createConnectorAdapters(profile).find((item) => item.connectorId === connector?.id);
  const settings = connector?.adapter?.foodTruck;
  if (!adapter || !settings?.fullAnswerPath || !Array.isArray(settings.vendorSources)) throw new Error("No profile-backed food-truck connector is configured for this community.");
  return { adapter, settings };
}
function canonicalUrl(url = "") { try { const parsed = new URL(url); parsed.hash = ""; return parsed.href.replace(/\/$/, ""); } catch { return ""; } }
function vendorIdentity(listing, vendorSources = []) {
  const name = String(listing?.name || "").trim().toLowerCase();
  return vendorSources.find((vendor) => (vendor.aliases || []).some((alias) => String(alias).trim().toLowerCase() === name)) || null;
}
function menuContext(listing, fallbackMenu, index, vendorSources) {
  const menu = listing.menu || fallbackMenu || {};
  const vendor = vendorIdentity(listing, vendorSources);
  const approvedUrls = new Set((vendor?.menuUrls || []).map(canonicalUrl).filter(Boolean));
  const menuLinks = (menu.links || []).filter((link) => approvedUrls.has(canonicalUrl(link?.url)));
  const itemSourceUrl = (menu.items || []).find((item) => approvedUrls.has(canonicalUrl(item?.url)))?.url || "";
  const bestMenuLink = menuLinks.find((link) => link.url === itemSourceUrl) || menuLinks.find((link) => /\bmenu\b/i.test(`${link.title || ""} ${link.url || ""}`)) || menuLinks[0] || null;
  const menuItems = bestMenuLink ? (menu.items || []).filter((item) => approvedUrls.has(canonicalUrl(item.url))).slice(0, 10).map((item) => ({ name: item.name, price: item.price || "", description: item.description || "" })) : [];
  return { listing, bestMenuLink, menuItems, sourceId: bestMenuLink ? `menu-${index + 1}` : "" };
}

function foodTruckAnswer(result = {}, options = {}) {
  const profile = options.profile || result.profile;
  const routingPlan = options.routingPlan || result.routingPlan || {};
  const { adapter, settings } = configuredFoodTruckAdapter(profile);
  // Match the returned calendar against the configured connector endpoint;
  // the profile owns the official schedule URL and endpoint purpose.
  const calendarUrl = adapter.endpoints.find((endpoint) => canonicalUrl(endpoint.url) === canonicalUrl(result.sourceUrl))?.url;
  if (!calendarUrl || !result.sourceUrl || canonicalUrl(result.sourceUrl) !== canonicalUrl(calendarUrl)) throw new Error("Food-truck schedule evidence must come from the configured official calendar.");
  const checkedAt = result.checkedAt || new Date().toISOString();
  const inputListings = Array.isArray(result.trucks) ? result.trucks : [];
  const listings = inputListings.length ? inputListings : result.truck ? [{ name: result.truck, location: result.location || "", menu: result.menu || {} }] : [];
  const contexts = listings.map((listing, index) => menuContext(listing, index === 0 ? result.menu : null, index, settings.vendorSources));
  const menuFailure = result.menuEnrichment?.status === "degraded" || contexts.some((context) => (context.listing.menu?.links || []).length && !context.bestMenuLink);
  const requestedDetails = [...new Set((routingPlan.requestedDetails || ["date"]).filter((detail) => adapter.facets.includes(detail)))];
  const coveredDetails = requestedDetails.filter((detail) => detail === "date" || detail === "event-date" || (detail === "menu" && contexts.some((context) => context.menuItems.length)) || (detail === "price" && contexts.some((context) => context.menuItems.some((item) => item.price))));
  const menuClaims = contexts.flatMap((context) => context.menuItems.map((item, index) => ({ id: `menu-${context.sourceId}-${index + 1}`, facet: item.price ? "price" : "menu", text: `${context.listing.name}: ${item.name}${item.price ? ` — ${item.price}` : ""}`, controllingEvidenceId: `${adapter.adapterId}:${context.sourceId}`, controllingSourceRole: "operational" })));
  const envelope = emitEvidenceEnvelope(adapter, {
    observedAt: checkedAt, request: { dateRange: routingPlan.dateRange, filters: {} },
    sources: [{ id: "schedule", sourceUrl: calendarUrl, controllingSourceRole: "operational", checkedAt }, ...contexts.filter((context) => context.bestMenuLink).map((context) => ({ id: context.sourceId, sourceUrl: context.bestMenuLink.url, controllingSourceRole: "operational", checkedAt }))],
    claims: [{ id: "scheduled-trucks", facet: "event-date", text: listings.map((listing) => listing.name).filter(Boolean).join(", ") || "No listed truck", controllingEvidenceId: `${adapter.adapterId}:schedule`, controllingSourceRole: "operational" }, ...menuClaims],
    actions: [{ id: "schedule", type: "information", label: adapter.labels.calendarAction, url: calendarUrl }, ...contexts.filter((context) => context.bestMenuLink).map((context) => ({ id: context.sourceId, type: "information", label: `View ${context.listing.name} menu`, url: context.bestMenuLink.url }))],
    coverage: { requested: requestedDetails, covered: coveredDetails }, degradation: { state: menuFailure ? "degraded" : "healthy", ...(menuFailure ? { reason: "menu-enrichment-unavailable" } : {}) },
  });
  const scheduleEvidence = envelope.evidence.find((item) => item.evidenceId === `${adapter.adapterId}:schedule`);
  const sources = [{ id: scheduleEvidence.evidenceId, communityId: scheduleEvidence.communityId, title: adapter.labels.calendarTitle, sourceUrl: scheduleEvidence.sourceUrl, text: result.text || "Official food-truck schedule", excerpt: result.text || "Official food-truck schedule", authorityScore: 1, checkedAt, staleAfter: scheduleEvidence.staleAfter, isOfficialResource: true, connectorType: envelope.connectorFamily, sourceType: "events", controllingSourceRole: "operational", authorityFacets: ["event-date", "date"], canonicalScopedProjection: false }];
  for (const context of contexts.filter((item) => item.bestMenuLink)) { const evidence = envelope.evidence.find((item) => item.evidenceId === `${adapter.adapterId}:${context.sourceId}`); sources.push({ id: evidence.evidenceId, communityId: evidence.communityId, title: context.bestMenuLink.title || `${context.listing.name} menu`, sourceUrl: evidence.sourceUrl, text: `Menu information for ${context.listing.name}.`, excerpt: `Menu information for ${context.listing.name}.`, authorityScore: 1, checkedAt, staleAfter: evidence.staleAfter, isOfficialResource: true, connectorType: envelope.connectorFamily, sourceType: "events", controllingSourceRole: "operational", authorityFacets: ["menu", "price"], canonicalScopedProjection: false }); }
  const fullAnswerUrl = `${settings.fullAnswerPath}${result.date ? `?date=${encodeURIComponent(result.date)}` : ""}`;
  const actions = [{ label: adapter.labels.fullAnswerAction, url: fullAnswerUrl, actionType: "food-truck-chat" }, ...envelope.actions.filter((action) => action.id !== "schedule").map((action) => ({ label: action.label, url: action.url, actionType: "menu" })), { label: adapter.labels.calendarAction, url: calendarUrl, actionType: "calendar" }];
  const dateLabel = result.friendlyDate || result.date || adapter.labels.calendarTitle;
  if (!listings.length) {
    const directAnswer = result.text || adapter.labels.calendarTitle;
    return { ...buildAnswerContract({ directAnswer, nextStep: adapter.labels.calendarAction, actions, sources, status: "verified-incomplete", requestedDetails, coveredDetails, checkedAt, answerMode: "community-live-food-truck", claims: [{ text: directAnswer, evidenceSourceIds: [scheduleEvidence.evidenceId] }] }), evidenceEnvelope: envelope, presentation: { kind: "food-truck", dateLabel, title: adapter.labels.calendarTitle, location: "", menuItems: [], note: adapter.labels.calendarAction } };
  }
  const displayNames = listings.map((listing) => listing.location ? `${listing.name} at ${listing.location}` : listing.name).filter(Boolean);
  const allMenuItems = contexts.flatMap((context) => context.menuItems);
  const directAnswer = `For ${dateLabel}, ${displayNames.length === 1 ? "the listed food truck is" : "the listed food trucks are"} ${formatTruckList(displayNames)}.`;
  const status = coveredDetails.length === requestedDetails.length ? "verified" : "verified-incomplete";
  return { ...buildAnswerContract({ directAnswer, keyDetails: allMenuItems.slice(0, 3).map((item) => `${item.name}${item.price ? ` — ${item.price}` : ""}`), nextStep: allMenuItems.length ? "Menus and prices can change. Check each truck’s menu before ordering." : "I could not verify menu items this time; use the schedule link to confirm the trucks before making plans.", actions, sources, status, requestedDetails, coveredDetails, checkedAt, answerMode: "community-live-food-truck", claims: [{ text: directAnswer, evidenceSourceIds: [scheduleEvidence.evidenceId] }, ...menuClaims.map((claim) => ({ text: claim.text, kind: claim.facet, evidenceSourceIds: [claim.controllingEvidenceId] }))] }), evidenceEnvelope: envelope, menuEnrichment: result.menuEnrichment || { status: menuFailure ? "degraded" : "complete", failures: [] }, presentation: { kind: "food-truck", dateLabel, title: listings.length === 1 ? `${listings[0].name} is scheduled` : `${listings.length} food trucks are scheduled`, truckNames: listings.map((listing) => listing.name).filter(Boolean), location: [...new Set(listings.map((listing) => listing.location).filter(Boolean))].join(" and "), menuItems: contexts[0]?.menuItems || [], truckCards: contexts.map((context) => ({ name: context.listing.name, location: context.listing.location || "", menuItems: context.menuItems })), note: allMenuItems.length ? "Menus and prices can change. Confirm on each truck’s menu before ordering." : "Readable menus were not available when checked. Use the links below for the latest details." } };
}
module.exports = { foodTruckAnswer, isFoodTruckQuestion, isFoodTruckRequest };
