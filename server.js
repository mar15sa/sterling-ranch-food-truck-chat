const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
const STERLING_EVENT_ID = 6150;
const CALENDAR_BASE = "https://sterlingranchcab.com/Calendar.aspx";
const USER_AGENT =
  "Mozilla/5.0 (compatible; SterlingRanchFoodTruckHelper/1.0; +local)";
const MENU_CACHE_VERSION = "menus-v7";
const FETCH_TIMEOUT_MS = 8000;
const ANSWER_CACHE_TTL_MS = 1000 * 60 * 10;
const WARMUP_INTERVAL_MS = 1000 * 60 * 15;
const KNOWN_TRUCK_LINKS = {
  "d maracuchos": {
    official: {
      title: "D Maracuchos - Delivery Venezolan Food in Colorado",
      url: "https://d-maracuchos.com",
    },
    facebook: {
      title: "D'Maracuchos - Facebook",
      url: "https://www.facebook.com/people/D-Maracuchos-Cafe/100092150456933/",
    },
    instagram: {
      title: "D'Maracuchos - Instagram",
      url: "https://instagram.com/dmaracuchoscafe",
    },
  },
  "burning oven pizza": {
    official: {
      title: "The Burning Oven",
      url: "https://theburningoven.com/",
    },
    facebook: {
      title: "The Burning Oven Pizza Trailer - Facebook",
      url: "https://www.facebook.com/theburningoven",
    },
    instagram: {
      title: "The Burning Oven - Instagram",
      url: "https://www.instagram.com/theburningovenpizza/",
    },
  },
  "uptown humboldt": {
    official: {
      title: "Uptown & Humboldt",
      url: "https://www.uptownhumboldt.com/",
    },
    facebook: {
      title: "Uptown & Humboldt - Facebook",
      url: "https://www.facebook.com/uptownandhumboldt/",
    },
    instagram: {
      title: "Uptown & Humboldt - Instagram",
      url: "https://instagram.com/uptownandhumboldt",
    },
  },
  "samos grill": {
    menu: [
      {
        title: "Samos Grill menu - Food Fleet",
        url: "https://www.foodfleet.com/food-fleet-partners/samos-grill",
      },
    ],
    facebook: {
      title: "Samos Grill - Facebook",
      url: "https://www.facebook.com/people/Samos-Grill/100086658823173/",
    },
    instagram: {
      title: "Samos Grill - Instagram",
      url: "https://www.instagram.com/samosgrill_/",
    },
  },
  "tacotento mas": {
    official: {
      title: "Tacontento & Mas",
      url: "https://tacontentomasco.com/",
    },
    facebook: {
      title: "Tacontento & Mas - Facebook",
      url: "https://www.facebook.com/profile.php?id=100085291719553",
    },
    instagram: {
      title: "Tacontento & Mas - Instagram",
      url: "https://www.instagram.com/tacontento_y_mas/",
    },
    menu: [
      {
        title: "Tacontento & Mas menu",
        url: "https://tacontentomasco.com/tacontento--mas/locations/",
      },
    ],
  },
  "tacontento mas": {
    official: {
      title: "Tacontento & Mas",
      url: "https://tacontentomasco.com/",
    },
    facebook: {
      title: "Tacontento & Mas - Facebook",
      url: "https://www.facebook.com/profile.php?id=100085291719553",
    },
    instagram: {
      title: "Tacontento & Mas - Instagram",
      url: "https://www.instagram.com/tacontento_y_mas/",
    },
    menu: [
      {
        title: "Tacontento & Mas menu",
        url: "https://tacontentomasco.com/tacontento--mas/locations/",
      },
    ],
  },
  "lucky dawg": {
    official: {
      title: "Lucky Dawg",
      url: "https://luckydawg.food/",
    },
    facebook: {
      title: "Lucky Dawg - Facebook",
      url: "https://www.facebook.com/people/Lucky-Dawg/61570031293937/",
    },
    instagram: {
      title: "Lucky Dawg - Instagram",
      url: "https://www.instagram.com/lucky_dawg2025/",
    },
    menu: [
      {
        title: "Lucky Dawg menu",
        url: "https://luckydawg.food/",
      },
      {
        title: "Lucky Dawg menu - Toast",
        url: "https://www.toasttab.com/local/order/technology-services-5280-llc-9214-wiltshire-dr",
      },
    ],
    items: [
      {
        name: "Top Dawg",
        description:
          "Chicago style Vienna beef dog topped with sport peppers, green relish, onions, tomatoes, mustard, and a dill pickle spear.",
        price: "",
      },
      {
        name: "Denver Dawg",
        description: "A Denver-style dog with green chili, sour cream, onions, and jalapeno.",
        price: "",
      },
      {
        name: "Uptown Dawg",
        description: "A New York style dog with sweet and sour onion sauce, sauerkraut, and mustard.",
        price: "",
      },
      {
        name: "Chili Dawg",
        description: "All-beef dog topped with beef chili, chopped red onions, and shredded cheddar.",
        price: "",
      },
    ],
  },
  "philly on the go": {
    official: {
      title: "Philly On The Go",
      url: "https://phillyonthego.square.site/",
    },
    facebook: {
      title: "Philly On The Go - Facebook",
      url: "https://www.facebook.com/PhillyOnTheGo",
    },
    instagram: {
      title: "Philly On The Go - Instagram",
      url: "https://www.instagram.com/phillyonthego/",
    },
    menu: [
      {
        title: "Philly On The Go menu - Roaming Hunger",
        url: "https://roaminghunger.com/philly-on-the-go/",
      },
    ],
    items: [
      {
        name: "Pepper Cheese Steak",
        description: "Steak, cheese, onion, and green peppers.",
        price: "",
      },
      {
        name: "Works Cheese Steak",
        description: "Steak, cheese, onions, green peppers, and mushrooms.",
        price: "",
      },
      {
        name: "Chicken Cheese Steak",
        description: "Chicken, cheese, and onions.",
        price: "",
      },
      {
        name: "Mushroom Cheese Steak",
        description: "Mushrooms, green peppers, yellow banana peppers, onions, and sweet n hot peppers.",
        price: "",
      },
      {
        name: "Original Cheese Steak",
        description: "Classic Philly cheesesteak.",
        price: "",
      },
    ],
  },
  "rolling italian": {
    official: {
      title: "The Rolling Italian",
      url: "https://rollingitalianonline.square.site/",
    },
    facebook: {
      title: "The Rolling Italian - Facebook",
      url: "https://www.facebook.com/therollingitalian",
    },
    menu: [
      {
        title: "The Rolling Italian menu - Best Food Trucks",
        url: "https://www.bestfoodtrucks.com/truck/the-rolling-italian/menu",
      },
      {
        title: "The Rolling Italian menu - StreetFoodFinder",
        url: "https://streetfoodfinder.com/RollingItalian",
      },
    ],
    items: [
      { name: "Baked Ziti", description: "Pasta with ricotta, mozzarella, and Italian sauce.", price: "" },
      { name: "Fettuccine Alfredo", description: "Pasta with homemade alfredo cream sauce.", price: "" },
      { name: "Rolling Chicken Parmigiana", description: "Breaded chicken baked with mozzarella.", price: "" },
      { name: "Rolling Eggplant Parmigiana", description: "Breaded eggplant baked with mozzarella.", price: "" },
      { name: "Spaghetti & Meatballs", description: "Pasta with homemade meatballs and sauce.", price: "" },
    ],
  },
  "the rolling italian": {
    official: {
      title: "The Rolling Italian",
      url: "https://rollingitalianonline.square.site/",
    },
    facebook: {
      title: "The Rolling Italian - Facebook",
      url: "https://www.facebook.com/therollingitalian",
    },
    menu: [
      {
        title: "The Rolling Italian menu - Best Food Trucks",
        url: "https://www.bestfoodtrucks.com/truck/the-rolling-italian/menu",
      },
      {
        title: "The Rolling Italian menu - StreetFoodFinder",
        url: "https://streetfoodfinder.com/RollingItalian",
      },
    ],
    items: [
      { name: "Baked Ziti", description: "Pasta with ricotta, mozzarella, and Italian sauce.", price: "" },
      { name: "Fettuccine Alfredo", description: "Pasta with homemade alfredo cream sauce.", price: "" },
      { name: "Rolling Chicken Parmigiana", description: "Breaded chicken baked with mozzarella.", price: "" },
      { name: "Rolling Eggplant Parmigiana", description: "Breaded eggplant baked with mozzarella.", price: "" },
      { name: "Spaghetti & Meatballs", description: "Pasta with homemade meatballs and sauce.", price: "" },
    ],
  },
  "cirque kitchen": {
    official: {
      title: "Cirque Kitchen",
      url: "https://www.cirquekitchen.com/",
    },
    instagram: {
      title: "Cirque Kitchen - Instagram",
      url: "https://www.instagram.com/cirquekitchen/",
    },
    menu: [
      {
        title: "Cirque Kitchen menu",
        url: "https://www.cirquekitchen.com/denver-food-truck-menu",
      },
    ],
    items: [
      { name: "Fried Chicken Sandwich", description: "Cirque Kitchen's elevated fried chicken sandwich.", price: "" },
      { name: "Beef Bowl", description: "A flavorful beef bowl from their rotating street food menu.", price: "" },
      { name: "Tater Tots", description: "Deep-fried mashed potato balls.", price: "" },
      { name: "Burger", description: "A rotating burger option from the Cirque Kitchen truck.", price: "" },
      { name: "Wings", description: "Crispy wings from the rotating menu.", price: "" },
    ],
  },
  "lucky bird": {
    official: {
      title: "Lucky Bird",
      url: "https://luckybirdco.com/food-truck",
    },
    menu: [
      {
        title: "Lucky Bird food truck ordering menu",
        url: "https://order.toasttab.com/online/luckybirdfoodtruck",
      },
    ],
    items: [
      { name: "Lucky Tenders", description: "Hand-breaded chicken tenders with honey mustard.", price: "$11.50" },
      { name: "Asian Tenders", description: "Chicken tenders with sweet and spicy Asian sauce.", price: "$12.50" },
      { name: "Buffalo Blue Tenders", description: "Chicken tenders with buffalo sauce and blue cheese.", price: "$12.50" },
      { name: "Big Bird", description: "Crispy chicken sandwich with mustard slaw, cheddar, and tomato.", price: "$12.50" },
      { name: "Spicy Bird", description: "Crispy chicken sandwich with gochujang butter and house pickles.", price: "$11.50" },
    ],
  },
  "isan thai": {
    facebook: {
      title: "Isan Thai Food Truck - Facebook",
      url: "https://www.facebook.com/IsanThaiFoodTruck",
    },
    instagram: {
      title: "Isan Thai Food Truck - Instagram",
      url: "https://www.instagram.com/isanthaillc/",
    },
    menu: [
      {
        title: "Isan Thai Food Truck menu - MenuPix",
        url: "https://www.menupix.com/denver/restaurants/32249768/Isan-Thai-Food-Truck-Lakewood-CO",
      },
    ],
    items: [
      { name: "Pad Thai", description: "Rice noodles with egg, bean sprouts, peanut, and scallion in tamarind sauce.", price: "$15.95" },
      { name: "Red Curry", description: "Red curry paste in coconut milk with vegetables and Thai basil.", price: "$16.95" },
      { name: "Fresh Roll", description: "Vegetables and protein wrapped in rice paper with peanut sauce.", price: "$6.95" },
      { name: "Potsticker", description: "Pan-fried dumplings with pork and vegetables.", price: "$7.95" },
      { name: "Krab Rangoon", description: "Cream cheese and whitefish wrapped in crispy wonton.", price: "$6.95" },
    ],
  },
  "big stuff": {
    official: {
      title: "Big Stuff Food",
      url: "https://bigstufffood.com/",
    },
    menu: [
      {
        title: "Big Stuff Food menu",
        url: "https://bigstufffood.com/menu/",
      },
    ],
    items: [
      {
        name: "The Big Stuff Burger",
        description:
          "Signature burger served Juicy Lucy style with chipotle cheddar inside, grilled onions, chipotle lime crema, greens, tomato, pork belly, and waffle fries.",
        price: "",
      },
      {
        name: "The Big Stuff Patty Melt",
        description:
          "Burger with green chile braised pork belly, chipotle cheddar, mozzarella, cheddar, and grilled onions on toasted sourdough.",
        price: "",
      },
      {
        name: "Colorado Bahn Mi",
        description: "Big Stuff's Colorado comfort-food take on a banh mi.",
        price: "",
      },
      {
        name: "Danger Mouse",
        description: "Vegetarian option from the Big Stuff menu.",
        price: "",
      },
      {
        name: "Colorado Poutine",
        description:
          "Crispy waffle fries with Wisconsin cheese curds, vegan green chile, and chipotle lime crema.",
        price: "",
      },
      {
        name: "Lil' Stuff Sliders",
        description: "Slider-sized Big Stuff comfort food.",
        price: "",
      },
      {
        name: "Fried Mac and Cheese",
        description: "Handmade mac and cheese, breaded and fried, served with choice of dipper.",
        price: "",
      },
      {
        name: "Chicken Strips",
        description: "Crunchy fried chicken breast strips served with waffle fries and choice of dipper.",
        price: "",
      },
      { name: "Basket of Crispy Waffle Fries", description: "", price: "" },
      { name: "Basket of Sweet Potato Fries", description: "", price: "" },
    ],
  },
  "2-salty sarges": {
    official: {
      title: "2 Salty Sarges",
      url: "https://2saltysarges.com/",
    },
    menu: [
      {
        title: "2 Salty Sarges menu",
        url: "https://2saltysarges.com/menu",
      },
    ],
  },
  "chibby wibbitz": {
    official: {
      title: "Chibby Wibbitz Food Truck",
      url: "https://chibbywibbitz.com/",
    },
    menu: [
      {
        title: "Chibby Wibbitz menu - Food Truck Connector",
        url: "https://www.denverfoodtruckcatering.com/food-trucks/chibby-wibbitz-sliderz-n-bitez/",
      },
      {
        title: "Chibby Wibbitz menu - Best Food Trucks",
        url: "https://www.bestfoodtrucks.com/truck/chibby-wibbitz-sliderz-and-bitez/menu",
      },
    ],
    items: [
      {
        name: "Beef Tacos",
        description:
          "Chopped Angus beef, cilantro garlic sauce, salsa, pickled red onions, queso fresco, and fresh cilantro.",
        price: "$8.00",
      },
      {
        name: "Black Bean Tacos",
        description:
          "Black beans, chipotle salsa, cilantro garlic sauce, pickled onion, queso fresco, and fresh cilantro.",
        price: "$8.00",
      },
      {
        name: "Chibb Jong Un Tot Bowl",
        description: "Korean pork bulgogi, kimchi, gochujang aioli, onions, and sesame seeds.",
        price: "$11.00",
      },
      {
        name: "Chicken Dance",
        description: "Crispy fried boneless chicken thigh, chipotle crema, and pickles.",
        price: "$11.00",
      },
      {
        name: "Chicken Tacos",
        description:
          "Achiote chicken, chipotle salsa, cilantro garlic sauce, pickled onion, queso fresco, and fresh cilantro.",
        price: "$8.00",
      },
      {
        name: "Ugly Pig Sliders",
        description: "Hardwood smoked pulled pork, creamy coleslaw, house BBQ sauce, and pickles.",
        price: "$11.00",
      },
      { name: "Fries", description: "", price: "$5.00" },
      { name: "Just Tots", description: "", price: "$5.00" },
      { name: "Southern Slaw", description: "", price: "$4.00" },
      { name: "Key Lime Pie", description: "", price: "$5.00" },
    ],
  },
  "magic kebob": {
    official: {
      title: "Magic Kebob",
      url: "https://www.magickebob.com/",
    },
    menu: [
      {
        title: "Magic Kebob menu",
        url: "https://www.magickebob.com/menus",
      },
    ],
  },
  "wheels on fire pizza": {
    official: {
      title: "Wheels on Fire Pizza",
      url: "https://www.wheelsonfirepizza.com/",
    },
    facebook: {
      title: "Wheels on Fire Pizza - Facebook",
      url: "https://www.facebook.com/wheelsonfirepizzatruck",
    },
    instagram: {
      title: "Wheels on Fire Pizza - Instagram",
      url: "https://www.instagram.com/wheelsonfiretruck/",
    },
    menu: [
      {
        title: "Wheels on Fire Pizza menu - City Flavor",
        url: "https://auth.cityflavor.com/truck/wheels-on-fire-pizza-truck/",
      },
    ],
  },
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const calendarCache = new Map();
const menuCache = new Map();
const answerCache = new Map();
const menuLookupPromises = new Map();
let warmupPromise = null;
let lastWarmupStartedAt = 0;

function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendText(res, status, text, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type });
  res.end(text);
}

