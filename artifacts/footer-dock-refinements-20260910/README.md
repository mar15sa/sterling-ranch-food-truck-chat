# Home footer and desktop composer clearance

Owner requested a botanical home footer with centered monogram, no motto/quotes, and no email-draft note; also reported the pinned food-truck composer being cut off on desktop.

The home footer now has a circular SRS seal between thin rules, decorative generated botanical artwork, the existing brand, one pair of feedback links, and the independent-resource/Idea Kitchen credit. The artwork is local at `public/society-footer-botanicals.webp`.

The composer is now a direct child of the body, independent of chat ancestors that could contain or clip a fixed element. Its width is constrained to the chat, with an explicit border box and 12px clearance from the visible bottom edge. VisualViewport positioning no longer ignores scaled viewports. The measured reserved space includes clearance and is shared with document scroll padding. The app script is deferred so it binds after the relocated composer exists.

The exact original clipping was not reproduced in the existing Chrome tab or a fresh in-app browser tab at inspection time. The change addresses ancestor clipping, flush-edge positioning, and scaled-viewport positioning rather than assuming a specific user's browser state.

`node artifacts/footer-dock-refinements-20260910/check.cjs` checks candidates; `REFINEMENTS_LIVE=1` checks staging. Four widths (320, 390, 768, 1448), short 420px viewports, touch scrolling, source/footer clearance, input focus and submission, quick dates, accessibility, and overflow pass. A transformed/paint-contained page-wrapper case verifies the composer remains viewport-pinned independently of the chat layout. Footer checks verify one feedback pair and no unwanted taglines or email-draft note. Automated follow-up answers use local browser fixtures; Community Assistant calls are blocked.
