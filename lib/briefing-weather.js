// Read-only homepage forecast. Configuration owns the community coordinates.
function createWeatherService(config, { fetchImpl = fetch, now = Date.now } = {}) {
  let cached, pending;
  async function read(url) {
    const target = new URL(url);
    if (target.protocol !== "https:" || target.hostname !== "api.weather.gov") throw new Error("Invalid forecast source");
    const response = await fetchImpl(target, {
      headers: { "User-Agent": config.userAgent, Accept: "application/geo+json" },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Forecast unavailable");
    return response.json();
  }
  async function refresh() {
    try {
      const point = await read(`https://api.weather.gov/points/${config.latitude},${config.longitude}`);
      const forecast = await read(point.properties.forecast);
      const updatedAt = forecast.properties.updateTime;
      const age = now() - Date.parse(updatedAt);
      if (!Number.isFinite(age) || age > 24 * 60 * 60 * 1000 || age < -5 * 60 * 1000) throw new Error("Forecast out of date");
      const periods = forecast.properties.periods.filter(p =>
        Date.parse(p.endTime) > now() && Number.isFinite(p.temperature) && p.temperatureUnit === "F"
      ).slice(0, 4).map(p => ({
        name: p.name, endTime: p.endTime, temperature: p.temperature, isDaytime: p.isDaytime,
        shortForecast: p.shortForecast, windSpeed: p.windSpeed || null, windDirection: p.windDirection || null, precipitation: p.probabilityOfPrecipitation?.value ?? null,
      }));
      if (!periods.length) throw new Error("No current forecast");
      return { status: "ok", periods, updatedAt, zipCode: config.zipCode, sourceUrl: config.sourceUrl };
    } catch {
      return { status: "unavailable", periods: [], sourceUrl: config.sourceUrl };
    }
  }
  return async function getWeather() {
    if (cached && cached.expiresAt > now()) return cached.data;
    if (pending) return pending;
    pending = refresh().then(data => {
      const ttl = data.status === "ok" ? 15 * 60 * 1000 : 60 * 1000;
      const firstPeriodEnd = Date.parse(data.periods[0]?.endTime);
      const sourceExpiry = Date.parse(data.updatedAt) + 24 * 60 * 60 * 1000;
      cached = { data, expiresAt: Math.min(now() + ttl,
        Number.isFinite(firstPeriodEnd) ? firstPeriodEnd : Infinity,
        Number.isFinite(sourceExpiry) ? sourceExpiry : Infinity) };
      return data;
    }).finally(() => { pending = null; });
    return pending;
  };
}
module.exports = { createWeatherService };
