const JUNK_MENU_ITEM_FIXTURES = [
  { name: "Food Trucks, Ice Cream, Yogurt", description: "", url: "https://www.menupix.com/example" },
  { name: "Best of Denver", description: "", url: "https://www.menupix.com/example" },
  { name: "Food Trucks in Denver", description: "", url: "https://www.menupix.com/example" },
  { name: "Recent Reviews", description: "1.", url: "https://www.menupix.com/example" },
  {
    name: "Pho Evergreen Bar & Grill",
    description: "I love pho it's amazing I also love the atmosphere phil is a great worker...",
    url: "https://www.menupix.com/example",
  },
  { name: "SEE MORE FOOD", description: "ELEVATE YOUR TASTE BUDS!", url: "https://www.saucychops5280.com/" },
  {
    name: "Past Catering Events",
    description: "event organizers have booked Berliner Haus",
    url: "https://roaminghunger.com/berliner-haus/",
  },
  { name: "Boulder, CO", description: "+ attendees Corporate", url: "https://roaminghunger.com/berliner-haus/" },
  { name: "Boulder, CO", description: "+ attendees Meet", url: "https://roaminghunger.com/berliner-haus/" },
  { name: "Main", description: "", url: "https://roaminghunger.com/berliner-haus/" },
  { name: "Meet", description: "", url: "https://www.bohemianwurst.com/menu-1" },
  {
    name: "Zdenek Srom & Angelie Timm",
    description: "What is your favorite dish on the menu? Giant Pretzel and Bier Cheese!",
    url: "https://www.bohemianwurst.com/menu-1",
  },
  {
    name: "Berliner Haus",
    description: "3200 N Pecos St Kitchen 103, Denver, CO 80211, USA",
    url: "https://hello.food/restaurants/colorado/berliner-haus",
  },
  { name: "(4.7/5)", description: "Visitors' reviews on Berliner Haus /", url: "https://example.com" },
  { name: "Request content removal", description: "Burak Beldek 3 months ago on Google", url: "https://example.com" },
  { name: "All reviews", description: "+1 720-446-9178 Open now", url: "https://example.com" },
  {
    name: "Years of Experience",
    description: "Days a Week Availability FEATURED MENU",
    url: "http://www.muylocotacos.com/",
  },
  {
    name: "MISSION STATEMENT",
    description: "Our mission is to deliver an unforgettable culinary adventure.",
    url: "http://www.muylocotacos.com/",
  },
  {
    name: "UNPARALLELED CUSTOMER SERVICE",
    description: "We pride ourselves on delivering exceptional service.",
    url: "http://www.muylocotacos.com/",
  },
  {
    name: "How It Works",
    description: "Give Us Details",
    url: "https://roaminghunger.com/food-truck-catering/",
  },
  {
    name: "Choose Your Cuisine",
    description: "We'll send you a list of available food trucks.",
    url: "https://roaminghunger.com/food-truck-catering/",
  },
  {
    name: "Get Ready to Dig In",
    description: "We'll negotiate the best rate and coordinate the logistics.",
    url: "https://roaminghunger.com/food-truck-catering/",
  },
];
const VALID_MENU_ITEM_FIXTURES = [
  {
    name: "Chicken Taco",
    description: "Corn tortilla with chicken, Cotija, crema, Pico De Gallo, and cilantro.",
    url: "https://www.instagram.com/muylocotacos/",
  },
  {
    name: "The Burning Oven - Margherita",
    description: "Wood-fired pizza with tomato sauce, fresh mozzarella and basil.",
    price: "$14.00",
    url: "https://theburningoven.com/",
  },
  {
    name: "The Bratwurst",
    description: "Smoked pork and beef bratwurst served with homemade sauerkraut and signature sauce.",
    price: "$16.00",
    url: "https://www.bohemianwurst.com/menu-1",
  },
];
const FOOD_WORD_PATTERN =
  /\b(al pastor|arepa|arepas|asada|bacon|bbq|beans|beef|bier|birria|bowl|bratwurst|burger|burrito|cake|carne|cheese|chicken|chips|chorizo|corn|cream|crema|dessert|dog|doner|dumpling|dumplings|elote|elotes|falafel|fries|garlic|gelato|gyro|gyros|ham|hot dog|ice|italian ice|kebab|knots?|lamb|lemonade|mac|meat|mozzarella|nacho|nachos|pepperoni|pierogi|pierogies|pizza|pork|pretzel|quesadilla|queso|guac|salsa|poppers|rice|ribs|salad|sandwich|sandwiches|sausage|shrimp|slider|sliders|soda|taco|tacos|tapas|tostada|tostadas|tender|tenders|torta|veggie|wings?|wurst)\b/i;
