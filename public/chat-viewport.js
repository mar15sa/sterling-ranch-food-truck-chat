(() => {
  // Mobile keyboards can shrink the visual viewport without changing the layout viewport.
  const viewport = window.visualViewport;
  function fitChat() {
    document.documentElement.style.setProperty("--chat-viewport-height", `${viewport?.height || window.innerHeight}px`);
    document.body.toggleAttribute("data-keyboard-open", Boolean(viewport && viewport.height < window.innerHeight * .78));
  }
  viewport?.addEventListener("resize", fitChat);
  window.addEventListener("resize", fitChat);
  fitChat();
})();
