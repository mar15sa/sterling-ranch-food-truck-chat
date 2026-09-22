# Atlas visual-review gate

This gate preserves a human comparison between the rich architectural miniature baseline and a new candidate. It does **not** decide whether images are beautiful and it does not launch, publish, or grant owner approval.

1. Capture the baseline and candidate screenshots for all five required states. Put both files inside this Atlas artifact root, for example in `eval/evidence/`.
2. First create `eval/baselines.json` with the real, pinned baseline for every state: `state`, `sourceCommit`, `path`, and `sha256`. Keep the user-preferred 4186 baseline for Neighborhood and Sterling/SC states, and source 4184 for Overlook. Do not silently promote a later candidate into this registry. A changed registry makes existing reviews stale. The registry is versioned in source control; its real provenance belongs in the entry and commit history, not an invented owner-approval field.
3. Create `eval/visual-review.json` from the schema described below. Record the actual file paths and SHA-256 hashes, the reviewer, reviewer type (`human` or `visual-ai`), date, scores, and any hard failures. Each state must explicitly set `actualJudgment: true`, and the record must set `actualComparison: true`. False, absent, or guessed judgments fail. A baseline must include its source, source commit, capture date, and recorder. A visual-AI pass is evidence of that review only; it never represents owner approval or a launch decision.
4. Run `node eval/check.mjs --fingerprint` after the runtime image/site files are final. Put that exact value in `runtimeFingerprint`.
5. Calculate the SHA-256 of the exact `baselines.json` contents and put it in `baselineRegistryFingerprint`. `check.mjs` exports `baselineRegistryFingerprint` for programmatic use.
6. Run `node eval/check.mjs`. A pass means only `visual-review-pass`. Any runtime addition or edit outside `eval/`, `docs/`, or `build-reference/` makes the record stale and requires a fresh review.

The review must also contain `coverageChecks`. This is a full-area record, not a seven-destination assertion: it has `passed: true`, `scope: "full-saved-atlas-area"`, exact unique expected and included arrays for current roots, all places, and routes, plus the exact bounds `{ "west": -105.077, "east": -105.02, "south": 39.477, "north": 39.518 }`. The checker derives the expected sets from `places.json`, `directory.json`, `visitor-notes.json`, and `area-visit.json` through `catalog.mjs`, including future and unlocated places, and routes from `trails.json`. It requires at least the baseline 101 merged places, while allowing source-backed additions. `layout.json` must include every current non-future parent: exact saved source coordinates for located roots, and `null` source coordinates plus `null` image pixels for unlocated roots. Copying a seven-place crop into every array fails.

Each state has `actualJudgment: true`, `baseline` and `candidate` objects with `{ "path", "sha256" }`; the baseline also has `{ "provenance": { "source", "sourceCommit", "capturedAt", "recordedBy" } }`. It must exactly match the matching registry entry. Give both `baselineScores` and `scores` all seven dimensions: `architecture`, `landscape`, `lighting`, `composition`, `readability`, `usefulness`, and `geographicIntegrity`. Candidate values must be integers 4–5 and must not be lower than their baseline value.

The top-level record must include:

```json
{
  "verdict": "visual-review-pass",
  "reviewer": "reviewer name or reviewer system",
  "reviewerType": "human",
  "reviewedAt": "YYYY-MM-DD",
  "actualComparison": true,
  "runtimeFingerprint": "SHA-256 from the command",
  "baselineRegistryFingerprint": "SHA-256 of baselines.json",
  "coverageChecks": {
    "passed": true,
    "scope": "full-saved-atlas-area",
    "expectedCurrentRootIds": [], "includedCurrentRootIds": [],
    "expectedPlaceIds": [], "includedPlaceIds": [],
    "expectedRouteIds": [], "includedRouteIds": [],
    "bounds": { "west": -105.077, "east": -105.02, "south": 39.477, "north": 39.518 }
  },
  "functionalChecks": { "passed": true, "checks": ["named functional check"] },
  "hardFailures": [],
  "states": []
}
```
