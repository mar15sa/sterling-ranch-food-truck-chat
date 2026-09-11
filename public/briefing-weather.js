(() => {
  const panel = document.querySelector("#briefing-weather");
  if (!panel) return;
  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function conditionIcon(period) {
    const text = String(period.shortForecast || "").toLowerCase();
    if (/thunder|storm/.test(text)) return "storm";
    if (/snow|sleet|ice|freezing/.test(text)) return "snow";
    if (/rain|shower|drizzle/.test(text)) return "rain";
    if (/fog|mist|haze|smoke/.test(text)) return "fog";
    if (/partly|mostly sunny|mostly clear/.test(text)) return period.isDaytime ? "partly" : "night-cloud";
    if (/cloud|overcast/.test(text)) return "cloud";
    if (/sunny|clear/.test(text)) return period.isDaytime ? "sun" : "moon";
    if (/wind|breezy/.test(text)) return "wind";
    return "cloud";
  }
  function icon(name, className = "weather-icon") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const use = document.createElementNS(svg.namespaceURI, "use");
    use.setAttribute("href", `/weather-icons.svg?v=20260911-editorial#${name}`);
    svg.append(use);
    return svg;
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
    number.append(temperature(current, "weather-temperature"), element("span", "weather-unit", "F"));
    reading.append(number, element("span", "weather-range-label", current.isDaytime ? "Forecast high" : "Forecast low"), element("p", "weather-condition", current.shortForecast));
    const illustration = element("div", "weather-illustration");
    illustration.setAttribute("aria-hidden", "true");
    const landscape = element("img", "weather-landscape");
    landscape.src = "/weather-foothills.webp";
    landscape.alt = "";
    landscape.width = 720;
    landscape.height = 480;
    illustration.append(landscape, icon(conditionIcon(current), "weather-icon weather-hero-icon"));
    hero.append(reading, illustration);
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
      card.append(element("h4", "", period.name), icon(conditionIcon(period)), temperature(period, "weather-next-temperature"), outlookDescription(period.shortForecast));
      outlook.append(card);
    }
    const updated = element("p", "briefing-weather-updated", "National Weather Service · Updated " + new Intl.DateTimeFormat("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Denver",
    }).format(new Date(data.updatedAt)));
    panel.replaceChildren(hero, ...(next.length ? [outlook] : []), updated);
  }
  let pending = false;
  async function loadWeather() {
    if (pending) return;
    pending = true;
    try {
      const response = await fetch("/api/weather", { signal: AbortSignal.timeout(22000) });
      if (!response.ok) throw new Error("Unavailable");
      const data = await response.json();
      if (data.status !== "ok" || !data.periods?.length) throw new Error("Unavailable");
      render(data);
    } catch {
      const empty = element("div", "weather-unavailable");
      empty.append(icon("cloud"), element("p", "", "Forecast temporarily unavailable. Use the full forecast below."));
      panel.replaceChildren(empty);
    } finally {
      pending = false;
      panel.setAttribute("aria-busy", "false");
    }
  }
  loadWeather();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadWeather(); });
})();
