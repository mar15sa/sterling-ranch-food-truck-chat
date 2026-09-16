# Mobile navigation repair

Owner request: the mobile menu on the staged homepage looked poor.

Cause: a small text toggle coexisted with three always-visible navigation links; expansion revealed the remaining destinations in a two-column grid. Homepage overrides also made the brand too small to compete with the toggle.

The mobile header now has a 44px icon button with an accessible Open/Close navigation name. All six destinations appear together in a vertical list with at least 52px tap targets, readable type, thin dividers and a teal current-page marker. The toggle becomes an X while open. Closed links are removed from keyboard navigation. Escape restores focus to the toggle; tapping outside closes the list. No-JavaScript visitors retain all six links. Homepage brand lettering is larger and can wrap at narrow widths.

The shared navigation fix covers all six editorial pages. Desktop navigation and content layout are preserved. Asset versions are updated on those pages so browsers fetch the repair.

Validation: 11 browser scenarios passed: homepage at 320, 390, 430, 760 and 1448 pixels; all other pages at 390; and no-JavaScript navigation. Checks include closed and open states, keyboard Enter/Tab/Escape, outside dismissal, six links, tap size, overflow, page errors, and nine WCAG A/AA header scans. No Assistant requests were submitted. JavaScript syntax and git diff whitespace checks passed. Local assets were tested against staging using browser response interception; MENU_LIVE=1 runs the same checks against the deployed assets.

This change affects navigation presentation only. It changes no question family, evidence selection, approved claim, adapter, live source or Assistant answer behavior. The owner's feedback authorizes correcting the mobile navigation from the previous design.
