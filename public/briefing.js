(() => {
  const now = new Date();
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const dateEl = document.querySelector("#briefing-date");
  if (dateEl)
    dateEl.textContent = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Denver",
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(now);
  const setText = (selector, text) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
  };
  async function read(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error("Service unavailable");
    return response.json();
  }
  function row(title, detail, href, date) {
    const link = document.createElement("a");
    link.className = "briefing-row";
    link.href = href;
    if (date) {
      const value = new Date(date + "T12:00:00Z");
      const day = document.createElement("span");
      day.className = "briefing-day";
      day.append(
        new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" })
          .format(value)
          .toUpperCase(),
      );
      const strong = document.createElement("strong");
      strong.textContent = String(value.getUTCDate());
      day.append(strong);
      link.append(day);
    }
    const copy = document.createElement("div");
    const heading = document.createElement("h3");
    heading.textContent = title;
    const text = document.createElement("p");
    text.textContent = detail;
    copy.append(heading, text);
    const arrow = document.createElement("span");
    arrow.className = "briefing-arrow";
    arrow.textContent = "↗";
    arrow.setAttribute("aria-hidden", "true");
    link.append(copy, arrow);
    return link;
  }
  const events = document.querySelector("#briefing-events");
  if (events) {
    const [year, month] = dateKey.split("-").map(Number);
    const next = new Date(Date.UTC(year, month, 1));
    Promise.all([
      read(`/api/schedule?year=${year}&month=${month}`),
      read(
        `/api/schedule?year=${next.getUTCFullYear()}&month=${next.getUTCMonth() + 1}`,
      ),
    ])
      .then((calendars) => {
        const entries = new Map();
        for (const data of calendars) {
          for (const [date, name] of Object.entries(data.schedule || {}))
            entries.set(date, name);
          for (const [date, event] of Object.entries(data.localEvents || {}))
            if (event.trucks?.length)
              entries.set(date, event.trucks.join(" · "));
        }
        const upcoming = [...entries]
          .filter(([date]) => date >= dateKey)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(0, events.hasAttribute("data-full-calendar") ? 7 : 3);
        events.replaceChildren();
        for (const [date, name] of upcoming)
          events.append(
            row(
              name,
              "View schedule & truck details",
              "/food-truck?date=" + encodeURIComponent(date),
              date,
            ),
          );
        if (!upcoming.length)
          events.textContent =
            "No upcoming food truck dates were listed in the calendar months checked. Open the community calendar for other events.";
      })
      .catch(() => {
        events.textContent =
          "Upcoming dates couldn’t load just now. Open the community calendar or try again later.";
      });
  }
  if (document.querySelector("#briefing-truck"))
    read("/api/ask?date=" + encodeURIComponent(dateKey))
      .then((data) => {
        setText(
          "#briefing-truck",
          data.truck ? "Today: " + data.truck : "No truck listed yet",
        );
        const names = (data.menu?.items || [])
          .slice(0, 3)
          .map((item) => item.name)
          .filter(Boolean);
        setText(
          "#briefing-food-copy",
          data.truck
            ? (names.length
                ? "On the menu: " + names.join(", ") + "."
                : "Open today’s truck details for the available menu and official links.") +
                (data.location ? " Location: " + data.location + "." : "")
            : "The calendar may not have today’s listing posted. Check the truck page for another date.",
        );
      })
      .catch(() => {
        setText("#briefing-truck", "Dinner plans, one click away.");
        setText(
          "#briefing-food-copy",
          "Today’s listing couldn’t load just now. Open Food Trucks to check a date or try again.",
        );
      });
  const openings = document.querySelector("#briefing-openings");
  if (openings)
    read("/api/openings")
      .then((data) => {
        const items = [...(data.items || [])]
          .sort((a, b) =>
            String(b.verifiedAt || "").localeCompare(
              String(a.verifiedAt || ""),
            ),
          )
          .slice(0, 3);
        openings.replaceChildren();
        for (const item of items)
          openings.append(
            row(
              item.name,
              [item.openingWindow, item.community].filter(Boolean).join(" · "),
              "/openings",
            ),
          );
        if (!items.length)
          openings.textContent =
            "No openings are listed yet. Check the tracker for updates.";
      })
      .catch(() => {
        openings.textContent =
          "Nearby openings couldn’t load just now. Open the tracker to try again.";
      });
})();
