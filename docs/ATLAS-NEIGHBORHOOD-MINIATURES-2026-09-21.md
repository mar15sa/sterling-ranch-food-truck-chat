# Atlas neighborhood and destination miniatures

Implemented and verified locally September 21, 2026. Owner requested a more beautiful neighborhood view that fits Sterling Center and detailed models of other destinations. This is an unlaunched feature preview. Shared staging and production were not changed.

## What changed

The neighborhood has an ivory background, sage prairie surface, warm stone/wood plinth, cream buildings with roof caps, richer parks, turquoise water, restrained trail colors, softer shadows and a rotating compass. The same mapped geometry and 18 destination positions remain. Seeded miniature trees and shrubs are illustrative, placed only within mapped parks and excluded from mapped buildings, water, sports surfaces and roads/paths. There is no continuous idle animation or external texture request.

Four clickable landmark portraits connect the wide view to its close-ups. Their label positions avoid collisions and use connectors when offset; the portrait is a place label, not a geographic footprint. New models:

- **Overlook:** photo-informed clubhouse, balcony, pavilions and pool, with all six existing amenity listings.
- **Burns:** a study of CAB’s eight-court concept, with the current pickleball listing and booking link. Finishes and planting are illustrative. Larger park phases remain separate.
- **Prospect:** a photo-informed inclusive-playground vignette with its lime sails, green railings, ramps and accessible glider. All eight existing park amenities remain selectable, but the art does not pretend to show the whole park.

The Places up close chooser switches among these and the existing Sterling Center. Mobile destination selection shows the model first; selecting an amenity focuses its details. Every model returns to its real parent position on the neighborhood. The complete directory and original comparison pages are preserved. Planned additions open the existing future-project view.

## Reference and content scope

[Asset provenance](../artifacts/atlas-landmarks/asset-sources.json) records official reference URLs and interpretation limits; [generation prompts](../artifacts/atlas-landmarks/asset-prompts.json) record the art process. Reference photos remain local research files and are not republished. Overlook photos came from CAB document IDs 1743/1744, Burns from its published concept 2359, and Prospect from the developer’s all-abilities park article.

The new preview-only visitor overlay refreshes the Overlook/pool and Burns/courts with useful links. It does not set live opening status, guest counts, precise entrances, future dates or source approval. Other catalog details retain their existing checked dates. No Assistant evidence, approval index, resident records or source settings changed.

## Verification

23 focused Atlas tests passed, including complete amenity membership, future-phase exclusion, safe links/assets and focus bounds. JavaScript syntax passed. Actual temporary application servers served all 25 preview resources with noindex in staging mode and blocked them in production mode, including a spoofed staging hostname. No resident questions were submitted. [HTTP evidence](../artifacts/atlas-landmarks/http-check.json).

Desktop 1440 × 1050 and phone 390 × 844 checks covered loaded models, destination/amenity navigation, planned phase return, pool link, map filters/unfold/turn/reset, keyboard selection, Sterling Center’s opened business directory and no horizontal overflow. Removed an obsolete Three.js shadow option found during review. [Browser record](../artifacts/atlas-landmarks/browser-check.json). Real touch gestures and a broad accessibility audit remain outside this focused check.

All Atlas files outside the opened preview match comparison revision 3f5c5673551c6ef2901bccf3cf36b9265c834b32. The new images are illustrative studies, not surveyed models. The mapped rectangle remains short of a verified full development boundary.

## Review and documentation

[Open the local preview](http://127.0.0.1:4184/atlas/opened/index.html). Start instructions remain in [the local motion record](ATLAS-USEFUL-MOTION-2026-09-21.md). This standalone helper is loopback-only and serves Atlas files without app jobs or resident APIs.

Feature branch: codex/atlas-opened-20260921. This revision awaits owner visual feedback; no production launch is approved. The release coordinator lifted the earlier shared staging hold, while retaining local previews as the default. Any future shared staging publication must follow current-main reservation rules.

Documentation synchronized September 21, 2026: fetched, updated and fetched again the [Notion design reference](https://www.notion.so/3dabf909186d81b99d91ddd39861536b). It records implemented and verified-local status at [bd29374](https://github.com/mar15sa/sterling-ranch-food-truck-chat/commit/bd293744205820de85e18168f20128dddcd69172), source limits and test evidence while preserving earlier history. Shared staging and production remain unchanged. Assistant diagrams and source-authority explanations are unaffected.