function decodeHtml(input = "") {
  const named = {
    amp: "&",
    apos: "'",
    quot: '"',
    nbsp: " ",
    ndash: "-",
    mdash: "-",
    rsquo: "'",
    lsquo: "'",
    rdquo: '"',
    ldquo: '"',
  };

  return input
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(parseInt(code, 16))
    )
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] || match);
}

function stripHtml(html = "") {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "\n")
      .replace(/<style[\s\S]*?<\/style>/gi, "\n")
      .replace(/<[^>]+>/g, "\n")
  )
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

async function fetchText(url) {
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!response.ok) {
        throw new Error(`Could not fetch ${url}: HTTP ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

function denverToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return makeLocalDate(Number(values.year), Number(values.month), Number(values.day));
}

function makeLocalDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatIso(date) {
  return date.toISOString().slice(0, 10);
}

function formatFriendly(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function parseAskedDate(question) {
  const text = String(question || "").toLowerCase();
  const today = denverToday();

  if (/\btomorrow\b/.test(text)) return addDays(today, 1);
  if (/\byesterday\b/.test(text)) return addDays(today, -1);
  if (/\btoday\b/.test(text) || text.trim().length === 0) return today;

  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return makeLocalDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    let year = slash[3] ? Number(slash[3]) : today.getUTCFullYear();
    if (year < 100) year += 2000;
    return makeLocalDate(year, Number(slash[1]), Number(slash[2]));
  }

  const monthNames =
    "january february march april may june july august september october november december";
  const monthPattern = new RegExp(
    `\\b(${monthNames.split(" ").join("|")})\\s+(\\d{1,2})(?:,?\\s+(20\\d{2}))?\\b`
  );
  const monthMatch = text.match(monthPattern);
  if (monthMatch) {
    const month = monthNames.split(" ").indexOf(monthMatch[1]) + 1;
    const year = monthMatch[3] ? Number(monthMatch[3]) : today.getUTCFullYear();
    return makeLocalDate(year, month, Number(monthMatch[2]));
  }

  const weekdays = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const wantedDay = weekdays.findIndex((day) => new RegExp(`\\b${day}\\b`).test(text));
  if (wantedDay !== -1) {
    const currentDay = today.getUTCDay();
    let offset = (wantedDay - currentDay + 7) % 7;
    if (offset === 0 && /\bnext\b/.test(text)) offset = 7;
    return addDays(today, offset);
  }

  return today;
}

function parseIsoDateParam(value) {
  const match = String(value || "").match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return makeLocalDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

async function getScheduleForMonth(year, month, day = 1) {
  const cacheKey = `${year}-${month}`;
  const cached = calendarCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < 1000 * 60 * 60) return cached.data;

  const url = new URL(CALENDAR_BASE);
  url.searchParams.set("EID", STERLING_EVENT_ID);
  url.searchParams.set("month", String(month));
  url.searchParams.set("year", String(year));
  url.searchParams.set("day", String(day));
  url.searchParams.set("calType", "0");

  const html = await fetchText(url.toString());
  const text = stripHtml(html);
  const schedule = {};
  const matches = text.matchAll(/^(\d{1,2})\/(\d{1,2})\s*[-–]\s*(.+)$/gm);

  for (const match of matches) {
    const eventMonth = Number(match[1]);
    const eventDay = Number(match[2]);
    const truck = match[3].replace(/\s+/g, " ").trim();
    const date = makeLocalDate(year, eventMonth, eventDay);
    schedule[formatIso(date)] = truck;
  }

  const data = { schedule, sourceUrl: url.toString(), fetchedAt: new Date().toISOString() };
  calendarCache.set(cacheKey, { data, savedAt: Date.now() });
  return data;
}

function cleanResultUrl(rawUrl) {
  const decoded = decodeHtml(rawUrl);
  const absolute = decoded.startsWith("//") ? `https:${decoded}` : decoded;

  try {
    const parsed = new URL(absolute);
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : absolute;
  } catch {
    return absolute;
  }
}

function cleanText(input = "") {
  return decodeHtml(input)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreResult(result) {
  const haystack = `${result.title} ${result.snippet} ${result.url}`.toLowerCase();
  let score = 0;
  if (haystack.includes("menu")) score += 5;
  if (haystack.includes("order")) score += 4;
  if (haystack.includes("food truck")) score += 3;
  if (haystack.includes("restaurant")) score += 1;
  if (haystack.includes("facebook") || haystack.includes("instagram")) score += 1;
  if (haystack.includes("doordash") || haystack.includes("toasttab")) score += 2;
  if (haystack.includes("yelp") || haystack.includes("tripadvisor")) score -= 2;
  return score;
}

function normalizeTruckName(truckName) {
  return truckName
    .normalize("NFKD")
    .replace(/[^\w\s&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function knownTruckLinks(truckName) {
  const key = normalizeTruckName(truckName).toLowerCase().replace(/\s*&\s*/g, " ");
  const links = KNOWN_TRUCK_LINKS[key];
  if (!links) return {};

  return {
    official: links.official ? { ...links.official, snippet: "", rank: -10, score: 0 } : null,
    facebook: links.facebook ? { ...links.facebook, snippet: "", rank: -10, score: 0 } : null,
    instagram: links.instagram ? { ...links.instagram, snippet: "", rank: -10, score: 0 } : null,
    menu: Array.isArray(links.menu)
      ? links.menu.map((link, index) => ({
          ...link,
          snippet: "",
          rank: -20 + index,
          score: 0,
        }))
      : [],
    items: Array.isArray(links.items)
      ? links.items.map((item) => ({
          ...item,
          url: item.url || links.menu?.[0]?.url || links.official?.url || "",
        }))
      : [],
  };
}

function getTruckNameTokens(truckName) {
  const genericWords = new Set([
    "and",
    "co",
    "colorado",
    "company",
    "food",
    "llc",
    "the",
    "truck",
  ]);

  return normalizeTruckName(truckName)
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 1 && !genericWords.has(word));
}

function resultMatchesTruck(result, truckName) {
  const haystack = normalizeTruckName(`${result.title || ""} ${result.url || ""}`)
    .toLowerCase()
    .replace(/[-_]+/g, " ");
  const truckNames = String(truckName)
    .split(/\s*&\s*|\s+\+\s+/)
    .map((name) => name.trim())
    .filter(Boolean);

  return truckNames.some((name) => {
    const tokens = getTruckNameTokens(name);
    if (tokens.length === 0) return true;
    if (tokens.length <= 2 && !haystack.includes(tokens.join(" "))) return false;

    return tokens.every((token) => haystack.includes(token));
  });
}

function isDirectoryOrDeliveryLink(url = "") {
  return /(facebook|instagram|yelp|tripadvisor|mapquest|fictionbeer|doordash|ubereats|grubhub|seamless|findmeglutenfree|bestfoodtrucks|streetfoodfinder|gotruckster|menupix|sagemenu|foodtrucksin|roaminghunger|foodfleet|zmenu)\.com/.test(
    url.toLowerCase()
  );
}

function dedupeLinks(links) {
  const seen = new Set();
  return links.filter((link) => {
    const key = link.url.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function searchLinks(query, limit = 5, sortByScore = true) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchText(url);
  const results = [];
  const resultPattern =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

  let rank = 0;
  for (const match of html.matchAll(resultPattern)) {
    const result = {
      title: cleanText(match[2]),
      url: cleanResultUrl(match[1]),
      snippet: cleanText(match[3]),
      rank,
    };
    results.push({ ...result, score: scoreResult(result) });
    rank += 1;
  }

  return results
    .filter((result) => result.title && result.url)
    .sort((a, b) => (sortByScore ? b.score - a.score || a.rank - b.rank : a.rank - b.rank))
    .slice(0, limit);
}

async function safeSearchLinks(query, limit = 5, sortByScore = true) {
  try {
    return await searchLinks(query, limit, sortByScore);
  } catch (error) {
    console.warn(`Search failed for "${query}": ${error.message}`);
    return [];
  }
}

async function searchMenuLinks(truckName) {
  const searchName = normalizeTruckName(truckName);
  const results = await Promise.all([
    safeSearchLinks(`${searchName} food truck Colorado menu`, 8),
    safeSearchLinks(`${searchName} sample menu food truck`, 6),
    safeSearchLinks(`${searchName} food fleet menu`, 6),
    safeSearchLinks(`${searchName} roaming hunger menu`, 6),
  ]);

  return dedupeLinks(results.flat())
    .filter((link) => resultMatchesTruck(link, truckName))
    .sort((a, b) => scoreMenuSource(b) - scoreMenuSource(a) || (a.rank || 0) - (b.rank || 0))
    .slice(0, 10);
}

function scoreMenuSource(link) {
  const haystack = `${link.title || ""} ${link.url || ""} ${link.snippet || ""}`.toLowerCase();
  let score = link.score || 0;

  if (haystack.includes("foodfleet.com")) score += 12;
  if (haystack.includes("sample menu")) score += 10;
  if (haystack.includes("roaminghunger.com")) score += 8;
  if (haystack.includes("bestfoodtrucks.com") || haystack.includes("streetfoodfinder.com")) {
    score += 6;
  }
  if (haystack.includes("zmenu.com")) score += 2;
  if (haystack.includes("doordash.com") || haystack.includes("grubhub.com")) score -= 2;
  if (haystack.includes("facebook.com") || haystack.includes("instagram.com")) score -= 8;

  return score;
}

function slugifyTruckName(truckName) {
  return normalizeTruckName(truckName)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function generatedMenuCandidateLinks(truckName) {
  const slug = slugifyTruckName(truckName);
  if (!slug) return [];

  return [
    {
      title: `${truckName} - Food Fleet`,
      url: `https://www.foodfleet.com/food-fleet-partners/${slug}`,
      snippet: "",
      rank: -3,
      score: 0,
    },
    {
      title: `${truckName} - Roaming Hunger`,
      url: `https://roaminghunger.com/${slug}/`,
      snippet: "",
      rank: -2,
      score: 0,
    },
  ];
}

