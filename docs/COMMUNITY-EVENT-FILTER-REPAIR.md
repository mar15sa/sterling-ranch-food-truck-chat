# Event filter precision — September 14, 2026

Status: planned local repair; not deployed.

Root cause: structured calendar filters match any substring from any requested word. Consequently `yoga class` admits `Swimming class`, `art` admits `Party`, and `Town Hall` admits another hall. The live-planning diagnostic exposed this before activating the candidate. This affects named activity and multiword venue searches across communities, not only yoga.

Before: an unrelated event can be presented as matching the requested activity or place. After: category searches require whole matching topic words; location/facility searches require all substantive venue words. Explicit `or` alternatives are separate choices. Common function words do not constrain a phrase; class/event descriptors do not replace a supplied topic, but remain searchable when they are the entire category. Existing audience synonym lists retain their alternative-term behavior. Category searches inspect title/category, not a venue name that happens to contain the topic.

The official calendar remains the authority for its dated listings. This changes text matching only: it does not add synonyms, infer activity suitability, invent events, alter date coverage or extend freshness. A text match is not proof of age suitability or registration availability. The existing empty-result, alternative-list and degraded-source contracts remain; absence means no matching listing in the checked scope, never no such activity exists. Connector identity, official actions, source timestamps, profile settings and tenant separation stay intact.

Shared matching belongs in the calendar adapter module. No community-specific vocabulary or answer text is added. Tests must cover generic-word collisions, substrings, multiword topics and venues, explicit alternatives, short/accented names, broad categories, existing audience synonyms, and two profile-configured adapters. Run the full suite before recording the repair as validated. No UI change, paid calls or release is authorized by this repair.

Documentation impact: calendar filtering explanation and the accessible flow description need a local-repair annotation. The flow nodes and authority hierarchy are unchanged. Save the exact Notion update under the existing external-write approval rejection; do not label it synchronized or live.
