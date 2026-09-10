(() => {
  document.body.classList.add("society-enhanced");
  const menu = document.querySelector(".society-menu");
  const nav = document.querySelector(".society-nav");
  function setMenu(open) {
    nav.classList.toggle("is-expanded", open);
    menu.setAttribute("aria-expanded", String(open));
    menu.textContent = open ? "Close navigation" : "Open navigation";
  }
  menu.addEventListener("click", () =>
    setMenu(menu.getAttribute("aria-expanded") !== "true"),
  );
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      menu.getAttribute("aria-expanded") === "true"
    ) {
      setMenu(false);
      menu.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".society-header")) setMenu(false);
  });
  const mobile = matchMedia("(max-width: 760px)");
  mobile.addEventListener("change", () => setMenu(false));
  setMenu(false);
  // Navigation from a test page must never turn an automated question into a resident one.
  if (new URLSearchParams(location.search).get("test") === "1") {
    document
      .querySelectorAll('a[href^="/community-assistant"]')
      .forEach((link) => {
        const url = new URL(link.href);
        url.searchParams.set("test", "1");
        link.href = url.pathname + url.search;
      });
    const form = document.querySelector(".briefing-search");
    if (form) {
      const marker = document.createElement("input");
      marker.type = "hidden";
      marker.name = "test";
      marker.value = "1";
      form.append(marker);
    }
  }
})();