function findLinkByHost(links, hostPart) {
  return links.find((link) => {
    try {
      return new URL(link.url).host.toLowerCase().includes(hostPart);
    } catch {
      return false;
    }
  });
}

function isHomepage(link) {
  try {
    const pathParts = new URL(link.url).pathname.split("/").filter(Boolean);
    return pathParts.length <= 1;
  } catch {
    return false;
  }
}

function isFacebookProfile(link) {
  try {
    const parsed = new URL(link.url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const blocked = new Set([
      "events",
      "groups",
      "marketplace",
      "pages",
      "photos",
      "posts",
      "reel",
      "share",
      "story.php",
      "videos",
      "watch",
    ]);
    return (
      parsed.host.includes("facebook.com") &&
      ((parts.length === 1 && !blocked.has(parts[0])) ||
        (parts[0] === "people" && parts.length >= 2))
    );
  } catch {
    return false;
  }
}

function isInstagramProfile(link) {
  try {
    const parsed = new URL(link.url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const blocked = new Set(["explore", "p", "reel", "reels", "stories", "tv"]);
    return parsed.host.includes("instagram.com") && parts.length === 1 && !blocked.has(parts[0]);
  } catch {
    return false;
  }
}

async function getFeaturedLinks(truckName) {
  const knownLinks = knownTruckLinks(truckName);
  const searchName = normalizeTruckName(truckName);
  const [
    officialResults,
    facebookSiteResults,
    facebookGeneralResults,
    instagramSiteResults,
    instagramGeneralResults,
  ] = await Promise.all([
    safeSearchLinks(`${searchName} food truck Colorado official website`, 8, false),
    safeSearchLinks(`${searchName} food truck site:facebook.com`, 8, false),
    safeSearchLinks(`${searchName} cafe Facebook`, 8, false),
    safeSearchLinks(`${searchName} food truck site:instagram.com`, 8, false),
    safeSearchLinks(`${searchName} cafe Instagram`, 8, false),
  ]);
  const facebookResults = dedupeLinks([...facebookSiteResults, ...facebookGeneralResults]);
  const instagramResults = dedupeLinks([...instagramSiteResults, ...instagramGeneralResults]);

  const matchingOfficialResults = officialResults.filter((link) =>
    resultMatchesTruck(link, truckName)
  );
  const matchingFacebookResults = facebookResults.filter((link) =>
    resultMatchesTruck(link, truckName)
  );
  const matchingInstagramResults = instagramResults.filter((link) =>
    resultMatchesTruck(link, truckName)
  );

  const official =
    knownLinks.official ||
    matchingOfficialResults
      .filter((link) => !isDirectoryOrDeliveryLink(link.url) && domainMatchesTruck(link, truckName))
      .sort((a, b) => Number(isHomepage(b)) - Number(isHomepage(a)) || a.rank - b.rank)[0] ||
    null;
  const facebook =
    knownLinks.facebook ||
    matchingFacebookResults.find(isFacebookProfile) ||
    findLinkByHost(matchingFacebookResults, "facebook.com");
  const instagram =
    knownLinks.instagram ||
    matchingInstagramResults.find(isInstagramProfile) ||
    findLinkByHost(matchingInstagramResults, "instagram.com");

  return {
    official: official || null,
    facebook: facebook || null,
    instagram: instagram || null,
    knownMenuLinks: knownLinks.menu || [],
    knownItems: knownLinks.items || [],
    allResults: dedupeLinks([
      ...(knownLinks.menu || []),
      ...matchingOfficialResults,
      ...matchingFacebookResults,
      ...matchingInstagramResults,
    ]),
  };
}

function hostRoot(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

function domainMatchesTruck(link, truckName) {
  try {
    const host = normalizeTruckName(new URL(link.url).host.replace(/^www\./, "")).toLowerCase();
    const truckNames = String(truckName)
      .split(/\s*&\s*|\s+\+\s+/)
      .map((name) => name.trim())
      .filter(Boolean);

    return truckNames.some((name) => {
      const tokens = getTruckNameTokens(name);
      return tokens.length > 0 && tokens.every((token) => host.includes(token));
    });
  } catch {
    return false;
  }
}

function inferOfficialLink(links, truckName) {
  const candidates = links.filter(
    (link) =>
      link?.url &&
      !isDirectoryOrDeliveryLink(link.url) &&
      resultMatchesTruck(link, truckName) &&
      domainMatchesTruck(link, truckName)
  );

  const best = candidates.sort(
    (a, b) => Number(isHomepage(b)) - Number(isHomepage(a)) || (a.rank || 0) - (b.rank || 0)
  )[0];
  const root = best ? hostRoot(best.url) : null;

  if (!best || !root) return null;

  return {
    ...best,
    title: best.title || root,
    url: root,
  };
}

function absoluteUrl(url, baseUrl) {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

async function getSocialLinksFromOfficial(officialLink, truckName) {
  if (!officialLink?.url) return {};

  try {
    const html = await fetchText(officialLink.url);
    const links = [...html.matchAll(/href=["']([^"']+)["']/gi)]
      .map((match, index) => ({
        title: "",
        url: absoluteUrl(decodeHtml(match[1]), officialLink.url),
        snippet: "",
        rank: index,
        score: 0,
      }))
      .filter((link) => /facebook\.com|instagram\.com/i.test(link.url));

    const facebook = links.find(isFacebookProfile) || findLinkByHost(links, "facebook.com");
    const instagram = links.find(isInstagramProfile) || findLinkByHost(links, "instagram.com");

    if (facebook) facebook.title = `${truckName} - Facebook`;
    if (instagram) instagram.title = `${truckName} - Instagram`;

    return { facebook: facebook || null, instagram: instagram || null };
  } catch (error) {
    console.warn(`Official social link scan failed for "${truckName}": ${error.message}`);
    return {};
  }
}

function moneyFromWooPrice(prices) {
  if (!prices || !prices.price) return "";
  const amount = Number(prices.price) / 10 ** Number(prices.currency_minor_unit || 2);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: prices.currency_code || "USD",
  }).format(amount);
}

async function tryWooCommerceMenu(siteUrl) {
  const root = hostRoot(siteUrl);
  if (!root) return [];

  const productsUrl = `${root}/wp-json/wc/store/products?per_page=20`;
  const response = await fetch(productsUrl, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
  });

  if (!response.ok) return [];

  const products = await response.json();
  if (!Array.isArray(products)) return [];

  return products.slice(0, 10).map((product) => ({
    name: cleanText(product.name || ""),
    description: cleanText(product.short_description || product.description || ""),
    price: moneyFromWooPrice(product.prices),
    url: product.permalink || siteUrl,
  }));
}

function isPlainPriceLine(line = "") {
  const match = line.match(/^\$?(\d{1,3})(?:\.(\d{2}))?$/);
  if (!match) return false;

  const amount = Number(match[1]);
  return amount > 0 && amount < 100;
}

function formatPlainPrice(line = "") {
  const amount = Number(line.replace("$", ""));
  if (!Number.isFinite(amount)) return "";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function isMenuStopLine(line = "") {
  return /^(find a location|hours|hours may vary by location|about|contact us|contact|about us|our story|savor the flavors|featured|latest|recent posts|upcoming events|book catering|request a quote|copyright|powered by|this website uses cookies)$/i.test(
    line.trim()
  );
}

function isMenuCategoryLine(line = "") {
  const trimmed = line.trim();
  if (/:$/.test(trimmed) || /^[A-Za-z\s]+:\s+/.test(trimmed)) return true;
  if (/^(menu|appetizers?|desserts?|salads?|sides?|drinks?|beverages?)$/i.test(trimmed)) {
    return true;
  }

  if (/^(burgers?|gyros?|mini hoagies)$/i.test(trimmed)) return true;
  if (/^\d+["']?\s+(pizzas?|tacos?|burgers?|sandwiches?)$/i.test(trimmed)) return true;
  return trimmed.length > 3 && trimmed === trimmed.toUpperCase() && /S$/.test(trimmed);
}

function isLikelyMenuItemName(line = "") {
  const trimmed = line.trim();
  if (trimmed.length < 2 || trimmed.length > 80) return false;
  if (isMenuStopLine(trimmed) || isMenuCategoryLine(trimmed)) return false;
  if (/https?:|@|^\$?\d+(?:\.\d{2})?$|&times;|loading|failed to load image|copyright|reserved|cookie/i.test(trimmed)) {
    return false;
  }

  return true;
}

function menuTextWindow(text) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const menuIndex = findMenuStartIndex(lines);
  const start = menuIndex === -1 ? 0 : menuIndex + 1;
  const end = lines.findIndex((line, index) => index > start && isMenuStopLine(line));

  return lines.slice(start, end === -1 ? Math.min(lines.length, start + 180) : end);
}

function findMenuStartIndex(lines) {
  const preferred = lines.findIndex((line) =>
    isStrongMenuHeading(line)
  );
  if (preferred !== -1) return preferred;

  const popularItems = lines.findIndex((line) => /^popular items$/i.test(line.trim()));
  if (popularItems !== -1) return popularItems;

  return lines.findIndex((line) => {
    const trimmed = line.trim();
    if (/^(open|close)\s+menu$/i.test(trimmed)) return false;
    return /\bmenu\b/i.test(trimmed);
  });
}

function isStrongMenuHeading(line = "") {
  const trimmed = line.trim();
  if (trimmed.includes("|") || /^(open|close)?\s*menu$/i.test(trimmed)) return false;
  return /^(sample menu|food truck menu|full menu|our menu|menu items?|popular items|.+\s+menu)$/i.test(trimmed);
}

function isSpecificMenuHeading(line = "") {
  const trimmed = line.trim();
  if (trimmed.includes("|") || /^(open|close)\s+menu$/i.test(trimmed)) return false;
  return /^(sample menu|food truck menu|full menu|our menu|menu items?|popular items|.+\s+menu)$/i.test(trimmed);
}

function normalizeMenuPriceLines(lines) {
  const normalized = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === "$" && /^\d{1,3}(?:\.\d{2})?$/.test(lines[index + 1] || "")) {
      normalized.push(`$${lines[index + 1]}`);
      index += 1;
    } else {
      normalized.push(line);
    }
  }

  return normalized;
}

function collectMenuDescription(lines, startIndex, options = {}) {
  const descriptionParts = [];

  for (let next = startIndex; next < lines.length; next += 1) {
    const line = lines[next];
    const followingLine = lines[next + 1] || "";

    if (isMenuStopLine(line) || isPlainPriceLine(line) || isMenuCategoryLine(line)) break;
    if (
      !options.allowDescriptionBeforePrice &&
      isLikelyMenuItemName(line) &&
      isPlainPriceLine(followingLine)
    ) {
      break;
    }
    if (isPlainPriceLine(line) && isLikelyMenuItemName(followingLine)) break;

    descriptionParts.push(line);
    if (descriptionParts.length >= 2) break;
  }

  return cleanText(descriptionParts.join(" "));
}

function parsePlainTextMenuItems(text, siteUrl) {
  const lines = normalizeMenuPriceLines(menuTextWindow(text));
  const items = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!isPlainPriceLine(lines[index])) continue;

    const previousLine = lines[index - 1] || "";
    const nextLine = lines[index + 1] || "";

    if (
      isLikelyMenuItemName(previousLine) &&
      !isPlainPriceLine(lines[index - 2] || "") &&
      !(isLikelyMenuItemName(lines[index - 2] || "") && isPlainPriceLine(lines[index - 3] || "")) &&
      !/^\+?\$?\d+/i.test(previousLine)
    ) {
      items.push({
        name: cleanMenuItemName(previousLine),
        description: collectMenuDescription(lines, index + 1),
        price: formatPlainPrice(lines[index]),
        url: siteUrl,
      });
      continue;
    }

    const nameBeforeDescription = lines[index - 2] || "";
    if (
      isLikelyMenuItemName(nameBeforeDescription) &&
      isLikelyMenuDescriptionLine(previousLine) &&
      !isPlainPriceLine(lines[index - 3] || "")
    ) {
      items.push({
        name: cleanMenuItemName(nameBeforeDescription),
        description: cleanText(previousLine),
        price: formatPlainPrice(lines[index]),
        url: siteUrl,
      });
      continue;
    }

    if (isLikelyMenuItemName(nextLine)) {
      items.push({
        name: cleanMenuItemName(nextLine),
        description: collectMenuDescription(lines, index + 2, {
          allowDescriptionBeforePrice: true,
        }),
        price: formatPlainPrice(lines[index]),
        url: siteUrl,
      });
    }
  }

  return dedupeMenuItems(items).slice(0, 10);
}

