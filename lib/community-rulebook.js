// Resolve navigation from the active profile without asserting any rule's content.
function rulebookDestination(profile) {
  const website = new URL(profile.website);
  if (website.protocol !== "https:" || website.username || website.password) {
    throw new Error("Community website must be an official HTTPS URL.");
  }
  const allowedHosts = new Set((profile.allowedHosts || []).map(host => String(host).toLowerCase()));
  allowedHosts.add(website.hostname.toLowerCase());
  const connector = (profile.connectors || []).find(item =>
    item.type === "municode" || item.adapter?.capabilities?.includes("rules"));
  if (!connector) return website.href;
  const adapter = connector.adapter;
  const endpoints = adapter?.endpoints || [];
  const endpoint = endpoints.find(item => item.id === "primary" && item.purpose === "governing-rules")
    || endpoints.find(item => item.purpose === "governing-rules");
  try {
    const destination = new URL(endpoint ? endpoint.url : connector.baseUrl);
    const host = destination.hostname.toLowerCase();
    if (destination.protocol !== "https:" || destination.username || destination.password
      || !allowedHosts.has(host)
      || (adapter && !(adapter.sourceHosts || []).map(value => String(value).toLowerCase()).includes(host))) {
      return website.href;
    }
    return destination.href;
  } catch {
    return website.href;
  }
}

module.exports = { rulebookDestination };
