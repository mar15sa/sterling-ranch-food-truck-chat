# Community routing evidence reuse

`scripts/check-community-evidence-reuse.js` is an offline guard for deciding whether a completed routing benchmark can be reused. It never calls the AI service or a hosted site.

Run it with the saved routing report and the `configurationFingerprint` from the deployment health response:

```sh
node scripts/check-community-evidence-reuse.js --evidence routing-report.json --config-fingerprint <64-character-health-fingerprint>
```

The result is `reusable` only when the report already records a passed, candidate-valid, three-repeat benchmark with no failures; is no more than seven days old; and matches all three current identities:

- Runtime fingerprint: `server.js`, every `lib/*.js` runtime module, the routing evaluator and soak harness, routing benchmark, community profiles, controlling rules data, and dependency lockfile. Public UI, openings data, documentation, and workflow metadata are excluded.
- Approved-source fingerprint: every static source and top-level approved-source field, including status, authority versions, ledger/fact data, and migration mode. `checkedAt`, `staleAfter`, similar freshness fields, and live event/status connectors are excluded.
- Configuration fingerprint: the supplied health value, which represents the relevant model and runtime settings without exposing credentials.

Reports made before this identity contract are intentionally `needs-full`; the checker does not infer missing identities from their old deployment revision or timestamp. A reusable report must cover exactly 50 cases at least three times, contain every observation, meet the 98% routing thresholds and 100% injection rejection, and record no failures. A failed or missing candidate validation, incomplete benchmark, changed identity, stale report, or malformed input also requires a full benchmark.