function parseStructuredHtmlMenuItems(html, siteUrl) {
  const items = [];
  const itemPattern =
    /<div[^>]+role=["']listitem["'][\s\S]*?<h4[^>]*>[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>[\s\S]*?<div[^>]+class=["'][^"']*\bprice\b[^"']*["'][^>]*>([\s\S]*?)<\/div>[\s\S]*?<\/h4>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
  const cardPattern =
    /<div[^>]+class=["'][^"']*\btext-start\b[^"']*\bp-3\b[^"']*\bborder\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;

  for (const match of html.matchAll(itemPattern)) {
    const name = cleanMenuItemName(stripHtml(match[1]));
    const price = cleanText(stripHtml(match[2]));
    const description = cleanText(stripHtml(match[3]));

    if (!name || !isLikelyMenuItemName(name) || !isPlainPriceLine(price)) continue;

    items.push({
      name,
      description,
      price: formatPlainPrice(price),
      url: siteUrl,
    });
  }

  for (const match of html.matchAll(cardPattern)) {
    const cardHtml = match[1];
    const nameMatch = cardHtml.match(/<h[3-6][^>]*>([\s\S]*?)<\/h[3-6]>/i);
    const descriptionMatch = cardHtml.match(
      /<div[^>]+class=["'][^"']*\bdescription\b[^"']*["'][^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i
    );
    const name = cleanMenuItemName(stripHtml(nameMatch?.[1] || ""));
    const description = cleanText(stripHtml(descriptionMatch?.[1] || ""));

    if (!name || !description || !isLikelyMenuItemName(name)) continue;
    if (isMenuCategoryLine(name) || /^(submit|book|request|view|log in|sign in)/i.test(name)) continue;

    items.push({
      name,
      description,
      price: "",
      url: siteUrl,
    });
  }

  return dedupeMenuItems(items).slice(0, 10);
}

function isLikelyPricelessMenuItemName(line = "") {
  const trimmed = line.trim();
  if (!isLikelyMenuItemName(trimmed)) return false;
  if (trimmed.length > 56) return false;
  if (/[.!?]$/.test(trimmed)) return false;

  const words = trimmed.split(/\s+/);
  if (words.length > 7) return false;

  const titleishWords = words.filter((word) => /^[A-Z0-9&]/.test(word));
  return titleishWords.length >= Math.max(1, Math.ceil(words.length / 2));
}

function isLikelyMenuDescriptionLine(line = "") {
  const trimmed = line.trim();
  if (!trimmed || isMenuStopLine(trimmed) || isMenuCategoryLine(trimmed)) return false;
  if (/^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(trimmed)) return false;
  if (isPlainPriceLine(trimmed) || /https?:|@|copyright|reserved|cookie/i.test(trimmed)) {
    return false;
  }

  return trimmed.split(/\s+/).length >= 4 || /[,.;]/.test(trimmed);
}

function collectPricelessMenuDescription(lines, startIndex) {
  const descriptionParts = [];

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      isMenuStopLine(line) ||
      isMenuCategoryLine(line) ||
      isPlainPriceLine(line) ||
      isLikelyPricelessMenuItemName(line)
    ) {
      break;
    }
    if (!isLikelyMenuDescriptionLine(line)) break;

    descriptionParts.push(line);
    if (descriptionParts.length >= 2) break;
  }

  return cleanText(descriptionParts.join(" "));
}

