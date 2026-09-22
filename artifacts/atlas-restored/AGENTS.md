# Atlas design review

Keep this experimental artifact local; production launch requires the owner's explicit approval. Preserve earlier comparison previews.

Before calling a visual change an improvement, compare actual desktop and phone screenshots with the pinned 4186 neighborhood/Sterling Center study and the 4184 Overlook model. Review architecture, landscape, light, composition, readability, usefulness and geographic integrity. Run the full-area inventory/geometry tests and `npm run check:visual`. Record honest scores; never invent a pass, silently replace a baseline, or lower a baseline's score to admit a weaker candidate.

The gate checks recorded human or visual-AI judgments, screenshot hashes, runtime hashes and full coverage. It does not automatically detect beauty. A visual-AI pass is not owner approval. Runtime changes invalidate the review. New baselines require explicit owner direction.

Keep the complete saved geographic window, all current roots including unlocated entries, every future listing, and all three sourced walking guides. Unlocated entries must stay unpinned. Generated illustration positions are separate from source coordinates; do not claim the artwork is georeferenced or navigation-ready.

Use `npm run preview:review` only while developing or presenting a clearly pending candidate. `npm run preview` refuses startup without a valid review. After editing an already running development preview, rerun the gate and inspect `/review.html` before handoff.