const PAGE_FURNITURE_PATTERN =
  /\b(food trucks near|food trucks, ice cream|best of denver|food trucks in denver|recent reviews|sign up|get the streetfoodfinder app|streetfoodfinder app|more about this truck|united states|see more food|elevate your taste buds|past catering events|event organizers have booked|attendees corporate|attendees meet|visitors' reviews|request content removal|all reviews|open now|years of experience|mission statement|unparalleled customer service|outdoor seating|offers takeout|ultimate street food adventure|days a week availability|go-to spot|customer service|our mission|we pride ourselves|book catering|request a quote|how it works|choose your cuisine|get ready to dig in|give us details|get started|sit back and relax|payments|support|caterers|our experience|repeat repeat)\b/i;
const REVIEW_OR_STORY_PATTERN =
  /\b(we hired|our wedding|bride|groom|guests|phenomenal food|favorite dish|what is your favorite dish|google review|visitors' reviews|request content removal)\b/i;

function itemText(item = {}) {
  return `${item.name || ""} ${item.description || ""}`.trim();
}

function itemName(item = {}) {
  return `${item.name || ""}`.trim();
}

function hasDishSignal(item = {}) {
  const text = itemText(item);
  if (isJunkMenuItem(item)) return false;
  if (FOOD_WORD_PATTERN.test(text)) return true;

  const name = itemName(item);
  const wordCount = name.split(/\s+/).filter(Boolean).length;
  const hasPrice = Boolean(`${item.price || ""}`.trim());

  return hasPrice && wordCount > 0 && wordCount <= 5 && !PAGE_FURNITURE_PATTERN.test(text);
}

function isJunkMenuItem(item = {}) {
  const text = itemText(item).toLowerCase();
  const source = `${item.url || ""}`.toLowerCase();
  const name = itemName(item).toLowerCase();

  if (/^(main|meet|see more food|past catering events|dinner|mission statement)$/i.test(name)) {
    return true;
  }

  if (PAGE_FURNITURE_PATTERN.test(text) || REVIEW_OR_STORY_PATTERN.test(text)) {
    return true;
  }

  if (/^[a-z .'-]+,\s*[a-z]{2}$/i.test(name) && /\b(attendees?|meet|corporate|event organizers?)\b/i.test(text)) {
    return true;
  }

  if (/\b\d+\s+.+,\s*[a-z .'-]+,\s*[a-z]{2}\s+\d{5}\b/i.test(text)) {
    return true;
  }

  if (/^[A-Z0-9 '&-]{5,}$/.test(itemName(item)) && !FOOD_WORD_PATTERN.test(text)) {
    return true;
  }

  return source.includes("streetfoodfinder.com/menu") || source.includes("menupix.com");
}

function describeMenuQuality(items = []) {
  if (!items.length) return "no menu items";

  const junkItems = items.filter(isJunkMenuItem);
  const dishItems = items.filter(hasDishSignal);
  const dishRatio = dishItems.length / items.length;
  const junkRatio = junkItems.length / items.length;

  if (junkItems.length) {
    return `junk item(s): ${junkItems.map((item) => item.name).join(", ")}`;
  }

  if (items.length >= 3 && dishItems.length < 2) {
    return `only ${dishItems.length}/${items.length} item(s) look like actual dishes`;
  }

  if (items.length >= 5 && dishRatio < 0.5) {
    return `only ${dishItems.length}/${items.length} item(s) have food words`;
  }

  if (junkRatio >= 0.25) {
    return `too many page-text item(s): ${junkItems.map((item) => item.name).join(", ")}`;
  }

  return "";
}

function assertMenuQualityFixtures() {
  const missedItems = JUNK_MENU_ITEM_FIXTURES.filter((item) => !isJunkMenuItem(item));
  const falsePositiveItems = VALID_MENU_ITEM_FIXTURES.filter(isJunkMenuItem);
  const validMenuIssue = describeMenuQuality(VALID_MENU_ITEM_FIXTURES);
  const junkMenuIssue = describeMenuQuality(JUNK_MENU_ITEM_FIXTURES.slice(-3));

  if (missedItems.length) {
    throw new Error(
      `Junk menu filter missed known bad item(s): ${missedItems.map((item) => item.name).join(", ")}`
    );
  }

  if (falsePositiveItems.length) {
    throw new Error(
      `Junk menu filter rejected valid item(s): ${falsePositiveItems.map((item) => item.name).join(", ")}`
    );
  }

  if (validMenuIssue) {
    throw new Error(`Menu quality filter rejected valid menu fixture: ${validMenuIssue}`);
  }

  if (!junkMenuIssue) {
    throw new Error("Menu quality filter accepted a junk menu fixture.");
  }
}

module.exports = {
  JUNK_MENU_ITEM_FIXTURES,
  VALID_MENU_ITEM_FIXTURES,
  assertMenuQualityFixtures,
  describeMenuQuality,
  hasDishSignal,
  isJunkMenuItem,
};
