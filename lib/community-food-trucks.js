const { buildAnswerContract } = require("./community-contracts");

function isFoodTruckQuestion(question = "") {
  const text = String(question).toLowerCase();
  if (/\b(?:run|operate|start|own|park)\b.{0,45}\bfood\s*trucks?\b|\bfood\s*trucks?\b.{0,45}\b(?:business|catering|driveway|operate|run|start)\b/i.test(text)) return false;
  return /\bfood\s*trucks?\b.{0,60}\b(?:today|tomorrow|tonight|menu|price|cost|here|coming|scheduled|schedule|calendar|which|who|when|date|day)\b|\b(?:today|tomorrow|tonight|which|who|when)\b.{0,60}\bfood\s*trucks?\b|\btruck\b.{0,45}\b(?:today|tomorrow|tonight|menu|price|cost|here|coming|scheduled)\b|\b(?:menu|price|cost|what(?:'s| is) on)\b.{0,45}\b(?:their|truck)\b/i.test(text);
}

function formatTruckList(names) {
  if (names.length <= 1) return names[0] || "";
  if (names.length === 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

function menuContext(listing, fallbackMenu, index, result, checkedAt) {
  const menu = listing.menu || fallbackMenu || {};
  const menuLinks = (menu.links || []).filter((link) => /^https?:\/\//i.test(link?.url || ""));
  const itemSourceUrl = (menu.items || []).find((item) => /^https?:\/\//i.test(item?.url || ""))?.url || "";
  const bestMenuLink = menuLinks.find((link) => link.url === itemSourceUrl)
    || menuLinks.find((link) => /\bmenu\b/i.test(`${link.title || ""} ${link.url || ""}`))
    || menuLinks[0]
    || null;
  const menuItems = bestMenuLink ? (menu.items || []).slice(0, 10).map((item) => ({
    name: item.name,
    price: item.price || "",
    description: item.description || "",
  })) : [];
  const sourceId = bestMenuLink ? `food-truck-menu-${result.date || "current"}-${index + 1}` : "";
  const evidence = menuItems.map((item) => `${item.name}${item.price ? ` ${item.price}` : ""}`).join("; ");

  return {
    listing,
    bestMenuLink,
    menuItems,
    source: bestMenuLink ? {
      id: sourceId,
      title: bestMenuLink.title || `${listing.name} menu source`,
      sourceUrl: bestMenuLink.url,
      text: `Menu information for ${listing.name} from the linked truck or ordering page. ${evidence}`.trim(),
      excerpt: `Menu information for ${listing.name} from the linked truck or ordering page. ${evidence}`.trim(),
      authorityScore: 0.82,
      checkedAt,
      isOfficialResource: false,
    } : null,
    sourceId,
  };
}

function isFoodTruckRequest(interpretation = {}) {
  const text = `${interpretation.subject || ""} ${(interpretation.searchQueries || []).join(" ")}`.toLowerCase();
  if (!/\bfood\s*trucks?\b/.test(text)) return false;
  return interpretation.intent === "events" || ["schedule", "cost", "information"].some((goal) => (interpretation.goals || [interpretation.goal]).includes(goal));
}

function foodTruckAnswer(result = {}) {
  const listings = Array.isArray(result.trucks) ? result.trucks : [];
  const calendarUrl = result.sourceUrl || "https://sterlingranchcab.com/Calendar.aspx";
  const fullAnswerUrl = `/food-truck${result.date ? `?date=${encodeURIComponent(result.date)}` : ""}`;
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
  if (!listings.length && !result.truck) {
    const answer = buildAnswerContract({
      directAnswer: `I could not find a food truck listed for ${result.friendlyDate || "that date"}.`,
      nextStep: "The schedule may not be posted yet. Check the official calendar before making plans.",
      actions: [
        { label: "Open full food-truck answer", url: fullAnswerUrl, actionType: "food-truck-chat" },
        { label: "View food-truck schedule", url: calendarUrl, actionType: "calendar" },
      ],
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

  const normalizedListings = listings.length
    ? listings
    : [{ name: result.truck, location: result.location || "", menu: result.menu || {} }];
  const contexts = normalizedListings.map((listing, index) =>
    menuContext(listing, index === 0 ? result.menu : null, index, result, checkedAt)
  );
  contexts.forEach((context) => {
    if (context.source) sources.push(context.source);
  });

  const displayNames = normalizedListings.map((listing) =>
    listing.location ? `${listing.name} at ${listing.location}` : listing.name
  ).filter(Boolean);
  const truckNames = normalizedListings.map((listing) => listing.name).filter(Boolean);
  const allMenuItems = contexts.flatMap((context) => context.menuItems);
  const locations = [...new Set(normalizedListings.map((listing) => listing.location).filter(Boolean))];
  const directAnswer = `For ${result.friendlyDate || "that date"}, ${displayNames.length === 1 ? "the listed food truck is" : "the listed food trucks are"} ${formatTruckList(displayNames)}.`;
  const actions = [
    { label: "Open full food-truck answer", url: fullAnswerUrl, actionType: "food-truck-chat" },
    ...contexts.filter((context) => context.bestMenuLink).map((context) => ({
      label: `View ${context.listing.name} menu`,
      url: context.bestMenuLink.url,
      actionType: "menu",
    })),
    { label: "View food-truck schedule", url: calendarUrl, actionType: "calendar" },
  ];
  const answer = buildAnswerContract({
    directAnswer,
    keyDetails: allMenuItems.length ? allMenuItems.slice(0, 3).map((item) => `${item.name}${item.price ? ` — ${item.price}` : ""}`) : [],
    nextStep: allMenuItems.length ? "Menus and prices can change. Check each truck’s menu before ordering." : "I could not verify menu items this time; use the schedule link to confirm the trucks before making plans.",
    actions,
    sources,
    status: "verified",
    checkedAt,
    answerMode: "community-live-food-truck",
    claims: [
      { text: directAnswer, evidenceSourceIds: [sources[0].id] },
      ...contexts.flatMap((context) => context.menuItems.map((item) => ({
        text: `${context.listing.name}: ${item.name}${item.price ? ` — ${item.price}` : ""}`,
        evidenceSourceIds: [context.sourceId],
      }))),
    ],
  });
  return {
    ...answer,
    presentation: {
      kind: "food-truck",
      dateLabel: result.friendlyDate || "That date",
      title: truckNames.length === 1 ? `${truckNames[0]} is scheduled` : `${truckNames.length} food trucks are scheduled`,
      truckNames,
      location: locations.join(" and "),
      menuItems: contexts[0]?.menuItems || [],
      truckCards: contexts.map((context) => ({
        name: context.listing.name,
        location: context.listing.location || "",
        menuItems: context.menuItems,
      })),
      note: allMenuItems.length
        ? "Menus and prices can change. Confirm on each truck’s menu before ordering."
        : "Readable menus were not available when checked. Use the links below for the latest details.",
    },
  };
}

module.exports = { foodTruckAnswer, isFoodTruckQuestion, isFoodTruckRequest };
