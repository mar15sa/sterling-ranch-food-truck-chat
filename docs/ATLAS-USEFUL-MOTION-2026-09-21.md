# Atlas: useful opening motion and a dimensional neighborhood

September 21, 2026. Status: implemented and checked in a local preview; not deployed to shared staging or production. Marissa asked for a more meaningful opening animation and a neighborhood view that feels unlike an everyday map. The accurate Sterling Center exterior and its sourced directory are retained.

## Experience

The default view is a rotatable Three.js architectural tabletop built from the existing mapped roads, paths, parks, water and building footprints. It supports camera buttons, pointer rotation, zoom, place selection, parks/everyday/future filters, and an 800 ms unfold/assemble transition. Unfolding lifts destination markers on tethers to their unchanged reference positions. Selecting a destination focuses the view and opens its nested amenities. All 18 located destinations are represented; names declutter into dots where necessary, with the full directory still available. Future mode maps only three existing reference-area records and keeps all other projects in the list.

Opening Sterling Center now lifts a separate roof away from its matching roofless exterior and spreads three selectable directory groups below it. UCHealth expands again to show primary care, urgent care and physical therapy. Phone groups use a horizontal carousel; selection reveals the relevant group. The model starts fully assembled so the opening has a complete visible journey. Existing source links, suites, visitor details, 101 records in 33 destinations, three CAB walking guides and eleven future-project groups are preserved.

The reference idea is Human Atlas's assembled-to-inspectable-parts interaction: https://github.com/ashemag/human-atlas. No Human Atlas code or assets were copied. The exact earlier social post was not found or claimed reviewed.

## Accuracy and limits

- The supplied September 13 geographic snapshot is clipped to its declared window before rendering. Polygon orientation matches roads and place coordinates. The window is not the full Sterling Ranch development boundary.
- Building heights, slab thickness and marker lifts are illustrative. No measured height, topography, entrance, parking, room or floor-plan data was added. Village orientation points do not define boundaries.
- Road/path linework gives context, not verified navigation or access. The CAB walking guides retain their original source-image geometry separately.
- Roofless shell and isolated roof were generated from the existing photo-informed exterior with the same camera and canvas. They illustrate opening; they do not verify unseen architecture or room positions. Exact prompts are in `artifacts/atlas-motion/asset-prompts.json`.
- The original `/atlas`, concept studies, shared place/geometry/trail data and Assistant evidence remain unchanged. No new place-source audit, source approval, automatic monitor or resident question submission occurred.

## Local preview and release coordination

Run `node artifacts/atlas-motion/start-preview.cjs` from this worktree. Open http://127.0.0.1:4184/atlas/opened/index.html. The helper binds only to loopback and serves only the Atlas files. It does not load the app, secrets, background jobs or resident-question APIs. It sends the optional food-truck link to the existing public page. Stop its Node process to close the preview. Port 4184 must be free.

The release coordinator in task `01a0c561-6431-7fa2-b736-4e0077713799` requested a shared-staging hold while the Assistant release finishes, followed by a durable local-preview/feature-branch default for unapproved experiments. This turn did not push shared staging, change hosting settings, create a paid service or launch production. Existing published comparison URLs remain available. A later coordinated staging window is separate work; do not call this local revision verified on staging.

## Verification

Nineteen focused Atlas inventory, nesting, source-safety, trail and preview-guard tests pass. App and renderer syntax checks pass. Actual local application HTTP checks cover every preview resource: staging 200/noindex and production 404, including a spoofed staging Host. No Assistant question was submitted.

Browser review covers desktop 1440 × 1050, the normal approximately 935-pixel viewport, and phone 390 × 844: full-model fitting, roof separation, independent selectable groups, nested clinic reveal and links, filter/reset consistency, future reference markers versus unlocated listings, place focus, camera turns, search for “pickle ball,” 101-record directory, walks and no page overflow. The obsolete Three.js soft-shadow warning found during review was removed; subsequent builds produced no new errors or warnings. Physical touch hardware, GPU compatibility across other browsers and reduced-motion emulation were not tested; the pointer thresholds, reduced-motion paths and fallback were reviewed in code. No full Assistant suite was rerun for this isolated preview change.

Three.js 0.186.0 is locally vendored from its official npm package with its MIT license and provenance; no external runtime CDN. Rendering is demand-driven with cancellable camera/explosion animations and resource cleanup. Catalog/route checks do not prove cartographic completeness.

Documentation impact is confined to the Design and experience reference: https://www.notion.so/3dabf909186d81b99d91ddd39861536b. The Assistant flow, source authority, operating settings and shared catalog facts did not change. Notion sync status and exact feature revision will be recorded after committing the reviewed preview.
