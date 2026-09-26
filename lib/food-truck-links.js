const catalog = require("../data/food-truck-links.json");

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateLink(link, path, issues) {
  if (!isRecord(link)) {
    issues.push(`${path} must be an object`);
    return;
  }
  if (!String(link.title || "").trim()) issues.push(`${path}.title is required`);
  if (!isHttpUrl(link.url)) issues.push(`${path}.url must be an HTTP(S) URL`);
}

function catalogIssues(value = catalog) {
  const issues = [];
  if (!isRecord(value) || value.version !== 1) issues.push("catalog version must be 1");
  const trucks = isRecord(value?.trucks) ? value.trucks : {};
  const aliases = isRecord(value?.aliases) ? value.aliases : {};
  const displayNames = isRecord(value?.displayNames) ? value.displayNames : {};
  if (!Object.keys(trucks).length) issues.push("catalog must contain trucks");

  for (const [key, truck] of Object.entries(trucks)) {
    const path = `trucks.${key}`;
    if (key !== key.trim().toLowerCase()) issues.push(`${path} key must be normalized`);
    if (!isRecord(truck)) {
      issues.push(`${path} must be an object`);
      continue;
    }
    for (const type of ["official", "facebook", "instagram"]) {
      if (truck[type] !== undefined) validateLink(truck[type], `${path}.${type}`, issues);
    }
    if (truck.menu !== undefined) {
      if (!Array.isArray(truck.menu)) issues.push(`${path}.menu must be an array`);
      else truck.menu.forEach((link, index) => validateLink(link, `${path}.menu[${index}]`, issues));
    }
    if (truck.items !== undefined) {
      if (!Array.isArray(truck.items)) issues.push(`${path}.items must be an array`);
      else truck.items.forEach((item, index) => {
        const itemPath = `${path}.items[${index}]`;
        if (!isRecord(item)) issues.push(`${itemPath} must be an object`);
        else {
          if (!String(item.name || "").trim()) issues.push(`${itemPath}.name is required`);
          if (item.description !== undefined && typeof item.description !== "string") issues.push(`${itemPath}.description must be a string`);
          if (item.price !== undefined && typeof item.price !== "string") issues.push(`${itemPath}.price must be a string`);
          if (item.url !== undefined && item.url !== "" && !isHttpUrl(item.url)) issues.push(`${itemPath}.url must be an HTTP(S) URL`);
        }
      });
    }
    if (truck.preferKnownItems === true && !truck.items?.length) issues.push(`${path}.preferKnownItems requires menu items`);
  }

  for (const [alias, target] of Object.entries(aliases)) {
    if (alias !== alias.trim().toLowerCase()) issues.push(`aliases.${alias} key must be normalized`);
    if (!trucks[target]) issues.push(`aliases.${alias} points to missing truck ${target}`);
    if (alias === target) issues.push(`aliases.${alias} points to itself`);
  }
  for (const [key, displayName] of Object.entries(displayNames)) {
    if (!trucks[key] && !aliases[key]) issues.push(`displayNames.${key} does not match a truck or alias`);
    if (!String(displayName || "").trim()) issues.push(`displayNames.${key} is empty`);
  }
  return issues;
}

const KNOWN_TRUCK_LINKS = { ...catalog.trucks };
for (const [alias, target] of Object.entries(catalog.aliases || {})) {
  if (KNOWN_TRUCK_LINKS[target]) KNOWN_TRUCK_LINKS[alias] = KNOWN_TRUCK_LINKS[target];
}

module.exports = {
  KNOWN_TRUCK_ALIASES: catalog.aliases || {},
  KNOWN_TRUCK_DISPLAY_NAMES: catalog.displayNames || {},
  KNOWN_TRUCK_LINKS,
  catalog,
  catalogIssues,
};
