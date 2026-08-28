const { buildAnswerContract } = require("./community-contracts");

function isFoodTruckQuestion(question = "") {
  const text = String(question).toLowerCase();
  if (/\b(?:run|operate|start|own|park)\b.{0,45}\bfood\s*trucks?\b|\bfood\s*trucks?\b.{0,45}\b(?:business|catering|driveway|operate|run|start)\b/i.test(text)) return false;
  return /\bfood\s*trucks?\b.{0,60}\b(?:today|tomorrow|tonight|menu|price|cost|here|coming|scheduled|schedule|calendar|which|who|when|date|day)\b|\b(?:today|tomorrow|tonight|which|who|when)\b.{0,60}\bfood\s*trucks?\b|\btruck\b.{0,45}\b(?:today|tomorrow|tonight|menu|price|cost|here|coming|scheduled)\b|\b(?:menu|price|cost|what(?:'s| is) on)\b.{0,45}\b(?:their|truck)\b/i.test(text);
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
  const menuLinks = (menu.links || []).filter((link) => /^https?:\/\//i.test(link?.url || ""));
  const itemSourceUrl = (menu.items || []).find((item) => /^https?:\/\//i.test(item?.url || ""))?.url || "";
  const bestMenuLink = menuLinks.find((link) => link.url === itemSourceUrl)
    || menuLinks.find((link) => /\bmenu\b/i.test(`${link.title || ""} ${link.url || ""}`))
    || menuLinks[0]
    || null;
  const menuEvidence = (menu.items || []).slice(0, 10).map((item) => `${item.name}${item.price ? ` ${item.price}` : ""}`).join("; ");
  if (bestMenuLink) {
    sources.push({
      id: `food-truck-menu-${result.date || "current"}`,
      title: bestMenuLink.title || "Food truck menu source",
      sourceUrl: bestMenuLink.url,
      text: `Menu information from the linked truck or ordering page. ${menuEvidence}`.trim(),
      excerpt: `Menu information from the linked truck or ordering page. ${menuEvidence}`.trim(),
      authorityScore: 0.82,
      checkedAt,
      isOfficialResource: false,
    });
  }

  if (!listings.length && !result.truck) {
    const answer = buildAnswerContract({
      directAnswer: `I could not find a food truck listed for ${result.friendlyDate || "that date"}.`,
      nextStep: "The schedule may not be posted yet. Check the official calendar before making plans.",
      actions: [{ label: "View food-truck schedule", url: calendarUrl, actionType: "calendar" }],
      sources,
      status: "verified-incomplete",
      checkedAt,
      answerMode: "community-live-food-truck",
      claims: [{ text: `No food truck was listed for ${result.friendlyDate || "that date"} when checked.`, evidenceSourceIds: [sources[0].id] }],
    });
    return {
      ...answer,
      presentation: {
        kind: "food-truck",
        dateLabel: result.friendlyDate || "That date",
        title: "No food truck is listed yet",
        location: "",
        menuItems: [],
        note: "The schedule may not be posted yet. Check again before making plans.",
      },
    };
  }

  const names = listings.map((listing) => listing.location ? `${listing.name} at ${listing.location}` : listing.name).filter(Boolean);
  const truckNames = names.length ? names : [result.truck].filter(Boolean);
  const displayMenuItems = bestMenuLink ? (menu.items || []).slice(0, 4).map((item) => ({
    name: item.name,
    price: item.price || "",
    description: item.description || "",
  })) : [];
  const menuItems = displayMenuItems.map((item) => `${item.name}${item.price ? ` — ${item.price}` : ""}`);
  const primaryTruckName = listings[0]?.name || result.truck || "Food truck";
  const locations = [...new Set(listings.map((listing) => listing.location).filter(Boolean))];
  const directAnswer = `For ${result.friendlyDate || "that date"}, ${truckNames.length === 1 ? "the listed food truck is" : "the listed food trucks are"} ${truckNames.join(", ")}.`;
  const actions = [
    ...(bestMenuLink ? [{ label: `View ${primaryTruckName} menu`, url: bestMenuLink.url, actionType: "menu" }] : []),
    { label: "View food-truck schedule", url: calendarUrl, actionType: "calendar" },
  ];
  const answer = buildAnswerContract({
    directAnswer,
    keyDetails: menuItems.length ? menuItems.slice(0, 3) : [],
    nextStep: menuItems.length ? "Menus and prices can change. Check the truck’s menu before ordering." : "I could not verify menu items this time; use the schedule link to confirm the truck before making plans.",
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
  return {
    ...answer,
    presentation: {
      kind: "food-truck",
      dateLabel: result.friendlyDate || "That date",
      title: truckNames.length === 1 ? `${primaryTruckName} is scheduled` : `${truckNames.length} food trucks are scheduled`,
      truckNames,
      location: locations.join(" and "),
      menuItems: displayMenuItems,
      note: menuItems.length
        ? "Menus and prices can change. Confirm on the truck’s menu before ordering."
        : "A readable menu was not available when checked. Use the links below for the latest details.",
    },
  };
}

module.exports = { foodTruckAnswer, isFoodTruckQuestion };
