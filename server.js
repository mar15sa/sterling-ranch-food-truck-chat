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
const MENU_CACHE_VERSION = "menus-v16";
const FETCH_TIMEOUT_MS = 8000;
const ANSWER_CACHE_TTL_MS = 1000 * 60 * 10;
const WARMUP_INTERVAL_MS = 1000 * 60 * 15;
const LOCAL_EVENT_OVERRIDES = {
  "2026-06-06": {
    location: "Prospect Park",
    trucks: ["Uptown & Humboldt", "Woodhill Small Batch BBQ", "Repicci's Italian Ice"],
  },
};
const KNOWN_TRUCK_LINKS = {
  "berliner haus": {
    official: {
      title: "CO Berliner Haus",
      url: "https://www.co-berliner-haus.com/",
    },
    instagram: {
      title: "CO Berliner Haus - Instagram",
      url: "https://www.instagram.com/coberlinerhaus/",
    },
    menu: [
      {
        title: "CO Berliner Haus menu",
        url: "https://www.co-berliner-haus.com/menu",
      },
      {
        title: "Berliner Haus menu - Roaming Hunger",
        url: "https://roaminghunger.com/berliner-haus/",
      },
      {
        title: "Berliner Haus ordering menu - Toast",
        url: "https://www.toasttab.com/local/order/berliner-haus-denver-3200-north-pecos-street",
      },
    ],
    items: [
      {
        name: "Berliner Doner Kebab",
        description: "Signature doner kebab packed with authentic flavors and fresh ingredients.",
        price: "",
      },
      {
        name: "Chicken Doner",
        description:
          "Chicken doner kebab with salad mix on pide bread and a choice of white garlic sauce, red chili sauce, or both.",
        price: "$14.00",
      },
      {
        name: "Doner Rice Box",
        description:
          "Rice topped with chicken, falafel, or beef and lamb doner, plus feta cheese, salad mix, and sauces.",
        price: "$14.00",
      },
      {
        name: "Doner Platter",
        description: "A deconstructed doner kebab served with larger portions.",
        price: "$16.00",
      },
    ],
  },
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
  "bohemian wurst": {
    official: {
      title: "Bohemian Wurst",
      url: "https://www.bohemianwurst.com/",
    },
    facebook: {
      title: "Bohemian Wurst - Facebook",
      url: "https://facebook.com/bohemianwurst/",
    },
    instagram: {
      title: "Bohemian Wurst - Instagram",
      url: "https://instagram.com/bohemianwurst",
    },
    menu: [
      {
        title: "Bohemian Wurst menu",
        url: "https://www.bohemianwurst.com/menu-1",
      },
    ],
    items: [
      {
        name: "Warm Giant Pretzel",
        description: "Soft Bavarian pretzel, buttered and salted, with optional homemade cheese sauce.",
        price: "$12.00",
      },
      {
        name: "Pierogies",
        description: "Homemade potato and cheese dumplings served with sour cream.",
        price: "$12.00",
      },
      {
        name: "The Bratwurst",
        description: "Smoked pork and beef bratwurst served with homemade sauerkraut and signature sauce.",
        price: "$16.00",
      },
      {
        name: "Colorado Wurst",
        description: "Elk, jalapeno, and cheddar bratwurst served with cheese and jalapenos.",
        price: "$16.00",
      },
      {
        name: "Vienna Double Dog",
        description: "Two beef and pork frankfurters served with homemade pepper-pickle relish and signature sauce.",
        price: "$16.00",
      },
    ],
  },
  "krazy thai": {
    official: {
      title: "Krazy Thai",
      url: "https://www.krazythaifood.com/",
    },
    menu: [
      {
        title: "Krazy Thai menu",
        url: "https://www.krazythaifood.com/menu/menu",
      },
    ],
    items: [
      {
        name: "Pad Thai Noodles",
        description: "Rice noodles with chicken, egg, bean sprouts, green onions, and crushed peanuts.",
        price: "$14.00",
      },
      {
        name: "Thai Fried Rice",
        description: "Fried rice with chicken, egg, broccoli, onions, and carrots.",
        price: "$14.00",
      },
      {
        name: "Drunken Noodles",
        description: "Wide rice noodles with chicken, onions, carrots, broccoli, bean sprouts, and basil.",
        price: "$14.00",
      },
      {
        name: "Crab Cheese Wontons",
        description: "Six fried crab cheese wontons with signature house dipping sauce.",
        price: "$7.00",
      },
      {
        name: "Thai Iced Tea",
        description: "",
        price: "$4.00",
      },
    ],
  },
  "colorado chile co": {
    official: {
      title: "Colorado Chile Company",
      url: "https://www.coloradochileco.com/",
    },
    menu: [
      {
        title: "Colorado Chile Company menu",
        url: "https://www.coloradochileco.com/",
      },
    ],
    items: [
      {
        name: "Korean BBQ Totchos",
        description: "Colorado Chile Company menu item featuring Pueblo green chiles.",
        price: "",
      },
      {
        name: "Jalapeno Bacon Burger",
        description: "Colorado Chile Company menu item featuring Pueblo green chiles.",
        price: "",
      },
      {
        name: "Shaved Elk Brisket Sandwich",
        description: "Colorado Chile Company sandwich featuring lean elk and Pueblo green chiles.",
        price: "",
      },
      {
        name: "Bison Asada Wrap",
        description: "Colorado Chile Company wrap featuring lean bison and Pueblo green chiles.",
        price: "",
      },
    ],
  },
  "kona ice": {
    official: {
      title: "Kona Ice",
      url: "https://www.kona-ice.com/",
    },
    facebook: {
      title: "Kona Ice - Facebook",
      url: "https://www.facebook.com/konaiceexperience/",
    },
    instagram: {
      title: "Kona Ice - Instagram",
      url: "https://www.instagram.com/konaice/",
    },
    menu: [
      {
        title: "Kona Ice cup-size menu",
        url: "https://www.kona-ice.com/wp-content/uploads/2024/07/Menu-Kona-cup-sizes.pdf",
      },
    ],
    items: [
      {
        name: "Kona Ice Klassic",
        description: "12-ounce shaved ice cup; sugar-free flavors are available upon request.",
        price: "$4.00",
        url: "https://www.kona-ice.com/wp-content/uploads/2024/07/Menu-Kona-cup-sizes.pdf",
      },
      {
        name: "Kona Ice King",
        description: "16-ounce shaved ice cup; sugar-free flavors are available upon request.",
        price: "$5.00",
        url: "https://www.kona-ice.com/wp-content/uploads/2024/07/Menu-Kona-cup-sizes.pdf",
      },
      {
        name: "Kona Ice Color Changing Cup",
        description: "17-ounce shaved ice cup; sugar-free flavors are available upon request.",
        price: "$6.00",
        url: "https://www.kona-ice.com/wp-content/uploads/2024/07/Menu-Kona-cup-sizes.pdf",
      },
      {
        name: "Kona Ice Kowabunga",
        description: "22-ounce shaved ice cup; sugar-free flavors are available upon request.",
        price: "$7.00",
        url: "https://www.kona-ice.com/wp-content/uploads/2024/07/Menu-Kona-cup-sizes.pdf",
      },
    ],
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
    menu: [
      {
        title: "Uptown & Humboldt food truck menu",
        url: "https://www.uptownhumboldt.com/Menus",
      },
      {
        title: "Uptown & Humboldt menu - Best Food Trucks",
        url: "https://www.bestfoodtrucks.com/truck/uptown-humboldt/menu",
      },
    ],
    items: [
      {
        name: "Uptown & Humboldt - American Burger",
        description:
          "Brioche bun, cheddar cheese, tomato, microgreens, pickled onions, and G's Fry Sauce.",
        price: "$14.00",
      },
      {
        name: "Uptown & Humboldt - Berlin Burger",
        description:
          "Pretzel bun with mozzarella, sauteed cabbage, microgreens, tomato, ground seed mustard, pickled onions, crushed kettle chips, and G's Fry Sauce.",
        price: "$10.00",
      },
      {
        name: "Uptown & Humboldt - Falafel Gyro",
        description:
          "Vegetarian gyro with lettuce, tomato, cucumber, feta, pickled onions, harissa, and tzatziki.",
        price: "$10.00",
      },
      {
        name: "Uptown & Humboldt - Lamb Gyro",
        description:
          "Lamb gyro with lettuce, tomato, cucumber, pickled onions, feta, and garlic cilantro aioli.",
        price: "$10.00",
      },
    ],
  },
  "woodhill small batch bbq": {
    preferKnownItems: true,
    official: {
      title: "Woodhill Small Batch BBQ",
      url: "https://woodhillbbq.com/",
    },
    menu: [
      {
        title: "Woodhill Small Batch BBQ menu",
        url: "https://woodhillbbq.com/menu/",
      },
    ],
    items: [
      {
        name: "Woodhill BBQ - Brisket Sandwich",
        description: "Smoked brisket sandwich from Woodhill's sandwich menu.",
        price: "$14.79",
      },
      {
        name: "Woodhill BBQ - Pulled Pork Sandwich",
        description: "Pulled pork sandwich; cole slaw can be added on top.",
        price: "$12.99",
      },
      {
        name: "Woodhill BBQ - One Meat + One Side Plate",
        description: "Choice of brisket, pork, sausage, chicken, or ribs with one side.",
        price: "$16.49",
      },
      {
        name: "Woodhill BBQ - Smoked Mac n Meat",
        description: "Smoked mac and cheese bowl topped with brisket, pork, sausage, or chicken.",
        price: "$15.99",
      },
    ],
  },
  "repicci s italian ice": {
    preferKnownItems: true,
    official: {
      title: "Repicci's Real Italian Ice",
      url: "https://www.italianice.com/",
    },
    instagram: {
      title: "Repicci's - Instagram",
      url: "https://www.instagram.com/repiccis/",
    },
    menu: [
      {
        title: "Repicci's Real Italian menu",
        url: "https://www.italianice.com/menu",
      },
      {
        title: "Repicci's Italian Ice & Gelato of Denver menu",
        url: "https://www.denverfoodtruckcatering.com/food-trucks/repiccis-italian-ice-%26-gelato-of-denver/menu/",
      },
    ],
    items: [
      {
        name: "Repicci's - Italian Ice",
        description: "Fruit-flavored Italian ice; daily flavors may vary by location.",
        price: "",
      },
      {
        name: "Repicci's - Gelato",
        description: "Gelato flavors such as vanilla bean, dark chocolate, salted caramel, and coconut.",
        price: "",
      },
      {
        name: "Repicci's - Gelati",
        description: "A blend of Italian ice and gelato with mix-and-match flavors.",
        price: "",
      },
      {
        name: "Repicci's - Strawberry Lemonade Combo",
        description: "Recommended Italian ice combination of lemon and strawberry.",
        price: "",
      },
    ],
  },
  "sizzle dirty pop": {
    preferKnownItems: true,
    official: {
      title: "Sizzle Food Truck",
      url: "https://sizzlefoodtruck.com/",
    },
    menu: [
      {
        title: "Sizzle Food Truck menu",
        url: "https://sizzlefoodtruck.com/menu",
      },
      {
        title: "Dirty Pop menu",
        url: "https://www.visitdirtypop.com/",
      },
      {
        title: "Sizzle Food Truck - Denver Food Truck Connector",
        url: "https://www.denverfoodtruckcatering.com/food-trucks/sizzle-food-truck/",
      },
    ],
    items: [
      {
        name: "Sizzle - Pork Carnitas Quesadilla",
        description:
          "Pork carnitas quesadilla with mozzarella, cheddar jack, flour tortilla, and seasoned fries.",
        price: "$13.39",
      },
      {
        name: "Sizzle - Samurai Jasmine Rice Plate",
        description:
          "Five-spice teriyaki salmon or chicken with coconut rice, vegetables, Thai aioli, and sesame seeds.",
        price: "$18.09",
      },
      {
        name: "Sizzle - Rodeo Burger with Seasoned Fries",
        description:
          "Angus beef burger with BBQ sauce, cheddar jack, herb mayo, honey bacon, vegetables, and crispy shallots.",
        price: "$15.99",
      },
      {
        name: "Dirty Pop - The Dirty Pop",
        description: "Coke with coconut, vanilla, and coconut cream.",
        price: "",
      },
      {
        name: "Dirty Pop - Salted Pretzel Bites",
        description: "Buttery warm salted pretzel bites; cheese dipping sauce available.",
        price: "$3.99+",
      },
    ],
  },
  "cooking with a crown": {
    preferKnownItems: true,
    official: {
      title: "Cooking With A Crown",
      url: "https://cookingwithacrown.square.site/",
    },
    menu: [
      {
        title: "Cooking With A Crown menu",
        url: "https://cookingwithacrown.square.site/",
      },
      {
        title: "Cooking With A Crown - Best Food Trucks",
        url: "https://www.bestfoodtrucks.com/truck/cooking-with-a-crown",
      },
    ],
    items: [
      {
        name: "Birria Tacos (4)",
        description: "Four beef birria tacos with cheese, onions, cilantro, and consomme.",
        price: "$15.00",
      },
      {
        name: "Birria Quesadilla",
        description: "Large birria quesadilla with cheese, onions, cilantro, and consomme.",
        price: "$15.00",
      },
      {
        name: "Birria Nachos",
        description: "Nachos loaded with queso, birria, cheese, onion, and cilantro.",
        price: "$20.00",
      },
      {
        name: "Birria Burrito",
        description: "Birria burrito from the truck's featured menu.",
        price: "$15.00",
      },
      {
        name: "Cinnamon Roll",
        description: "Homemade cinnamon roll with brown butter cream cheese frosting.",
        price: "$6.00",
      },
    ],
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
  "shugg s bbq": {
    facebook: {
      title: "Shuggs BBQ - Facebook",
      url: "https://www.facebook.com/Shuggsbbq.co/",
    },
    menu: [
      {
        title: "Shuggs BBQ - FoodTrucksIn",
        url: "https://www.foodtrucksin.com/shuggs-bbq",
      },
      {
        title: "Shuggs BBQ - City Flavor",
        url: "https://www.cityflavor.com/truck/shuggs-bbq/",
      },
    ],
    items: [
      {
        name: "Ribs",
        description: "BBQ ribs listed by the truck's owner-verified FoodTrucksIn profile.",
        price: "",
      },
      {
        name: "Brisket",
        description: "Smoked brisket listed by the truck's owner-verified FoodTrucksIn profile.",
        price: "",
      },
      {
        name: "Loaded Pulled Pork BBQ Sliders",
        description: "Pulled pork BBQ sliders listed by the truck's owner-verified FoodTrucksIn profile.",
        price: "",
      },
      {
        name: "Homemade Sides",
        description: "Homemade sides mentioned in a River North Brewery food-truck event listing.",
        price: "",
      },
    ],
  },
  "saucy chops": {
    official: {
      title: "Saucy Chops Food Truck & Catering",
      url: "https://www.saucychops5280.com/",
    },
    instagram: {
      title: "Saucy Chops - Instagram",
      url: "https://www.instagram.com/saucychops5280/",
    },
    menu: [
      {
        title: "Saucy Chops menu",
        url: "https://www.saucychops5280.com/",
      },
      {
        title: "Saucy Chops menu - Roaming Hunger",
        url: "https://roaminghunger.com/saucy-chops/",
      },
    ],
    items: [
      {
        name: "The Dirty Bird",
        description:
          "Nashville hot fried chicken sandwich with mayo, lettuce, and pickles on a toasted bun.",
        price: "",
      },
      {
        name: "Smoky Porky Sliders",
        description:
          "Two BBQ pulled pork sliders with mustard-vinaigrette slaw and Korean-style cucumbers.",
        price: "",
      },
      {
        name: "Saucy Frys",
        description:
          "G Chili Peppa Steppa smothered fries with cheese, onion, cilantro, and cotija.",
        price: "",
      },
      {
        name: "Elote",
        description: "Mexican street corn with mayo, cilantro, cotija, spices, and lime.",
        price: "",
      },
      {
        name: "Bowl of G Chili",
        description: "Green chili topped with cheese, onion, cilantro, and cotija.",
        price: "",
      },
    ],
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
    items: [
      {
        name: "Quesadilla",
        description: "Comes with lettuce, tomatoes, sour cream, and guacamole.",
        price: "$16.65",
      },
      {
        name: "Super Nachos",
        description: "Beans, nacho cheese, pico de gallo, jalapenos, guacamole, crema, and your choice of meat.",
        price: "$16.65",
      },
      {
        name: "Asada Fries",
        description: "Nacho cheese, pico de gallo, sour cream, guacamole, and jalapenos.",
        price: "$16.65",
      },
      {
        name: "Desayuno Chapin",
        description: "Eggs fried, plantains, sausage or chorizo, black beans, sour cream, queso fresco, and house tomato sauce.",
        price: "$17.69",
      },
      {
        name: "Huevos Rancheros",
        description: "Two eggs smothered with house pork green chile, served with papas con chorizo.",
        price: "$16.65",
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
    items: [
      {
        name: "Quesadilla",
        description: "Comes with lettuce, tomatoes, sour cream, and guacamole.",
        price: "$16.65",
      },
      {
        name: "Super Nachos",
        description: "Beans, nacho cheese, pico de gallo, jalapenos, guacamole, crema, and your choice of meat.",
        price: "$16.65",
      },
      {
        name: "Asada Fries",
        description: "Nacho cheese, pico de gallo, sour cream, guacamole, and jalapenos.",
        price: "$16.65",
      },
      {
        name: "Desayuno Chapin",
        description: "Eggs fried, plantains, sausage or chorizo, black beans, sour cream, queso fresco, and house tomato sauce.",
        price: "$17.69",
      },
      {
        name: "Huevos Rancheros",
        description: "Two eggs smothered with house pork green chile, served with papas con chorizo.",
        price: "$16.65",
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
  "loma bonita": {
    instagram: {
      title: "Loma Bonita Kitchen - Instagram",
      url: "https://www.instagram.com/loma.bonitakitchen/",
    },
    menu: [
      {
        title: "Loma Bonita Kitchen feature - Westword",
        url: "https://www.westword.com/food-drink/family-recipes-are-key-for-denver-food-truck-loma-bonita-kitchen-25518815/",
      },
      {
        title: "Loma Bonita Kitchen event menu note - KUVO",
        url: "https://www.kuvo.org/latv",
      },
    ],
    items: [
      {
        name: "Birria",
        description: "Slow-cooked birria based on the owner's family recipe from Oaxaca.",
        price: "",
      },
      {
        name: "Al Pastor Tacos",
        description: "Traditional al pastor shaved from the spit with local spices and chili.",
        price: "",
      },
      {
        name: "Carne Asada",
        description: "Grilled carne asada from the truck's expanding street-food menu.",
        price: "",
      },
      {
        name: "Carnitas",
        description: "Tender carnitas cooked in fat until flavorful and crisp at the edges.",
        price: "",
      },
      {
        name: "Cali Dog",
        description: "Bacon-wrapped hot dog with grilled onions, peppers, and Cheetos dust.",
        price: "",
      },
    ],
  },
  "loma bonita kitchen": {
    instagram: {
      title: "Loma Bonita Kitchen - Instagram",
      url: "https://www.instagram.com/loma.bonitakitchen/",
    },
    menu: [
      {
        title: "Loma Bonita Kitchen feature - Westword",
        url: "https://www.westword.com/food-drink/family-recipes-are-key-for-denver-food-truck-loma-bonita-kitchen-25518815/",
      },
      {
        title: "Loma Bonita Kitchen event menu note - KUVO",
        url: "https://www.kuvo.org/latv",
      },
    ],
    items: [
      {
        name: "Birria",
        description: "Slow-cooked birria based on the owner's family recipe from Oaxaca.",
        price: "",
      },
      {
        name: "Al Pastor Tacos",
        description: "Traditional al pastor shaved from the spit with local spices and chili.",
        price: "",
      },
      {
        name: "Carne Asada",
        description: "Grilled carne asada from the truck's expanding street-food menu.",
        price: "",
      },
      {
        name: "Carnitas",
        description: "Tender carnitas cooked in fat until flavorful and crisp at the edges.",
        price: "",
      },
      {
        name: "Cali Dog",
        description: "Bacon-wrapped hot dog with grilled onions, peppers, and Cheetos dust.",
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
  "big belly bros bbq": {
    official: {
      title: "Big Belly Brothers BBQ",
      url: "https://www.bigbellybrothersbbq.com/",
    },
    instagram: {
      title: "Big Belly Brothers BBQ - Instagram",
      url: "https://www.instagram.com/bigbellybrothersbbq/",
    },
    menu: [
      {
        title: "Big Belly Brothers BBQ trailer menu",
        url: "https://www.bigbellybrothersbbq.com/trailer-menu",
      },
    ],
    items: [
      {
        name: "Big Belly Sandwich",
        description: "Sliced brisket topped with BBQ pork.",
        price: "",
      },
      {
        name: "Beef Brisket Burnt Ends",
        description: "Slow-smoked burnt ends caramelized in honey BBQ sauce.",
        price: "",
      },
      {
        name: "Brisket Quesadilla",
        description: "Shredded colby jack cheese, smoked brisket, and BBQ sauce.",
        price: "",
      },
      {
        name: "Brisket Loaded Fries",
        description: "Seasoned waffle fries topped with shredded colby jack cheese, shredded brisket, and white queso.",
        price: "",
      },
      {
        name: "Smoked Wings",
        description: "Smoked wings tossed in BBQ, garlic parm, or buffalo sauce.",
        price: "",
      },
    ],
  },
  "big belly bro s bbq": {
    official: {
      title: "Big Belly Brothers BBQ",
      url: "https://www.bigbellybrothersbbq.com/",
    },
    instagram: {
      title: "Big Belly Brothers BBQ - Instagram",
      url: "https://www.instagram.com/bigbellybrothersbbq/",
    },
    menu: [
      {
        title: "Big Belly Brothers BBQ trailer menu",
        url: "https://www.bigbellybrothersbbq.com/trailer-menu",
      },
    ],
    items: [
      {
        name: "Big Belly Sandwich",
        description: "Sliced brisket topped with BBQ pork.",
        price: "",
      },
      {
        name: "Beef Brisket Burnt Ends",
        description: "Slow-smoked burnt ends caramelized in honey BBQ sauce.",
        price: "",
      },
      {
        name: "Brisket Quesadilla",
        description: "Shredded colby jack cheese, smoked brisket, and BBQ sauce.",
        price: "",
      },
      {
        name: "Brisket Loaded Fries",
        description: "Seasoned waffle fries topped with shredded colby jack cheese, shredded brisket, and white queso.",
        price: "",
      },
      {
        name: "Smoked Wings",
        description: "Smoked wings tossed in BBQ, garlic parm, or buffalo sauce.",
        price: "",
      },
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
  "turkish chef": {
    official: {
      title: "Turkish Chef on Wheels",
      url: "https://www.turkishchefonwheels.com/",
    },
    menu: [
      {
        title: "Turkish Chef on Wheels menu - Best Food Trucks",
        url: "https://www.bestfoodtrucks.com/truck/turkish-chef-on-wheels/menu",
      },
      {
        title: "Turkish Chef on Wheels menu - Denver Food Truck Association",
        url: "https://denfta.org/turkish-chef-on-wheels",
      },
      {
        title: "Turkish Chef on Wheels menu - Food Truck Connector",
        url: "https://www.denverfoodtruckcatering.com/food-trucks/turkish-chef-on-wheels/menu/",
      },
    ],
    items: [
      {
        name: "Chicken Shish Kebab Skewers",
        description:
          "Grilled yogurt-marinated chicken breast cubes served in a wrap or with salad and rice, plus sigara borek.",
        price: "",
      },
      {
        name: "Grilled Turkish Adana Kebab",
        description:
          "Char-grilled lamb and beef seasoned with Turkish spices, served in a wrap or on a plate with rice, salad, and sigara boregi.",
        price: "",
      },
      {
        name: "Kisir",
        description: "Turkish bulgur salad with tomato, scallions, parsley, and spices.",
        price: "",
      },
      {
        name: "Sigara Borek",
        description: "Turkish cigar-shaped savory pastry with feta cheese and parsley in phyllo dough.",
        price: "",
      },
      {
        name: "Baklava with Pistachio",
        description: "Imported Turkish baklava with pistachios.",
        price: "",
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
    items: [
      {
        name: "Formaggio",
        description: "Red sauce, shredded mozzarella, and pecorino cheese.",
        price: "",
      },
      {
        name: "Bianca",
        description: "Garlic-infused olive oil, house herbed ricotta, shredded mozzarella, and fresh rosemary.",
        price: "",
      },
      {
        name: "Margherita",
        description: "Red sauce, fresh mozzarella pearls, cherry tomatoes, and fresh basil.",
        price: "",
      },
      {
        name: "Big Bad Wolf",
        description: "Red sauce, shredded mozzarella, sausage, bacon, and smoked ham.",
        price: "",
      },
      {
        name: "Mile High",
        description: "Red sauce, shredded mozzarella, sausage, roasted red peppers, mushrooms, and jalapenos.",
        price: "",
      },
    ],
  },
  "tula s tapas": {
    official: {
      title: "Tula's Tapas",
      url: "https://www.tulastapas.com/",
    },
    menu: [
      {
        title: "Tula's Tapas food truck menu",
        url: "https://www.tulastapas.com/catering-packages/the-food-truck",
      },
    ],
    items: [
      {
        name: "Tula's Tots",
        description: "Crispy tater tots topped with tinga sauce, Greek yogurt, and scallions.",
        price: "",
      },
      {
        name: "Confit Wings",
        description:
          "Crispy wings slow braised and flash fried, tossed in Tula's dry rub and served with ranch.",
        price: "",
      },
      {
        name: "Coccoli",
        description:
          "Fried dough pillows with Greek yogurt, torn prosciutto, and balsamic reduction over chopped romaine.",
        price: "",
      },
      {
        name: "The Cono",
        description:
          "Grill-pressed Cubano with mojo pork, ham, pepperoni, Swiss, habanero pickles, mustard, and lime aioli.",
        price: "",
      },
      {
        name: "The Wilber",
        description:
          "Smoked pork belly gyro on flat bread with greens, cucumber, tomato, white beans, avocado, and ranch.",
        price: "",
      },
    ],
  },
  "los chamacos": {
    preferKnownItems: true,
    facebook: {
      title: "El Chamaco's Taco Dealer - Facebook",
      url: "https://www.facebook.com/p/El-chamacos-taco-dealer-my-legacy-100057675699460/",
    },
    menu: [
      {
        title: "El Chamaco's menu photo - Facebook",
        url: "https://www.facebook.com/p/El-chamacos-taco-dealer-my-legacy-100057675699460/",
      },
      {
        title: "El Chamaco's listing - MenuPix",
        url: "https://www.menupix.com/colorado/restaurants/32074682/El-Chamacos-Castle-Rock-CO",
      },
    ],
    items: [
      {
        name: "Tacos",
        description:
          "Order of 4 tacos or single tacos on corn tortillas with onions and cilantro.",
        price: "",
        url: "https://www.facebook.com/p/El-chamacos-taco-dealer-my-legacy-100057675699460/",
      },
      {
        name: "Tacos al Carbon",
        description: "Steak or pollo a la parrilla tacos with onion, tomato, and cilantro.",
        price: "",
        url: "https://www.facebook.com/p/El-chamacos-taco-dealer-my-legacy-100057675699460/",
      },
      {
        name: "Tacos al Pastor",
        description: "Tender marinated pork tacos with onion, cilantro, and pineapple.",
        price: "",
        url: "https://www.facebook.com/p/El-chamacos-taco-dealer-my-legacy-100057675699460/",
      },
      {
        name: "Tacos de Camaron",
        description:
          "Grilled shrimp tacos with a special sauce, lettuce, tomato, cucumber, avocado slices, and shredded cheese.",
        price: "",
        url: "https://www.facebook.com/p/El-chamacos-taco-dealer-my-legacy-100057675699460/",
      },
      {
        name: "Burritos",
        description:
          "Burritos smothered with green chile or queso dip, refried beans, and rice.",
        price: "",
        url: "https://www.facebook.com/p/El-chamacos-taco-dealer-my-legacy-100057675699460/",
      },
      {
        name: "Tortas",
        description:
          "Mexican sandwich with meat options such as chicken, ground beef, pork, or shredded beef.",
        price: "",
        url: "https://www.facebook.com/p/El-chamacos-taco-dealer-my-legacy-100057675699460/",
      },
      {
        name: "Torta Loca",
        description:
          "Special torta with steak, pollo a la parrilla, tongue, and al pastor.",
        price: "",
        url: "https://www.facebook.com/p/El-chamacos-taco-dealer-my-legacy-100057675699460/",
      },
      {
        name: "Quesadillas",
        description:
          "Quesadillas with chicken, ground beef, pork, shredded beef, steak, pollo a la parrilla, or camaron.",
        price: "",
        url: "https://www.facebook.com/p/El-chamacos-taco-dealer-my-legacy-100057675699460/",
      },
      {
        name: "Taco Salad",
        description:
          "With lettuce, shredded cheese, sour cream, guacamole, and refried beans.",
        price: "",
        url: "https://www.facebook.com/p/El-chamacos-taco-dealer-my-legacy-100057675699460/",
      },
    ],
  },
  "el chamacos": {
    preferKnownItems: true,
    facebook: {
      title: "El Chamaco's Taco Dealer - Facebook",
      url: "https://www.facebook.com/p/El-chamacos-taco-dealer-my-legacy-100057675699460/",
    },
    menu: [
      {
        title: "El Chamaco's menu photo - Facebook",
        url: "https://www.facebook.com/p/El-chamacos-taco-dealer-my-legacy-100057675699460/",
      },
      {
        title: "El Chamaco's listing - MenuPix",
        url: "https://www.menupix.com/colorado/restaurants/32074682/El-Chamacos-Castle-Rock-CO",
      },
    ],
    items: [
      {
        name: "Tacos",
        description:
          "Order of 4 tacos or single tacos on corn tortillas with onions and cilantro.",
        price: "",
        url: "https://www.facebook.com/p/El-chamacos-taco-dealer-my-legacy-100057675699460/",
      },
      {
        name: "Tacos al Carbon",
        description: "Steak or pollo a la parrilla tacos with onion, tomato, and cilantro.",
        price: "",
        url: "https://www.facebook.com/p/El-chamacos-taco-dealer-my-legacy-100057675699460/",
      },
      {
        name: "Tacos al Pastor",
        description: "Tender marinated pork tacos with onion, cilantro, and pineapple.",
        price: "",
        url: "https://www.facebook.com/p/El-chamacos-taco-dealer-my-legacy-100057675699460/",
      },
      {
        name: "Tacos de Camaron",
        description:
          "Grilled shrimp tacos with a special sauce, lettuce, tomato, cucumber, avocado slices, and shredded cheese.",
        price: "",
        url: "https://www.facebook.com/p/El-chamacos-taco-dealer-my-legacy-100057675699460/",
      },
      {
        name: "Burritos",
        description:
          "Burritos smothered with green chile or queso dip, refried beans, and rice.",
        price: "",
        url: "https://www.facebook.com/p/El-chamacos-taco-dealer-my-legacy-100057675699460/",
      },
      {
        name: "Tortas",
        description:
          "Mexican sandwich with meat options such as chicken, ground beef, pork, or shredded beef.",
        price: "",
        url: "https://www.facebook.com/p/El-chamacos-taco-dealer-my-legacy-100057675699460/",
      },
      {
        name: "Torta Loca",
        description:
          "Special torta with steak, pollo a la parrilla, tongue, and al pastor.",
        price: "",
        url: "https://www.facebook.com/p/El-chamacos-taco-dealer-my-legacy-100057675699460/",
      },
      {
        name: "Quesadillas",
        description:
          "Quesadillas with chicken, ground beef, pork, shredded beef, steak, pollo a la parrilla, or camaron.",
        price: "",
        url: "https://www.facebook.com/p/El-chamacos-taco-dealer-my-legacy-100057675699460/",
      },
      {
        name: "Taco Salad",
        description:
          "With lettuce, shredded cheese, sour cream, guacamole, and refried beans.",
        price: "",
        url: "https://www.facebook.com/p/El-chamacos-taco-dealer-my-legacy-100057675699460/",
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

  const localEvents = {};
  for (const [dateKey, event] of Object.entries(LOCAL_EVENT_OVERRIDES)) {
    const eventDate = parseIsoDateParam(dateKey);
    if (!eventDate) continue;
    if (eventDate.getUTCFullYear() !== year || eventDate.getUTCMonth() + 1 !== month) continue;

    localEvents[dateKey] = event;
  }

  const data = {
    schedule,
    localEvents,
    sourceUrl: url.toString(),
    fetchedAt: new Date().toISOString(),
  };
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
    preferKnownItems: Boolean(links.preferKnownItems),
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

function hasKnownTruckData(truckName) {
  const key = normalizeTruckName(truckName).toLowerCase().replace(/\s*&\s*/g, " ");
  return Boolean(KNOWN_TRUCK_LINKS[key]);
}

function splitListedTruckNames(truckName) {
  const normalized = normalizeTruckName(truckName);
  if (!normalized) return [];

  const parts = normalized
    .split(/\s+(?:&|\+|and)\s+/i)
    .map((name) => name.trim())
    .filter(Boolean);

  if (parts.length < 2) return [normalized];

  const allPartsHaveKnownData = parts.every(hasKnownTruckData);
  return allPartsHaveKnownData ? parts : [normalized];
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
    preferKnownItems: knownLinks.preferKnownItems || false,
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
  if (/^(menu|main|appetizers?|desserts?|salads?|sides?|drinks?|beverages?)$/i.test(trimmed)) {
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
  if (/^\(?\d(?:\.\d)?\/5\)?$/i.test(trimmed)) return false;
  if (/^(request content removal|all reviews?|google|less)$/i.test(trimmed)) return false;
  if (/^\d{1,2}\s*(?:am|pm)\s*-\s*\d{1,2}\s*(?:am|pm)$/i.test(trimmed)) return false;
  if (/^\d+\s+.+\b(?:st|street|ave|avenue|rd|road|dr|drive|kitchen)\b/i.test(trimmed)) return false;
  if (/https?:|@|^\$?\d+(?:\.\d{2})?$|&times;|loading|failed to load image|copyright|reserved|cookie/i.test(trimmed)) {
    return false;
  }

  return true;
}

function isJunkMenuItem(item = {}) {
  const text = `${item.name || ""} ${item.description || ""}`.toLowerCase();
  const source = `${item.url || ""}`.toLowerCase();
  const name = `${item.name || ""}`.trim().toLowerCase();

  if (/^(main|meet|see more food|past catering events)$/i.test(name)) {
    return true;
  }

  if (/\bwhat is your favorite dish on the menu\b/i.test(text)) {
    return true;
  }

  if (/^[a-z .'-]+,\s*[a-z]{2}$/i.test(name) && /\b(attendees?|meet|corporate|event organizers?)\b/i.test(text)) {
    return true;
  }

  if (/\b\d+\s+.+,\s*[a-z .'-]+,\s*[a-z]{2}\s+\d{5}\b/i.test(text)) {
    return true;
  }

  if (
    /\b(food trucks near|food trucks, ice cream|best of denver|food trucks in denver|recent reviews|sign up|get the streetfoodfinder app|streetfoodfinder app|more about this truck|united states|see more food|elevate your taste buds|past catering events|event organizers have booked|attendees corporate|attendees meet|visitors' reviews|request content removal|all reviews|open now)\b/i.test(
      text
    )
  ) {
    return true;
  }

  return source.includes("streetfoodfinder.com/menu") || source.includes("menupix.com");
}

function usableMenuItems(items = []) {
  return dedupeMenuItems(items.filter((item) => item?.name && !isJunkMenuItem(item))).slice(0, 10);
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

  return usableMenuItems(items);
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

  return usableMenuItems(items);
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

  return usableMenuItems(items);
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
      const cleanItems = usableMenuItems(items);
      if (cleanItems.length > bestItems.length) bestItems = cleanItems;
      if (bestItems.length >= 10) break;
    } catch {
      // Try the next likely menu URL.
    }
  }

  return usableMenuItems(bestItems);
}

function menuCandidateUrls(links, truckName) {
  return dedupeLinks(
    [...generatedMenuCandidateLinks(truckName), ...links]
      .filter((link) => link?.url && !/facebook\.com|instagram\.com|sagemenu\.com/i.test(link.url))
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

    if (featuredLinks.preferKnownItems && featuredLinks.knownItems?.length) {
      menuItems.length = 0;
      menuItems.push(...featuredLinks.knownItems);
      menuSourceUrl = featuredLinks.knownItems[0].url || menuSourceUrl;
    }

    if (menuItems.length === 0 && featuredLinks.knownItems?.length) {
      menuItems.push(...featuredLinks.knownItems);
      menuSourceUrl = featuredLinks.knownItems[0].url || menuSourceUrl;
    }

    if (
      featuredLinks.knownItems?.length &&
      menuItems.length < Math.min(3, featuredLinks.knownItems.length)
    ) {
      menuItems.length = 0;
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

function formatTruckList(truckNames) {
  if (truckNames.length <= 1) return truckNames[0] || "";
  if (truckNames.length === 2) return truckNames.join(" and ");
  return `${truckNames.slice(0, -1).join(", ")}, and ${truckNames.at(-1)}`;
}

function buildAnswer({ question, targetDate, truck, calendar, menu, truckListings = [] }) {
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
    ? ` I found menu items like ${menu.items
        .slice(0, 3)
        .map((item) => item.name)
        .join(", ")}.`
    : " I found the truck, but could not read menu items automatically this time. The links below are the best places to check.";
  const truckText =
    truckNames.length > 1
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
  const localEvent = calendar.localEvents?.[dateKey] || null;
  const truck = calendar.schedule[dateKey] || "";
  const baseTruckNames = truck ? splitListedTruckNames(truck) : [];
  const localTruckListings = (localEvent?.trucks || []).flatMap((name) =>
    splitListedTruckNames(name).map((splitName) => ({
      name: splitName,
      location: localEvent.location || "",
    }))
  );
  const listingInputs = [
    ...baseTruckNames.map((name) => ({ name, location: "" })),
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
  const data = buildAnswer({
    question,
    targetDate,
    truck,
    calendar,
    menu,
    truckListings: menus,
  });
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
