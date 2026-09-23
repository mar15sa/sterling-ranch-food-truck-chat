# Walks review — September 23, 2026

Implemented and visually checked locally; owner review pending. No launch authorization or deployment.

Fresh CUA review at 900 × 1200 desktop and 390 × 1200 phone confirmed shared landscape art, separate route-shape insets, source-map toggles, Ascent filtering, route dialogs, source-section dialogs, Escape focus return, and eight guides / forty sections / six access cards. The main map Walks filter contains fourteen matching destinations and all eight guide cards; the new link opens the complete walking page. Unfold has three representative previews and eight directory guides. A spacing regression was found during review and fixed by removing inherited thumbnail margins, with a stacked tablet fallback. No horizontal overflow was observed. Phone guide text was enlarged after visual review.

Source-image review confirmed the previously ambiguous diagonal mileage as 0.27 miles (eval/mileage-detail.png). The saved CAB map dates to October 2025, so it does not establish today's opening status or live closures. No route line is placed on the non-georeferenced painted terrain.

Evidence reuse is deliberately scoped: core neighborhood, village/place focus, future-only views and close-up model screenshots from the prior journey review remain valid for their unchanged layout, art and behavior. They were not recaptured or relabeled as fresh. The landscape and model/source hashes are unchanged. New walking-layer and dialog evidence supplements those records. The earlier review is preserved in eval/previous-journey-review.json. No baseline scores were increased.

Automated checks and the runtime/evidence gate are recorded separately in trail-test-results.txt and visual-review.json. This review does not replace owner approval, actual touch-device testing or a current-access survey.

Final applicable automated result: 74/74 passed. The gate now additionally requires five walking-specific desktop/phone screenshots, their hashes and explicit actual-review records. Missing or modified evidence fails.
