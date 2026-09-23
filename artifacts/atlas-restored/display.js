/**
 * Small, optional display preferences for the Atlas preview.
 *
 * Integration: load display.css after the other stylesheets, then import and
 * call initDisplayPreferences() once after the page has been created. It adds
 * itself after .comparison-links (or at the end of <main> if that link row is
 * not present). Other motion-aware code can call window.atlasReducedMotion().
 */
export const DISPLAY_STORAGE_KEY = 'sterling-ranch-atlas.display-preferences.v1';
export const DEFAULT_DISPLAY_PREFERENCES = Object.freeze({
  largeText: false,
  reduceMotion: false,
});

const TEXT_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,a,button,label,input,select,textarea,summary,li,small,strong,b,span';
const MAP_ART_SELECTOR = '.landscape, .route-map, .route-sketch, .village-plan-sheet, .walk-overview__scene, .building, .model-hotspots, svg, canvas';

export function normaliseDisplayPreferences(value) {
  if (!value || typeof value !== 'object') return { ...DEFAULT_DISPLAY_PREFERENCES };
  return {
    largeText: value.largeText === true,
    reduceMotion: value.reduceMotion === true,
  };
}

export function loadDisplayPreferences(storage) {
  try {
    return normaliseDisplayPreferences(JSON.parse(storage?.getItem(DISPLAY_STORAGE_KEY) || 'null'));
  } catch {
    return { ...DEFAULT_DISPLAY_PREFERENCES };
  }
}

export function saveDisplayPreferences(storage, preferences) {
  const clean = normaliseDisplayPreferences(preferences);
  try {
    storage?.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Private browsing and restrictive browsers may deny storage. The current
    // page still honours the selection; it simply will not be remembered.
  }
  return clean;
}

function isTextElement(element) {
  const isFormControl = element.matches?.('input,select,textarea');
  return element.matches?.(TEXT_SELECTOR)
    && (isFormControl || element.textContent.trim())
    && !element.closest(MAP_ART_SELECTOR);
}

function rememberBaseTextSize(element, getStyle) {
  if (!isTextElement(element) || element.dataset.atlasBaseTextSize) return;
  const size = Number.parseFloat(getStyle(element).fontSize);
  if (Number.isFinite(size) && size > 0) {
    element.dataset.atlasBaseTextSize = String(size);
    element.style.setProperty('--atlas-display-size', `${size}px`);
    element.classList.add('atlas-display-text');
  }
}

function rememberTextSizes(root, getStyle) {
  if (root.nodeType !== 1) return;
  rememberBaseTextSize(root, getStyle);
  root.querySelectorAll?.(TEXT_SELECTOR).forEach((element) => rememberBaseTextSize(element, getStyle));
}

// A newly added child may inherit the already enlarged font size. Measuring a
// whole batch with this attribute temporarily removed always records its real
// normal-size value, so nested spans cannot become 400%, 800%, and so on.
function measureAtNormalSize(root, documentRoot, getStyle, measure) {
  const wasLarge = documentRoot.dataset.atlasLargeText;
  if (wasLarge === 'true') documentRoot.dataset.atlasLargeText = 'false';
  try {
    measure(root, getStyle);
  } finally {
    if (wasLarge === 'true') documentRoot.dataset.atlasLargeText = wasLarge;
  }
}

function forgetTextSizes(root) {
  root.querySelectorAll?.('.atlas-display-text').forEach((element) => {
    delete element.dataset.atlasBaseTextSize;
    element.style.removeProperty('--atlas-display-size');
    element.classList.remove('atlas-display-text');
  });
}

function createControls(documentRef, preferences, onChange) {
  const details = documentRef.createElement('details');
  details.className = 'display-preferences';
  details.innerHTML = `
    <summary>Display preferences</summary>
    <div class="display-preferences__body">
      <p>Choose what is easier to read here. Your device’s motion setting is always respected.</p>
      <label class="display-preferences__choice"><input type="checkbox" name="largeText"> <span>Larger text (200%)</span></label>
      <label class="display-preferences__choice"><input type="checkbox" name="reduceMotion"> <span>Reduce motion</span></label>
    </div>`;
  const largeText = details.querySelector('[name="largeText"]');
  const reduceMotion = details.querySelector('[name="reduceMotion"]');
  largeText.checked = preferences.largeText;
  reduceMotion.checked = preferences.reduceMotion;
  details.addEventListener('change', () => onChange({
    largeText: largeText.checked,
    reduceMotion: reduceMotion.checked,
  }));
  return details;
}

export function initDisplayPreferences({
  documentRef = document,
  storage,
  matchMedia = globalThis.matchMedia?.bind(globalThis),
  getStyle = globalThis.getComputedStyle?.bind(globalThis),
} = {}) {
  const root = documentRef.documentElement;
  if (root.dataset.atlasDisplayPreferencesReady) return;
  root.dataset.atlasDisplayPreferencesReady = 'true';
  let usableStorage = storage;
  if (usableStorage === undefined) {
    try { usableStorage = globalThis.localStorage; } catch { usableStorage = undefined; }
  }
  let preferences = loadDisplayPreferences(usableStorage);
  const systemReducedMotion = () => Boolean(matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  const apply = (next) => {
    preferences = saveDisplayPreferences(usableStorage, next);
    root.dataset.atlasLargeText = String(preferences.largeText);
    root.dataset.atlasReduceMotion = String(preferences.reduceMotion);
  };

  // This helper lets future interactions use the user setting plus the OS
  // setting, rather than accidentally replacing the OS preference.
  globalThis.atlasReducedMotion = () => preferences.reduceMotion || systemReducedMotion();
  if (getStyle) {
    measureAtNormalSize(documentRef.body, root, getStyle, rememberTextSizes);
    const observe = new MutationObserver((records) => measureAtNormalSize(null, root, getStyle, () => {
      records.forEach((record) => record.addedNodes.forEach((node) => rememberTextSizes(node, getStyle)));
    }));
    observe.observe(documentRef.body, { childList: true, subtree: true });

    let resizeFrame;
    globalThis.addEventListener?.('resize', () => {
      globalThis.cancelAnimationFrame?.(resizeFrame);
      resizeFrame = globalThis.requestAnimationFrame?.(() => {
        measureAtNormalSize(documentRef.body, root, getStyle, (body, style) => {
          forgetTextSizes(body);
          rememberTextSizes(body, style);
        });
      });
    });
  }

  const controls = createControls(documentRef, preferences, apply);
  const anchor = documentRef.querySelector('.comparison-links');
  (anchor?.parentNode || documentRef.querySelector('main') || documentRef.body)
    .insertBefore(controls, anchor ? anchor.nextSibling : null);
  apply(preferences);
  return { get preferences() { return { ...preferences }; }, controls };
}
