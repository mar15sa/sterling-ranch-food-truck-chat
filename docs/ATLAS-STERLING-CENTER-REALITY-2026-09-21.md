# Sterling Center: reference-based exterior and complete directory

September 21, 2026. Scope: the separate `/atlas/opened/index.html` preview only. Production launch remains unapproved. The original Atlas, three concept studies, shared catalog and trail files are unchanged.

## What changed

The previous scene used fictional one-story architecture and initially opened inside Ranch Social. The updated scene uses a photo-informed exterior with the actual building's two-story brick/wood wing, tall glass hall and diagonal silver-panel wall. Opening the model reveals three directory groups rather than invented rooms. This is generated visual interpretation, not a measured digital twin; unseen roof and landscape details are approximate. It preserves the opening interaction but does not claim floor positions or tenant doorways.

The default details panel now opens Sterling Center's whole-building directory. Seven direct listings are grouped as food/gathering (Ranch Social), health/wellness (UCHealth, Lake Family Dental, Sterling Eyecare, RAVE), and community help (Info Center, CAB contact). The ten nested businesses, clinics and outdoor features remain directly selectable. The opened preview combines the unchanged 100-record catalog with one sourced CAB contact addition, for 101 records in 33 destinations. This is not a new exhaustive audit of every place in Sterling Ranch.

Suite numbers come from operator/community pages: UCHealth center, urgent care and physical therapy 100; Info Center 110; Eyecare 120; Dental 220; RAVE 230. Primary Care links to its clinic page as listed by UCHealth; that child page was unavailable in the source tool, so no child-specific suite/hours/phone was claimed. CAB is an office contact listed with the Info Center: its own public counter/suite/hours are unconfirmed, and visitors are told to call first. Primrose remains separate at 8159 Piney River Avenue. Ent and Siemens appear in older photo signage but lack current resident-facing evidence in the two checked directories; they are not added as current tenants.

Each refreshed listing has official actions and sources. The source check is dated September 21; older neighborhood/future records keep their September 13 dates. There is no new automatic monitor, source approval or Assistant evidence change.

The mapped-site control highlights OpenStreetMap building 675524539 and shows nearby property points using the existing September 13 geometry. This view establishes a mapped footprint and surrounding roads/paths, not indoor positions, accessible entrances or parking availability. It does not use the rejected fictional neighborhood scene.

## Sources and visual reference

- [CAB Sterling Center directory and exterior](https://sterlingranchcab.com/275/Sterling-Center) · [reference image](https://sterlingranchcab.com/ImageRepository/Document?documentID=1654). Historical tenant signage was omitted from the generated model. The photo itself is a local research reference and is not published as a project asset.
- [Developer Sterling Center directory](https://sterlingranch.com/town-life/sterling-center/)
- [Ranch Social](https://sterlingranch.com/town-life/ranch-social/)
- [UCHealth medical center](https://www.uchealth.org/locations/uchealth-sterling-ranch-medical-center/) and the exact child clinic links preserved in the directory JSON
- [Lake Family Dental](https://mylakefamilydental.com/), [Sterling Eyecare](https://www.sterling-eyecare.com/), [RAVE](https://raveclinics.com/)
- [Official original architecture announcement](https://sterlingranch.com/happenings/news/breaking-ground-on-sterling-ranchs-civic-center/) and [architecture feature](https://www.metalarchitecture.com/articles/a-modern-civic-center-sterling-ranch-civic-center/) informed the material/shape audit. No third-party article photography was republished.
- [OpenStreetMap attribution](https://www.openstreetmap.org/copyright)

The built-in image-generation tool produced `public/atlas/opened/assets/sterling-center.png`. The complete prompt and reference provenance are in `artifacts/atlas-reality/asset-prompts.json`. Older illustrative PNGs remain in the preview asset folder but are no longer loaded by the page.

## Validation

- 19 focused Atlas tests pass, including complete center membership, preserving the comparison catalog, visibility of ungrouped future additions, and rejecting unsafe visitor actions/invalid membership.
- Script syntax passes. Local HTTP checks cover all 11 preview resources: staging 200/noindex and production 404, including a spoofed staging Host header.
- Browser review at 1440 × 1050 and 390 × 844: whole-building default, all tenant/nested controls, clinic suite and official link, CAB call-first note, group navigation, opening slider/buttons, separate mapped-site view, 101 records/33 destinations, pickle ball search, dialog Escape, walks and future-project view. No horizontal overflow or console errors observed.
- A separate Terra read-only code/data review found no actionable issues. Source reconciliation and architecture reference review were separately delegated; Astra integrated and reviewed the result.
- Physical touch, assistive-technology navigation and measured indoor wayfinding remain outside these checks. Reduced-motion rules are preserved; system preference was not emulated.
- No Assistant questions, resident-record changes, outreach, production settings or source approvals.

## Release and documentation

Implementation complete; staging release verification will be recorded here after the exact deployed revision is ready. Prior staging revision checked before release: `b7ea41ba7379a55f2b5793db79211e4f7aa1e204`.

Documentation impact: update the Atlas section of [Design and experience reference](https://www.notion.so/3dabf909186d81b99d91ddd39861536b) and the [Atlas inventory](https://www.notion.so/3dabf909186d8164930fc37c1865c026). These updates must distinguish the 101-record opened preview overlay from the unchanged 100-record comparison Atlas. Assistant diagrams, source approvals and operating configuration are unaffected. Notion synchronization pending release verification.