function parsePricelessMenuItems(text, siteUrl) {
  const lines = menuTextWindow(text);
  const hasSpecificMenuHeading = text
    .split("\n")
    .some((line) => isSpecificMenuHeading(line));
  const hostSupportsPricelessMenus =
    /foodfleet\.com|roaminghunger\.com|bestfoodtrucks\.com|streetfoodfinder\.com|denverfoodtruckcatering\.com/i.test(
      siteUrl
    );

  if (!hasSpecificMenuHeading && !hostSupportsPricelessMenus) return [];

  const items = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nextLine = lines[index + 1] || "";
    if (isMenuStopLine(line)) break;
    if (!isLikelyPricelessMenuItemName(line) || !isLikelyMenuDescriptionLine(nextLine)) {
      continue;
    }

    items.push({
      name: cleanMenuItemName(line),
      description: collectPricelessMenuDescription(lines, index + 1),
      price: "",
      url: siteUrl,
    });
  }

  return dedupeMenuItems(items).slice(0, 10);
}

async function getMenuPageUrls(siteUrl) {
  const root = hostRoot(siteUrl);
  if (!root) return [siteUrl];

  const urls = [siteUrl, `${root}/menu`, `${root}/food-truck-menu`];

  try {
    const html = await fetchText(siteUrl);
    const menuLinks = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map((match) => ({
        url: absoluteUrl(decodeHtml(match[1]), siteUrl),
        text: cleanText(match[2]),
      }))
      .filter((link) => /\bmenu\b/i.test(`${link.url} ${link.text}`))
      .map((link) => link.url);

    urls.push(...menuLinks);
  } catch {
    // Common menu URLs above are still worth trying.
  }

  return dedupeLinks(urls.map((url) => ({ url }))).map((link) => link.url).slice(0, 5);
}

