# Openings page — September 10, 2026

Owner-requested redesign based on the supplied Openings mockup and Society palette.

- Reuse the home page's mountain illustration, with matching monogram and serif typography.
- Compact statistics strip, map, four filters, and three-column listing grid (two columns on tablet, one on phones).
- Nine listings per page. Preserve the existing default of all statuses, sorting, live counts, filters, map locations, evidence links, and tip form. Status badges still show each listing's exact status; map colors group upcoming, recently open, and other updates.
- Keep one feedback pair in the footer. No backend or Assistant changes.

`node artifacts/openings-editorial-20260910/check.cjs` checks candidate files against staging's live catalog through browser response overrides. Set `OPENINGS_LIVE=1` to verify the deployed page without overrides.

Verified at widths 320, 390, 768, 1122, and 1448: live counts, nine-card pagination, responsive columns, no horizontal overflow, search/empty state/clear, community/category/status and quick filters, evidence expansion, map zoom, tip dialog open/close, one feedback pair, mobile navigation, and actual touch scrolling. Automated accessibility scans report no WCAG A/AA violations at these widths. No Assistant questions or opening tips are submitted. Screenshots and JSON results accompany the check.
