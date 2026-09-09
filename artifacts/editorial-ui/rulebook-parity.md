# Approved Rulebook shortcut parity fix

The approved homepage has a direct “The rulebook ↗” shortcut after Home & yard and Trash & recycling. The live page omitted that third shortcut. It now opens the official adopted rulebook in a new tab.

The link uses `/rulebook`; the server redirects using the existing `OFFICIAL_SOURCE_URL` export from the rules module. No second official URL, source claim, source approval, or answer-routing rule was introduced. This change affects direct rulebook navigation only. The palette, shared navigation, section ordering, feedback controls, pool treatment, and calendar behavior remain unchanged.

## Validation

- All 473 existing tests passed (`rulebook-tests.txt`).
- Focused browser checks passed at desktop 1440 and mobile 390, plus mobile with JavaScript disabled: shortcut order, configured redirect, keyboard activation, new-tab behavior, target size, and no horizontal overflow.
- Desktop and mobile axe scans found no WCAG 2 A/AA or 2.1 AA violations.
- No Community Assistant question requests were made by the focused browser checks.
- Updated screenshots: `home-desktop.png` and `home-mobile.png`. The shortcut has keyboard focus in these captures.
- `npm run check` was attempted. Its precheck stops because existing approved source evidence is expired (164 source records, 624 facts); see `rulebook-check.txt`. This bounded UI fix does not alter evidence freshness or bypass that check.
- No push or deployment.

## Files

Application: `public/index.html`, `server.js`.
Evidence: this note, `rulebook-ui.cjs`, `rulebook-ui-results.json`, `rulebook-tests.txt`, `rulebook-check.txt`, and the two updated homepage screenshots.
