# Sterling Ranch, opened up: separate staging preview

Marissa approved the generated visual study on September 21, 2026: “Love it. Start building but keep the old one up so I can compare.” This approves a separate staging build. Production launch remains unapproved.

The new page is `/atlas/opened/index.html`. It adds only files beneath `public/atlas/opened/`; the existing `/atlas` and `/atlas/concepts.html` remain unchanged. Both have comparison links on the new page. The existing environment-based Atlas guard protects all new files, including images, from production access.

## What is implemented

Sterling Center is the first opening model. A generated neighborhood clean plate, transparent roof and transparent amenity sprites are composed as independent 2.5D layers. The range control opens the roof and brings Ranch Social, the patio/fire pit and log playground forward. Labeled buttons and the adjacent directory open real sourced records, including nested businesses. This is a fixed-perspective interactive composition, not a freely rotating 3D or surveyed architectural model. Geography and indoor/outdoor placement in the model are expressly illustrative.

All 100 existing catalog records remain searchable under 33 destinations, including nested amenities. `pickle ball` is normalized to `pickleball`. The existing source catalog is not modified. Destinations outside the Sterling Center model use their sourced or approximate geographic context and detail records. Three existing CAB walking guides include traced routes, start/finish, estimates, return mileage, nearby stops and the existing dated map annotation corrections. Future projects remain distinct, including planned children of existing parks. Projects without verified coordinates are not pinned.

Eight preview-only visitor-note entries were checked against operator pages on September 21. They add useful descriptions and official links for Ranch Social, Atlas Coffee, Salta, Living the Dream, Agora, patio, playground and food trucks. No open-now claims or exact tenant locations were invented; no facts were promoted into the Community Assistant. All other catalog and project facts retain their September 13 date.

## Visual and technical evidence

- [Asset prompts and provenance](../artifacts/atlas-opened/asset-prompts.json). Three PNG assets total approximately 5.3 MB. Generated with built-in image generation, not a paid CLI workflow. Real text and controls are HTML rather than baked into the scene.
- [Browser review](../artifacts/atlas-opened/browser-review.json): desktop 1440 × 1050 and phone 390 × 844, no horizontal overflow; nested businesses, food trucks, all-place search, pickleball, modal Escape/focus restoration, three walks, project children and unlocated School 51 checked; no browser errors. Real touch hardware was not tested. Reduced motion has a CSS fallback; the system preference was not emulated.
- Sixteen existing Atlas checks passed. New script syntax checked. The local HTTP isolation check covers every new file: staging 200 + noindex; production 404 under normal and spoofed staging Host headers. Initial restricted-shell subprocess failures were environment permissions; the same checks passed with subprocess access.
- [Local HTTP results](../artifacts/atlas-opened/http-check.json) and [release verifier](../artifacts/atlas-opened/check-release.cjs). Release verification requires an exact revision and compares every preexisting Atlas file to baseline `3f5c5673551c6ef2901bccf3cf36b9265c834b32`.

## Documentation and release state

Implementation and local checks complete. Staging deployment and exact-revision verification pending at this commit. This is not a production release. No resident questions were submitted. No original map files, source approvals, Assistant flows or production settings changed.

Design documentation: [Notion design reference](https://www.notion.so/3dabf909186d81b99d91ddd39861536b). The approval, implementation and verified-staging states will be recorded separately after exact-revision verification. Assistant diagrams and the inventory page are unaffected because catalog/Assistant data remain unchanged.
