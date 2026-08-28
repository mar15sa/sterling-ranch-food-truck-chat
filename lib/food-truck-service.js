const DEFAULT_ANSWER_CACHE_TTL_MS = 1000 * 60 * 10;

function formatTruckList(truckNames = []) {
  if (truckNames.length <= 1) return truckNames[0] || "";
  if (truckNames.length === 2) return truckNames.join(" and ");
  return `${truckNames.slice(0, -1).join(", ")}, and ${truckNames.at(-1)}`;
}

function buildLookupAnswer({
  question,
  targetDate,
  truck,
  calendar,
  menu,
  truckListings = [],
  formatIso,
  formatFriendly,
}) {
  const friendlyDate = formatFriendly(targetDate);
  if (!truckListings.length) {
    return {
      text: `I could not find a listed food truck for ${friendlyDate}. The calendar might not have that date posted yet.`,
      date: formatIso(targetDate),
      friendlyDate,
      truck: null,
      sourceUrl: calendar.sourceUrl,
      checkedAt: new Date().toISOString(),
      menu,
    };
  }

  const truckNames = truckListings.map((listing) =>
    listing.location ? `${listing.name} at ${listing.location}` : listing.name
  );
  const itemText = menu.items.length
    ? ` I found menu items like ${menu.items.slice(0, 3).map((item) => item.name).join(", ")}.`
    : " I found the truck, but could not read menu items automatically this time. The links below are the best places to check.";
  const truckText = truckNames.length > 1
    ? `the listed food trucks are ${formatTruckList(truckNames)}`
    : `the listed food truck is ${truckNames[0]}`;

  return {
    text: `For ${friendlyDate}, ${truckText}.${itemText}`,
    date: formatIso(targetDate),
    friendlyDate,
    truck,
    trucks: truckListings,
    location: truckListings[0]?.location || "",
    sourceUrl: calendar.sourceUrl,
    checkedAt: new Date().toISOString(),
    menu,
    question,
  };
}

function createFoodTruckService(options = {}) {
  const {
    formatFriendly,
    formatIso,
    getEventTruckListings,
    getMenuForTruck,
    getScheduleForMonth,
    isNonTruckCalendarTitle,
    normalizeTruckName,
    splitListedTruckNames,
  } = options;
  const answerCache = options.answerCache || new Map();
  const answerCacheTtlMs = options.answerCacheTtlMs || DEFAULT_ANSWER_CACHE_TTL_MS;

  async function getAnswerForDate(question, targetDate) {
    const dateKey = formatIso(targetDate);
    const cached = answerCache.get(dateKey);
    if (cached && Date.now() - cached.savedAt < answerCacheTtlMs) {
      return { ...cached.data, question };
    }

    const year = targetDate.getUTCFullYear();
    const month = targetDate.getUTCMonth() + 1;
    const day = targetDate.getUTCDate();
    const calendar = await getScheduleForMonth(year, month, day);
    const localEvent = calendar.localEvents?.[dateKey] || null;
    const localTruckNames = localEvent?.trucks || [];
    const calendarTruck = calendar.schedule[dateKey] || "";
    const eventTruckListings =
      !localTruckNames.length && calendarTruck && isNonTruckCalendarTitle(calendarTruck)
        ? await getEventTruckListings(calendarTruck, targetDate)
        : [];
    const truck = localTruckNames.length
      ? formatTruckList(localTruckNames)
      : calendarTruck && !isNonTruckCalendarTitle(calendarTruck)
        ? calendarTruck
        : formatTruckList(eventTruckListings.map((listing) => listing.name));
    const baseTruckNames =
      !localTruckNames.length && calendarTruck && !isNonTruckCalendarTitle(calendarTruck)
        ? splitListedTruckNames(truck)
        : [];
    const localTruckListings = localTruckNames.flatMap((name) =>
      splitListedTruckNames(name).map((splitName) => ({
        name: splitName,
        location: localEvent.location || "",
      }))
    );
    const listingInputs = [
      ...baseTruckNames.map((name) => ({ name, location: "" })),
      ...eventTruckListings,
      ...localTruckListings,
    ];
    const uniqueListingInputs = [];
    const seenListings = new Set();
    for (const listing of listingInputs) {
      const key = `${normalizeTruckName(listing.name).toLowerCase()}|${listing.location}`;
      if (seenListings.has(key)) continue;
      seenListings.add(key);
      uniqueListingInputs.push(listing);
    }
    const menus = await Promise.all(
      uniqueListingInputs.map(async (listing) => ({
        ...listing,
        menu: await getMenuForTruck(listing.name),
      }))
    );
    const menu = menus[0]?.menu || { links: [], items: [] };
    const data = buildLookupAnswer({
      question,
      targetDate,
      truck,
      calendar,
      menu,
      truckListings: menus,
      formatIso,
      formatFriendly,
    });
    answerCache.set(dateKey, { data, savedAt: Date.now() });
    return data;
  }

  return {
    getAnswerForDate,
    clearAnswerCache: () => answerCache.clear(),
  };
}

module.exports = {
  DEFAULT_ANSWER_CACHE_TTL_MS,
  buildLookupAnswer,
  createFoodTruckService,
  formatTruckList,
};
