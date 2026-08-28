const { buildAnswerContract } = require("./community-contracts");

function isFoodTruckQuestion(question = "") {
  const text = String(question).toLowerCase();
  return /\bfood\s*trucks?\b|\btruck\b.{0,45}\b(?:today|tomorrow|tonight|menu|price|cost|here|coming|scheduled)\b|\b(?:menu|price|cost|what(?:'s| is) on)\b.{0,45}\b(?:their|truck)\b/i.test(text);
}

function foodTruckAnswer(result = {}) {
  const listings = Array.isArray(result.trucks) ? result.trucks : [];
  const menu = result.menu || {};
  const calendarUrl = result.sourceUrl || "https://sterlingranchcab.com/Calendar.aspx";
  const checkedAt = result.checkedAt || new Date().toISOString();
  const sources = [{
    id: `food-truck-calendar-${result.date || "current"}`,
    title: "Official Sterling Ranch calendar",
    sourceUrl: calendarUrl,
    text: result.text || "Official Sterling Ranch food-truck schedule",
    excerpt: result.text || "Official Sterling Ranch food-truck schedule",
    authorityScore: 1,
    checkedAt,
    isOfficialResource: true,
  }];
  const menuLinks = (menu.links || []).filter((link) => /^https?:\/\//i.test(link?.url || "")).slice(0, 3);
  const menuEvidence = (menu.items || []).slice(0, 10).map((item) => `${item.name}${item.price ? ` ${item.price}` : ""}`).join("; ");
  if (menuLinks[0]) {
    sources.push({
      id: `food-truck-menu-${result.date || "current"}`,
      title: menuLinks[0].title || "Food truck menu source",
      sourceUrl: menuLinks[0].url,
      text: `Menu information from the linked truck or ordering page. ${menuEvidence}`.trim(),
      excerpt: `Menu information from the linked truck or ordering page. ${menuEvidence}`.trim(),
      authorityScore: 0.82,
      checkedAt,
      isOfficialResource: false,
    });
  }

  if (!listings.length && !result.truck) {
    return buildAnswerContract({
      directAnswer: `I could not find a food truck listed for ${result.friendlyDate || "that date"}.`,
      nextStep: "The schedule may not be posted yet. Check the official calendar before making plans.",
      actions: [{ label: "Open official community calendar", url: calendarUrl, actionType: "calendar" }],
      sources,
      status: "verified-incomplete",
      checkedAt,
      answerMode: "community-live-food-truck",
      claims: [{ text: `No food truck was listed for ${result.friendlyDate || "that date"} when checked.`, evidenceSourceIds: [sources[0].id] }],
    });
  }

  const names = listings.map((listing) => listing.location ? `${listing.name} at ${listing.location}` : listing.name).filter(Boolean);
  const truckNames = names.length ? names : [result.truck].filter(Boolean);
  const menuItems = menuLinks.length ? (menu.items || []).slice(0, 3).map((item) => `${item.name}${item.price ? ` — ${item.price}` : ""}`) : [];
  const directAnswer = `For ${result.friendlyDate || "that date"}, ${truckNames.length === 1 ? "the listed food truck is" : "the listed food trucks are"} ${truckNames.join(", ")}.`;
  const actions = [
    { label: "Open official community calendar", url: calendarUrl, actionType: "calendar" },
    ...menuLinks.map((link) => ({ label: link.title || "Open menu source", url: link.url, actionType: "menu" })),
  ];
  return buildAnswerContract({
    directAnswer,
    keyDetails: menuItems.length ? [`Menu examples found: ${menuItems.join("; ")}.`] : [],
    nextStep: menuItems.length ? "Use the menu link below to confirm current availability and prices." : "I could not verify menu items this time; use the truck links below to check the current menu.",
    actions,
    sources,
    status: "verified",
    checkedAt,
    answerMode: "community-live-food-truck",
    claims: [
      { text: directAnswer, evidenceSourceIds: [sources[0].id] },
      ...menuItems.map((detail) => ({ text: detail, evidenceSourceIds: [sources[1].id] })),
    ],
  });
}

module.exports = { foodTruckAnswer, isFoodTruckQuestion };
