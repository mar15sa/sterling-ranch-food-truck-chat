# Food-truck release lane

Status: merged and verified live on September 25, 2026, at production revision `937e1ac55b60d7a774614c129b8f793b9cdae757`.

## Why this exists

Food-truck menu corrections can become stale within days. Until now, the fallback catalog lived inside `server.js`, so a one-truck data fix received the same release scope as a major Community Assistant code change. That made a correct menu update wait on unrelated evidence renewal and full answer checks.

The fallback catalog now lives in `data/food-truck-links.json`. The move preserves all 59 truck records, 6 aliases, and 6 display names from `origin/main` without changing resident-facing data.

## Release boundary

A food-truck release may change `data/food-truck-links.json` and documentation only. GitHub classifies any mixed runtime diff as `full`, including changes to `server.js`, workflows, scripts, dependencies, Community Assistant sources, or other data files.

The protected pull-request check validates the catalog, URLs, aliases, menu fixtures, service behavior, Community Assistant food-truck adapter, and scope rules. After merge, GitHub waits for the exact Railway revision and then runs the live food-truck health check against the deployed environment. A network-inconclusive result fails this deployment check because the release can't be verified live.

## Verification

- `npm run food-trucks:release:check` passed with 59 trucks, 6 aliases, and 22 focused tests.
- The complete protected `quality` gate passed for the infrastructure change.
- PR #197 merged through branch protection: https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/197
- The deployment check verified Railway was serving the exact merge revision: https://github.com/mar15sa/sterling-ranch-food-truck-chat/actions/runs/36211648794
- A manual production `npm run check:live` then passed for all 8 checked days.

The next isolated catalog-only correction should confirm that the new short `food-trucks` gate is selected end to end. The lane is live; that first real catalog-only use remains the final operating proof.

## Documentation

The Owner operations and privacy guide still needs a short explanation of the qualifying file boundary, required source research, protected checks, and exact live verification. The verified text and links are saved in `docs/pending-notion/2026-09-25-food-truck-release-lane.md` because Notion isn't available in this task.
