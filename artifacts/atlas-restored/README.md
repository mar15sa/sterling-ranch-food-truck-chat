# Sterling Ranch Atlas — full-area visual restoration

Separate local preview at http://127.0.0.1:4188/. Earlier previews, shared staging and production are unchanged.

The full saved map window includes Providence, Ascent, Prospect, Parkvale and their surrounding corridors. It is not a surveyed Sterling Ranch boundary. The catalog retains 101 saved listings, 25 current top-level destinations (18 positioned and 7 unlocated), 16 future records within 11 project groups, and 3 CAB walking guides. Source dates remain visible in the saved data; this change does not certify a fresh inventory or approve source facts.

The continuous landscape is generated artwork guided by the saved street geometry. Its four landmark labels are registered to painted models, deliberately separate from geographic coordinates. **Check map placement** reveals the saved geometry and switches all markers to their source positions. Art is approximate; buildings, landscaping and future buildout are not factual evidence. Unlocated places remain in the directory. The source map carries OpenStreetMap attribution in About.

Sterling Center retains its detailed shell and lifted roof, with selectable directory groups. The Overlook, Burns and Prospect retain their earlier detailed models. The selected landmark also has a detailed portrait beneath the overview, preserving recognition while the map keeps the entire area visible. Group cards reveal actual nested places; positions are not floorplans or entrances. Trails use CAB's own source-image diagrams separately from decorative paths.

## Run and review

- `npm test` checks catalog, coverage, projection and the review gate's failure cases.
- `npm run preview:review` starts an unapproved loopback development preview.
- `npm run check:visual` verifies the actual review evidence.
- `npm run preview` refuses startup until that gate passes.
- `/review.html` displays the current gate result and recorded comparison images.

The review is a recorded visual judgment plus automated evidence/coverage checks. It cannot guarantee aesthetic quality and does not grant design approval or permission to launch. Any runtime change invalidates the record. See `eval/WORKFLOW.md` and `AGENTS.md`.

## Provenance

Catalog, trails, map geometry and visitor notes were carried from the existing September 21 local Atlas snapshots, preserving per-record sources. Detailed model PNGs are unchanged from the earlier opened models. The new full landscape was generated September 21, 2026 using the source-layout plate and the preferred composition screenshot; later generations corrected landmark layout and strengthened the miniature architecture and landscape. Painted positions still differ from source geometry and are explicitly handled as illustration registration.

The reference plate builder currently depends on the sibling Providence worktree's source geometry and the desktop's bundled Sharp library. The committed plate/layout do not need that builder at runtime. Review-server baseline aliases need the preserved sibling composition and opened worktrees; committed screenshot evidence remains self-contained.

No resident questions were submitted, no data was promoted into Assistant evidence, and no staging or production deployment occurred.
