# Resident journey test review — September 23, 2026

Status: local test coverage only. This is not a launch, live check, or owner approval.

`journeys.test.mjs` adds eight focused checks for the resident visit path:

- A 1.04-mile one-way route is shown as a 2.08-mile return trip, so it cannot appear in the 30-minute list.
- The all-area walking overview keeps all eight routes visible after a time filter; longer routes are muted rather than removed.
- Search finds matching places, walking guides, and future plans regardless of the open view.
- Unproven suitability wording cannot create a search tag.
- Access labels distinguish public, resident, apartment, and unconfirmed access.
- Older shared links and the current, richer link format both round-trip safely.
- Connection scenes keep child amenities as place links, keep walk routes separate, and state that they do not establish routes, entrances, or precise positions.
- All 16 saved future records retain their exact names.

Verification: `node --test --test-isolation=none journeys.test.mjs` using the bundled Node runtime completed with 8 passing tests. No implementation bugs were found by these checks.
