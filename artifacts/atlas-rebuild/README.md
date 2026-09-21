# Local neighborhood rebuild

Run `node artifacts/atlas-rebuild/start-preview.cjs` from this feature worktree to serve the static Atlas on loopback port 4185. The helper loads no app secrets, application jobs or resident APIs. Port 4184 belongs to the prior comparison and is not reused.

`node artifacts/atlas-rebuild/check-http.cjs` starts temporary loopback servers in staging and production configurations, stubs the live monitor, and verifies all files beneath `public/atlas/opened`. It writes `http-check.json`; logs and generated evidence are local artifacts, not deployed assets. The servers terminate in the checker’s cleanup.

See `docs/ATLAS-NEIGHBORHOOD-REBUILD-2026-09-21.md` for implementation, source constraints and verification scope.