async function tryPlainTextMenu(siteUrl) {
  const menuUrls = await getMenuPageUrls(siteUrl);
  let bestItems = [];

  for (const menuUrl of menuUrls) {
    try {
      const html = await fetchText(menuUrl);
      const text = stripHtml(html);
      const structuredItems = parseStructuredHtmlMenuItems(html, menuUrl);
      const items = structuredItems.length
        ? structuredItems
        : [...parsePlainTextMenuItems(text, menuUrl), ...parsePricelessMenuItems(text, menuUrl)];
      if (items.length > bestItems.length) bestItems = items;
      if (bestItems.length >= 10) break;
    } catch {
      // Try the next likely menu URL.
    }
  }

  return bestItems.slice(0, 10);
}

function menuCandidateUrls(links, truckName) {
  return dedupeLinks(
    [...generatedMenuCandidateLinks(truckName), ...links]
      .filter((link) => link?.url && !/facebook\.com|instagram\.com/i.test(link.url))
      .sort((a, b) => scoreMenuSource(b) - scoreMenuSource(a) || (a.rank || 0) - (b.rank || 0))
  )
    .map((link) => link.url)
    .slice(0, 6);
}

function cleanMenuItemName(line = "") {
  return cleanText(line).replace(/^\*+/, "").trim();
}

function dedupeMenuItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.name}|${item.price}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return item.name;
  });
}

async function getMenuForTruck(truckName) {
  const cacheKey = `${MENU_CACHE_VERSION}:${truckName.toLowerCase()}`;
  const cached = menuCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < 1000 * 60 * 30) return cached.data;
  if (menuLookupPromises.has(cacheKey)) return menuLookupPromises.get(cacheKey);

  const lookup = (async () => {
    const featuredLinks = await getFeaturedLinks(truckName);
    const menuLinks = dedupeLinks([
      ...(featuredLinks.knownMenuLinks || []),
      ...(await searchMenuLinks(truckName)),
    ]);
    const official =
      featuredLinks.official || inferOfficialLink([...menuLinks, ...featuredLinks.allResults], truckName);
    const socialFromOfficial = official ? await getSocialLinksFromOfficial(official, truckName) : {};
    const enhancedFeaturedLinks = {
      official,
      facebook: featuredLinks.facebook || socialFromOfficial.facebook || null,
      instagram: featuredLinks.instagram || socialFromOfficial.instagram || null,
    };
    let links = dedupeLinks([
      ...(enhancedFeaturedLinks.official ? [enhancedFeaturedLinks.official] : []),
      ...(enhancedFeaturedLinks.facebook ? [enhancedFeaturedLinks.facebook] : []),
      ...(enhancedFeaturedLinks.instagram ? [enhancedFeaturedLinks.instagram] : []),
      ...menuLinks,
      ...featuredLinks.allResults,
    ]).slice(0, 8);
    const menuItems = [];
    let menuSourceUrl = "";

    if (menuItems.length === 0) {
      for (const knownMenuLink of featuredLinks.knownMenuLinks || []) {
        try {
          menuItems.push(...(await tryPlainTextMenu(knownMenuLink.url)));
        } catch {
          // Keep trying the next menu source.
        }
        if (menuItems.length > 0) {
          menuSourceUrl = knownMenuLink.url;
          break;
        }
      }
    }

    if (enhancedFeaturedLinks.official) {
      if (menuItems.length === 0) {
        try {
          menuItems.push(...(await tryWooCommerceMenu(enhancedFeaturedLinks.official.url)));
        } catch {
          // Some sites block product APIs. The links are still useful.
        }
      }

      if (menuItems.length === 0) {
        try {
          menuItems.push(...(await tryPlainTextMenu(enhancedFeaturedLinks.official.url)));
          if (menuItems.length > 0) menuSourceUrl = enhancedFeaturedLinks.official.url;
        } catch {
          // Many small business sites are hand-built. If parsing fails, keep the links.
        }
      }
    }

    if (menuItems.length === 0) {
      for (const menuUrl of menuCandidateUrls(links, truckName)) {
        try {
          menuItems.push(...(await tryPlainTextMenu(menuUrl)));
        } catch {
          // Keep trying other likely menu sources.
        }
        if (menuItems.length > 0) {
          menuSourceUrl = menuUrl;
          break;
        }
      }
    }

    if (menuItems.length === 0 && featuredLinks.knownItems?.length) {
      menuItems.push(...featuredLinks.knownItems);
      menuSourceUrl = featuredLinks.knownItems[0].url || menuSourceUrl;
    }

    if (menuSourceUrl) {
      links = dedupeLinks([
        { title: `${truckName} menu source`, url: menuSourceUrl, snippet: "", rank: -1, score: 0 },
        ...links,
      ]).slice(0, 8);
    }

    const data = {
      featuredLinks: {
        official: enhancedFeaturedLinks.official,
        facebook: enhancedFeaturedLinks.facebook,
        instagram: enhancedFeaturedLinks.instagram,
      },
      links,
      items: menuItems.slice(0, 10),
    };
    menuCache.set(cacheKey, { data, savedAt: Date.now() });
    return data;
  })().finally(() => {
    menuLookupPromises.delete(cacheKey);
  });

  menuLookupPromises.set(cacheKey, lookup);
  return lookup;
}

