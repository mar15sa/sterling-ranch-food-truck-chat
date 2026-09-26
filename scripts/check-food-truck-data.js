#!/usr/bin/env node

const { catalog, catalogIssues } = require("../lib/food-truck-links");
const { isJunkMenuItem } = require("../lib/menu-quality");

const issues = catalogIssues(catalog);
for (const [key, truck] of Object.entries(catalog.trucks || {})) {
  const items = Array.isArray(truck.items) ? truck.items : [];
  const junkItems = items.filter(isJunkMenuItem);
  if (junkItems.length) issues.push(`${key} has junk menu items: ${junkItems.map((item) => item.name).join(", ")}`);
}

if (issues.length) {
  console.error("Food-truck catalog check failed:");
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exitCode = 1;
} else {
  console.log(`Food-truck catalog check passed for ${Object.keys(catalog.trucks).length} trucks and ${Object.keys(catalog.aliases).length} aliases.`);
}
