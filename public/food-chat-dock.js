(() => {
  const dock = document.querySelector('.food-chat-dock');
  if (!dock) return;
  // Reserve the dock's actual height so even the last source/footer can scroll clear.
  const updateHeight = () => {
    const height = `${dock.offsetHeight + 12}px`;
    document.body.style.setProperty('--food-dock-height', height);
    document.documentElement.style.setProperty('--food-dock-height', height);
  };
  new ResizeObserver(updateHeight).observe(dock);
  updateHeight();

  // Mobile keyboards may shrink only the visual viewport, not the layout viewport.
  const viewport = window.visualViewport;
  if (viewport) {
    const updateKeyboardInset = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      dock.style.bottom = `${Math.ceil(inset) + 12}px`;
    };
    viewport.addEventListener('resize', updateKeyboardInset);
    viewport.addEventListener('scroll', updateKeyboardInset);
    window.addEventListener('resize', updateKeyboardInset);
    updateKeyboardInset();
  }
})();