function buildAnswer({ question, targetDate, truck, calendar, menu }) {
  const friendlyDate = formatFriendly(targetDate);
  if (!truck) {
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

  const itemText = menu.items.length
    ? ` I found menu items like ${menu.items
        .slice(0, 3)
        .map((item) => item.name)
        .join(", ")}.`
    : " I found the truck, but could not read menu items automatically this time. The links below are the best places to check.";

  return {
    text: `For ${friendlyDate}, the listed food truck is ${truck}.${itemText}`,
    date: formatIso(targetDate),
    friendlyDate,
    truck,
    sourceUrl: calendar.sourceUrl,
    checkedAt: new Date().toISOString(),
    menu,
    question,
  };
}

async function getAnswerForDate(question, targetDate) {
  const dateKey = formatIso(targetDate);
  const cached = answerCache.get(dateKey);
  if (cached && Date.now() - cached.savedAt < ANSWER_CACHE_TTL_MS) {
    return { ...cached.data, question };
  }

  const year = targetDate.getUTCFullYear();
  const month = targetDate.getUTCMonth() + 1;
  const day = targetDate.getUTCDate();
  const calendar = await getScheduleForMonth(year, month, day);
  const truck = calendar.schedule[dateKey] || "";
  const menu = truck ? await getMenuForTruck(truck) : { links: [], items: [] };
  const data = buildAnswer({ question, targetDate, truck, calendar, menu });
  answerCache.set(dateKey, { data, savedAt: Date.now() });
  return data;
}

async function handleAsk(req, res, url) {
  const question = url.searchParams.get("q") || "";
  const targetDate = parseIsoDateParam(url.searchParams.get("date")) || parseAskedDate(question);
  sendJson(res, 200, await getAnswerForDate(question, targetDate));
}

async function handleSchedule(req, res, url) {
  const today = denverToday();
  const year = Number(url.searchParams.get("year")) || today.getUTCFullYear();
  const month = Number(url.searchParams.get("month")) || today.getUTCMonth() + 1;
  const calendar = await getScheduleForMonth(year, month);
  sendJson(res, 200, calendar);
}

function startWarmup(days = 8) {
  const now = Date.now();
  if (warmupPromise || now - lastWarmupStartedAt < WARMUP_INTERVAL_MS) return false;

  lastWarmupStartedAt = now;
  warmupPromise = warmUpcomingDates(days)
    .catch((error) => {
      console.warn(`Warmup failed: ${error.message}`);
    })
    .finally(() => {
      warmupPromise = null;
    });
  return true;
}

async function warmUpcomingDates(days) {
  const today = denverToday();
  const dates = Array.from({ length: days }, (_, index) => addDays(today, index));

  for (const date of dates) {
    try {
      await getAnswerForDate("warmup", date);
    } catch (error) {
      console.warn(`Warmup failed for ${formatIso(date)}: ${error.message}`);
    }
  }
}

async function handleWarmup(req, res, url) {
  const requestedDays = Number(url.searchParams.get("days")) || 8;
  const days = Math.max(1, Math.min(requestedDays, 10));
  const started = startWarmup(days);
  sendJson(res, 202, { warming: Boolean(warmupPromise), started });
}

function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }

    const type = mimeTypes[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, {
      "content-type": type,
      "content-length": data.length,
      "cache-control": requested.includes("social-preview")
        ? "public, max-age=86400"
        : "public, max-age=300",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/ask") {
      await handleAsk(req, res, url);
      return;
    }

    if (url.pathname === "/api/schedule") {
      await handleSchedule(req, res, url);
      return;
    }

    if (url.pathname === "/api/warmup") {
      await handleWarmup(req, res, url);
      return;
    }

    serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, {
      error: "Something went wrong while checking the truck/menu.",
      detail: error.message,
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Food truck chat is running on ${HOST}:${PORT}`);
});
