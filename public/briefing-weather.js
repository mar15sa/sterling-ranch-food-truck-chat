(() => {
  const panel = document.querySelector("#briefing-weather");
  if (!panel) return;
  async function loadWeather() {
    try {
      const response = await fetch("/api/weather", { signal: AbortSignal.timeout(22000) });
      if (!response.ok) throw new Error("Unavailable");
      const data = await response.json();
      if (data.status !== "ok" || !data.periods?.length) throw new Error("Unavailable");
      const rows = data.periods.map(period => {
        const row = document.createElement("div");
        row.className = "briefing-weather-period";
        const copy = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = period.name;
        const condition = document.createElement("span");
        condition.textContent = period.shortForecast;
        copy.append(name, condition);
        const temperature = document.createElement("span");
        temperature.className = "briefing-weather-temperature";
        temperature.textContent = `${period.temperature}°F`;
        temperature.setAttribute("aria-label", `${period.isDaytime ? "High" : "Low"}: ${period.temperature} degrees Fahrenheit`);
        row.append(copy, temperature);
        return row;
      });
      const updated = document.createElement("p");
      updated.className = "briefing-weather-updated";
      updated.textContent = "NWS forecast · Updated " + new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Denver" }).format(new Date(data.updatedAt));
      panel.replaceChildren(...rows, updated);
    } catch {
      panel.textContent = "Forecast temporarily unavailable. Use the full forecast below.";
    } finally {
      panel.setAttribute("aria-busy", "false");
    }
  }
  loadWeather();
  // Refresh when a resident returns to a tab left open through the day.
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadWeather(); });
})();
