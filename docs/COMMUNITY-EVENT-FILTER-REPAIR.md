# Event filter precision — September 14, 2026

Status: implemented and tested locally at `b6282a25e5a5712f7992aebb6f4e55a749d038b0`; not deployed. The following scope was recorded before implementation.

Root cause: structured calendar filters match any substring from any requested word. Consequently `yoga class` admits `Swimming class`, `art` admits `Party`, and `Town Hall` admits another hall. The live-planning diagnostic exposed this before activating the candidate. This affects named activity and multiword venue searches across communities, not only yoga.

Before: an unrelated event can be presented as matching the requested activity or place. After: category searches require whole matching topic words; location/facility searches require all substantive venue words. Explicit `or` alternatives are separate choices. Common function words do not constrain a phrase; class/event descriptors do not replace a supplied topic, but remain searchable when they are the entire category. Existing audience synonym lists retain their alternative-term behavior. Category searches inspect title/category, not a venue name that happens to contain the topic.

The official calendar remains the authority for its dated listings. This changes text matching only: it does not add synonyms, infer activity suitability, invent events, alter date coverage or extend freshness. A text match is not proof of age suitability or registration availability. The existing empty-result, alternative-list and degraded-source contracts remain; absence means no matching listing in the checked scope, never no such activity exists. Connector identity, official actions, source timestamps, profile settings and tenant separation stay intact.

Shared matching belongs in the calendar adapter module. No community-specific vocabulary or answer text is added. Tests must cover generic-word collisions, substrings, multiword topics and venues, explicit alternatives, short/accented names, broad categories, existing audience synonyms, and two profile-configured adapters. Run the full suite before recording the repair as validated. No UI change, paid calls or release is authorized by this repair.

Documentation impact: calendar filtering explanation and the accessible flow description need a local-repair annotation. The flow nodes and authority hierarchy are unchanged. Save the exact Notion update under the existing external-write approval rejection; do not label it synchronized or live.

## Verification result

Five new family tests passed across both configured community adapters. The first focused run exposed a short venue-name bug (the letter A was treated as an article) and a test fixture using the wrong profile ID property; both were corrected before final validation. The final full suite passed **905/905**, with zero failed, skipped or cancelled tests, exit code 0, in 545,695.0883 ms. Tested revision: `b6282a25e5a5712f7992aebb6f4e55a749d038b0`. Log: `artifacts/quality-eval/event-filter-suite-20260914.log`; terminal exit record: matching `.exit.txt` file.

At 23:06:17 UTC, a post-repair read-only check using previously captured model-selected requests still returned the real matching yoga listing and valid current-status evidence, both without diagnostics. No new model calls were made. Capture: `artifacts/quality-eval/live-planning-nonstrict-20260914/public-execution-after-filter.json`. This is local source execution, not hosted release verification. Exact Notion update remains pending in `docs/pending-notion/2026-09-14-live-planning-and-event-filters.md`.
