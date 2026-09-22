# Local verification — September 21, 2026

Status: proposed composition study, implemented and verified locally. No shared staging or production deployment, no design acceptance inferred.

## Final artifact checks

- `node --check` passed for `study.js` and `start-preview.cjs`.
- Full PNG decoding passed for the selected neighborhood artwork and both Sterling Center model layers.
- HTTP HEAD: all eight served study documents/assets returned 200 with `X-Robots-Tag: noindex, nofollow`.
- Local comparison pages on ports 4184 and 4185 still returned 200 with noindex. Neither worktree was edited for this study.
- The study server returned 404 for `/api/community/ask`, `/README.md` and `/.git/config`; no question was submitted. POST returned 405 and an unrecognized Host returned 403.
- Browser review: desktop, 936×884 and 390×844. All images loaded with nonzero dimensions; no console warnings/errors captured. Temporary viewport overrides were reset.
- All four landmark selections changed the card correctly. Burns retained the eight-court description and reservation source. Overlook retained activity-specific access and seasonal-pool notes. Prospect retained the future-phase distinction.
- Sterling Center: Food & drink exposes four Ranch Social businesses, Health exposes all four provider listings, Community exposes the Info Center and CAB contact. The phone keyboard ArrowRight test switched Health to Community correctly.
- Both comparison cards switch the large view correctly. The context inset returns to the overview. Model open/close state and accessible button state change together.
- Phone layout has no horizontal overflow. After the label fix, the Prospect button is entirely inside the artwork bounds.
- Reduced-motion style is present for every transition. This was inspected in source, not a full assistive-technology audit.
- Independent Terra read-only content reconciliation found all directory groups present. Its coverage wording concern was corrected from “whole neighborhood” to “neighborhood overview.”

## Scope

Only this artifact folder changes. The application, inventory sources, routes, existing previews and release settings are unchanged. The artwork remains schematic and the study remains a four-landmark subset. A complete production test suite is not applicable to a local static visual study; no production candidate was prepared.

## Documentation closeout

Target: https://www.notion.so/3dabf909186d81b99d91ddd39861536b

Implementation revision: `b8e1713ab9718f2b2e2ab153670a27436dd8034f`, pushed only to `codex/atlas-composition-study-20260921`.

The existing Atlas design section was updated and fetched back on September 21, 2026. Readback verified the exact feature revision, proposed/local status, preserved comparisons, schematic-art limitations and verification links. Documentation is synchronized for this study. No approval, deployment or production-live state is claimed.
