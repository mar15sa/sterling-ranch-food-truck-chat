# Food-truck release lane

Status: implemented locally from production revision `52003a2`; merge and live verification pending.

## Why this exists

Food-truck menu corrections can become stale within days. Until now, the fallback catalog lived inside `server.js`, so a one-truck data fix received the same release scope as a major Community Assistant code change. That made a correct menu update wait on unrelated evidence renewal and full answer checks.

The fallback catalog now lives in `data/food-truck-links.json`. The move preserves all 59 truck records, 6 aliases, and 6 display names from `origin/main` without changing resident-facing data.

## Release boundary

A food-truck release may change `data/food-truck-links.json` and documentation only. GitHub classifies any mixed runtime diff as `full`, including changes to `server.js`, workflows, scripts, dependencies, Community Assistant sources, or other data files.

The protected pull-request check validates the catalog, URLs, aliases, menu fixtures, service behavior, Community Assistant food-truck adapter, and scope rules. After merge, GitHub waits for the exact Railway revision and then runs the live food-truck health check against the deployed environment. A network-inconclusive result fails this deployment check because the release can't be verified live.

## Verification plan

- Run `npm run food-trucks:release:check` for the focused behavior and release boundary.
- Run the complete full gate for this infrastructure change.
- Merge through the protected `quality` check.
- Verify the exact production revision and successful `npm run check:live` deployment step.
- Prove the lane with the next isolated catalog-only correction before marking the process fully verified.

## Documentation

The Owner operations and privacy guide needs a short explanation of the qualifying file boundary, required source research, protected checks, and exact live verification. The pending text is saved in `docs/pending-notion/2026-09-25-food-truck-release-lane.md` because Notion isn't available in this task.
