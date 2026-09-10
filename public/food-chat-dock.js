(() => {
  const dock = document.querySelector('.food-chat-dock');
  if (!dock) return;
  // Reserve the dock's actual height so even the last source/footer can scroll clear.
  const updateHeight = () => {
    document.body.style.setProperty('--food-dock-height', `${dock.offsetHeight}px`);
  };
  new ResizeObserver(updateHeight).observe(dock);
  updateHeight();

  // Mobile keyboards may shrink only the visual viewport, not the layout viewport.
  const viewport = window.visualViewport;
  if (viewport) {
    const updateKeyboardInset = () => {
      const inset = viewport.scale === 1
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      dock.style.bottom = `${inset}px`;
    };
    viewport.addEventListener('resize', updateKeyboardInset);
    viewport.addEventListener('scroll', updateKeyboardInset);
    window.addEventListener('resize', updateKeyboardInset);
    updateKeyboardInset();
  }
})();
