# Pending Notion update: isolated food-truck release lane

- Target page: Owner operations and privacy, https://www.notion.so/3dabf909186d81028da2d4e84f033e77
- Status: implemented locally; not yet merged or verified live
- Date: September 25, 2026
- Reason pending: Notion isn't available in this task. Fetch the page before editing and preserve unrelated owner content.

## Proposed operating-guide update

Food-truck links and fallback menu items use an isolated release lane. A release qualifies only when `data/food-truck-links.json` is its sole runtime change; documentation may accompany it. The protected pull-request check validates the catalog, links, aliases, menu fixtures, and food-truck behavior without waiting on unrelated Community Assistant evidence renewal.

Each correction still starts from current production in an isolated worktree and needs current official, social, or ordering evidence for the affected truck. Any mixed application or data change automatically uses the full release gate. Shared staging is optional for a catalog-only correction and still requires the staging lease when used.

After merge, the deployment check waits for Railway to serve the exact merged revision and report readiness. It then runs the live food-truck health check against that environment. The correction is live only after both checks pass.

## Verification still required

- Full protected check and merge revision for the release-lane infrastructure.
- Exact production revision and passing deployment smoke run.
- First catalog-only pull request classified as `food-trucks` with a passing protected check and live deployment check.
- Fetch the Notion page before editing, add the verified revision and run links, then fetch it again to confirm the update.
