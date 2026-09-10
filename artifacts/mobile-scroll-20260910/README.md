# Food Trucks mobile document scrolling

The legacy mobile stylesheet set body overflow:hidden below 681px, expecting a viewport-height chat with internal message scrolling. The editorial layout changed the chat and message containers to auto height and visible overflow, leaving the document as the sole scrolling area. The surviving body lock prevented actual touch and wheel scrolling even though full-page screenshots and dimension checks looked correct.

The old viewport lock is now scoped to body:not(.society-page), preserving legacy behavior while allowing the editorial Food Trucks page to scroll normally. Its stylesheet URL is versioned so staging browsers fetch the correction.

Reproduced on staging at 390px: a 2000px document in an 844px viewport remained at scrollY=0 after both touch swipes and wheel input; computed body overflow was hidden. The regression check uses actual browser-dispatched touch gestures and wheel events, verifies the footer and question box are reachable, and checks scrolling after mobile-menu dismissal. It never submits Assistant questions.

This is a presentation-only fix. No menus, API answers, resident-question logs, or source behavior change. Before/preview/staging results and screenshots are saved alongside check.cjs.

Candidate checks passed at 320, 390, 430, 680, 681 and 1448 pixels. All five touch-enabled widths moved more than 500px after a swipe; desktop wheel scrolling also worked. Every width reached the footer and question box without horizontal overflow or page errors. Mobile-menu dismissal preserved scrolling. Whitespace checks passed.
