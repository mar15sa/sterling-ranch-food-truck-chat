(() => {
  const panel = document.querySelector("#briefing-weather");
  if (!panel) return;
  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function conditionArtwork(period) {
    const text = String(period.shortForecast || "").toLowerCase();
    if (/\b(thunderstorms?|storms?)\b/.test(text)) return "storm";
    if (/\b(snow\w*|sleet|ice|icy|freezing|flurries)\b/.test(text)) return "snow";
    if (/\b(rain\w*|showers?|drizzle)\b/.test(text)) return "rain";
    if (/\b(fog\w*|mist\w*|haze|hazy|smoke)\b/.test(text)) return "fog";
    if (/\b(wind\w*|breezy|blustery)\b/.test(text)) return "wind";
    if (/partly|mostly sunny|mostly clear/.test(text)) return period.isDaytime ? "partly" : "night-cloud";
    if (/cloud|overcast/.test(text)) return "cloud";
    if (/sunny|clear/.test(text)) return period.isDaytime ? "sun" : "moon";
    return "neutral";
  }
  function artwork(period, miniature = false) {
    const name = conditionArtwork(period);
    const frame = element("span", miniature ? "weather-symbol" : "weather-illustration");
    frame.setAttribute("aria-hidden", "true");
    frame.dataset.weather = name;
    if (miniature) return frame;
    const image = element("img", "weather-engraving");
    image.src = name === "neutral" ? "/weather-foothills.webp" : `/weather-art/${name}.webp`;
    image.alt = "";
    image.width = 600;
    image.height = 450;
    image.addEventListener("error", () => { image.hidden = true; });
    frame.append(image);
    return frame;
  }
  function temperature(period, className) {
    const value = element("span", className, `${period.temperature}°`);
    value.setAttribute("aria-label", `${period.isDaytime ? "High" : "Low"}: ${period.temperature} degrees Fahrenheit`);
    return value;
  }
  function outlookDescription(forecast) {
    const full = String(forecast || "");
    const concise = full.replace(/mostly sunny then /gi, "Sun, then ")
      .replace(/showers and thunderstorms/gi, "storms")
      .replace(/thunderstorms/gi, "storms")
      .replace(/slight chance (?!of\b)/gi, "slight chance of ");
    const description = element("span", "weather-next-condition", concise);
    description.title = full;
    description.setAttribute("aria-label", full);
    return description;
  }
  function render(data) {
    const [current, ...next] = data.periods;
    const hero = element("div", "weather-hero");
    const reading = element("div", "weather-reading");
    reading.append(element("h3", "weather-period-name", current.name));
    const number = element("div", "weather-number");
    number.append(temperature(current, "weather-temperature"));
    reading.append(number, element("span", "weather-range-label", current.isDaytime ? "Forecast high" : "Forecast low"), element("p", "weather-condition", current.shortForecast));
    hero.append(reading, artwork(current));
    const metrics = element("div", "weather-metrics");
    if (Number.isFinite(current.precipitation)) {
      const precipitation = element("span", "weather-metric");
      precipitation.append(element("span", "", `${current.precipitation}% precip.`));
      metrics.append(precipitation);
    }
    if (current.windSpeed) {
      const wind = element("span", "weather-metric");
      wind.append(element("span", "", `${current.windDirection || ""} ${current.windSpeed}`.trim()));
      metrics.append(wind);
    }
    if (metrics.childElementCount) hero.append(metrics);
    const outlook = element("div", "weather-outlook");
    for (const period of next) {
      const card = element("div", "weather-next");
      const name = element("h4", "", period.name.replace(/^(\w{3})\w+ Night$/, "$1. night"));
      name.title = period.name;
      card.append(name, artwork(period, true), temperature(period, "weather-next-temperature"), outlookDescription(period.shortForecast));
      outlook.append(card);
    }
    const updated = element("p", "briefing-weather-updated", "National Weather Service · Updated " + new Intl.DateTimeFormat("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Denver",
    }).format(new Date(data.updatedAt)));
    panel.replaceChildren(hero, ...(next.length ? [outlook] : []), updated);
  }
  let pending = false;
  let refreshTimer;
  async function loadWeather() {
    if (pending) return;
    pending = true;
    clearTimeout(refreshTimer);
    let refreshAfter = 15 * 60 * 1000;
    try {
      const response = await fetch("/api/weather", { signal: AbortSignal.timeout(22000) });
      if (!response.ok) throw new Error("Unavailable");
      const data = await response.json();
      if (data.status !== "ok" || !data.periods?.length) throw new Error("Unavailable");
      render(data);
      const periodEnd = Date.parse(data.periods[0].endTime);
      if (Number.isFinite(periodEnd)) refreshAfter = Math.min(refreshAfter, Math.max(1000, periodEnd - Date.now() + 1000));
    } catch {
      const empty = element("div", "weather-unavailable");
      empty.append(element("p", "", "Forecast temporarily unavailable. Use the full forecast below."));
      panel.replaceChildren(empty);
      refreshAfter = 60 * 1000;
    } finally {
      pending = false;
      panel.setAttribute("aria-busy", "false");
      refreshTimer = setTimeout(() => { if (!document.hidden) loadWeather(); }, refreshAfter);
    }
  }
  loadWeather();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadWeather(); });
})();
