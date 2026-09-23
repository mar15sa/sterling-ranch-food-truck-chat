# Photo-based place expansion

Implemented and verified locally September 22, 2026. Owner review pending. No staging or production deployment and no launch authorization.

The local 4193 preview contains 19 dimensional place illustrations, up from four. The 4190 preview remains unchanged for comparison. New models cover Horsebrush, Pioneer, McCormick, Pat Gallagher, the Lawn at Providence, Steve Bloom, Yard 27, High Top, Trailrock, Gathering Green, Zippity, Peekaboo, Willow Creek Trailhead, Primrose and Prose at Parkvale.

## Reality and scope

Each new model was generated against an official photograph, then compared visually with that photograph. GPT-5.6 Terra independently reviewed the first 14 image pairs; GPT-6 Astra integrated and reviewed all 15. Peekaboo was corrected to remove unsupported furniture and excessive planting. McCormick was corrected to retain the photographed entrance plaque. Prose was added after the independent batch and reviewed directly by Astra against its official Greystar exterior photo.

The UI exposes the local reference photograph, original source link and a short scope statement. These are dimensional raster illustrations, not surveyed geometry or rotatable meshes. Planting and rendering are interpretive. McCormick, Gathering Green, High Top, Primrose and Prose deliberately show a photographed detail or facade, rather than inventing a complete site from a partial photograph. The unseen Zippity zipline and future Willow Creek repair station were not fabricated.

Six destinations retain their directory entries without a new model: Providence Regional Park, Outcrop, Broadstone, John Adams Academy, the water treatment plant and Willow Creek Wildlife Corridor. Reasons are recorded in `data/models.json`; available material either shows a different context, unfinished construction, marketing renderings or insufficient physical detail. This work does not approve new source facts or claim a complete current-fact audit.

## Verification

- 49 tests passed. The model checks require all 15 new model IDs, official source metadata and the exact image/photo hashes recorded in `data/model-review.json`. A later image or source replacement needs a fresh source-pair review.
- All 19 destinations were opened through the browser chooser. Images loaded and the Sterling Center roof layers remained exclusive to Sterling Center. No horizontal overflow was found at the reviewed desktop width.
- Actual 900 by 1200 desktop and 390 by 1200 phone review covered the new model/photo switch, reset when changing destinations, existing model rendering, Sterling roof open/close, full neighborhood and future-only map. Browser console had no captured errors or warnings.
- Five new core screenshots were visually compared with the pinned owner-selected base. The four existing model assets and full-area neighborhood artwork remain unchanged. Source coordinates, all 101 listings, 25 destinations and three walking guides remain intact.
- Coming Soon still shows its map, 11 project groups and 16 future records; current model panels and directory are hidden. The new desktop screenshot was inspected. Existing unchanged Unfold, walking, focus and phone future evidence is explicitly reused in the review record.

Screenshots and the browser check record are in `eval/evidence/models/`. The source-pair comparison page is `eval/model-references.html`. Exact hashes and the runtime fingerprint are in `eval/visual-review.json`; prior review records and pinned baselines are preserved. No Community Assistant question was submitted.

These checks establish the reviewed local behavior and scoped resemblance to the available photographs. They do not establish an exact complete reconstruction of every site or owner approval of the design.
