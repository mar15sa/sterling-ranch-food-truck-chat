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
  function row(title, detail, href, date, headingTag = "h3") {
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
    const heading = document.createElement(headingTag);
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
  function calendarFallback(container, action) {
    const link = document.createElement("a");
    link.href = action?.url || "/community-calendar";
    link.textContent = (action?.label || "Open official community calendar") + " ↗";
    link.target = "_blank";
    link.rel = "noreferrer";
    container.append(" ", link);
  }
  const events = document.querySelector("#briefing-events");
  if (events) {
    const fullCalendar = events.hasAttribute("data-full-calendar");
    const timeKey = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Denver", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
    const tomorrow = new Date(dateKey + "T12:00:00Z");
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowKey = tomorrow.toISOString().slice(0, 10);
    const dateLabel = (date) => date === dateKey ? "Today" : date === tomorrowKey ? "Tomorrow" : new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z"));
    const eventTime = (event) => /^\d{2}:\d{2}$/.test(event.time || "") ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date("2000-01-01T" + event.time + ":00Z")) : "Time not listed";
    function notice(text, action) {
      const note = document.createElement("p");
      note.className = "calendar-notice";
      note.setAttribute("role", "status");
      note.textContent = text;
      calendarFallback(note, action);
      events.append(note);
    }
    function appendEvents(items, container, grouped) {
      let previousDate = null;
      for (const event of items) {
        if (grouped && event.date !== previousDate) {
          const heading = document.createElement("h3");
          heading.className = "calendar-date-heading";
          heading.textContent = dateLabel(event.date);
          container.append(heading);
          previousDate = event.date;
        }
        container.append(row(event.title, [eventTime(event), event.location].filter(Boolean).join(" · "), event.url, event.date, grouped ? "h4" : "h3"));
      }
    }
    read("/api/community/events").then((data) => {
      events.replaceChildren();
      const entries = (data.events || []).filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date || "")).sort((a,b) => a.date.localeCompare(b.date) || String(a.time || "").localeCompare(String(b.time || "")));
      const started = entries.filter(e => e.date === dateKey && /^\d{2}:\d{2}$/.test(e.time || "") && e.time < timeKey);
      const upcoming = entries.filter(e => e.date >= dateKey && !started.includes(e));
      appendEvents(upcoming.slice(0, fullCalendar ? 14 : 3), events, fullCalendar);
      if (!upcoming.length) notice("No upcoming events are listed for the next seven days.", data.action);
      if (fullCalendar && started.length) {
        const earlier = document.createElement("details");
        earlier.className = "calendar-earlier";
        const summary = document.createElement("summary");
        summary.textContent = "Started earlier today (" + started.length + ")";
        earlier.append(summary);
        appendEvents(started, earlier, false);
        events.append(earlier);
      }
      if (data.status === "partial" && fullCalendar)
        notice("We confirmed the events below, but one day could not be checked. The official calendar has the complete list.", data.action);
      const next = document.querySelector("#briefing-next-event");
      if (next && upcoming[0]) {
        const event = upcoming[0];
        next.href = event.url;
        const label = document.createElement("span");
        label.textContent = "Next on the calendar";
        const title = document.createElement("strong");
        title.textContent = event.title;
        const detail = document.createElement("span");
        detail.textContent = dateLabel(event.date) + " · " + eventTime(event);
        next.replaceChildren(label, title, detail);
        next.hidden = false;
      }
    }).catch(() => {
      events.replaceChildren();
      notice("Upcoming events couldn’t load just now. Please use the official calendar.");
    }).finally(() => events.setAttribute("aria-busy", "false"));
  }
  if (document.querySelector("#briefing-truck"))
    read("/api/ask?date=" + encodeURIComponent(dateKey))
      .then((data) => {
        setText(
          "#briefing-truck",
          data.truck || "No truck listed yet",
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
            (Number(b.status === "open") - Number(a.status === "open")) || String(b.verifiedAt || "").localeCompare(
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
