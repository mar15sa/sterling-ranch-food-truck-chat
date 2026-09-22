# Sterling Ranch: neighborhood composition study

Status: **proposed visual direction**, implemented and checked locally on September 21, 2026. Not owner-approved and not deployed to shared staging or production.

The owner asked for a more beautiful, useful miniature neighborhood and accepted a separate composed study before another working-map rebuild. This artifact preserves the earlier interactive prototypes. It does not replace their inventory, routes or future-development views.

## View and compare

- New study: http://127.0.0.1:4186/
- Prior neighborhood: http://127.0.0.1:4185/atlas/opened/index.html
- Earlier detailed models: http://127.0.0.1:4184/atlas/opened/index.html

Start this study with `node artifacts/atlas-composition/start-preview.cjs`. It serves only an explicit list of static study files on loopback port 4186. It does not load application settings, APIs, resident logs or jobs. The preview process is local and is not persistent hosting.

## The composition

A single continuous miniature landscape puts the four reference landmarks in their relative compass order. Native labels point to their illustrated buildings/amenities, and selecting a landmark changes the visit card. Sterling Center opens into an architectural illustration, a neighborhood context inset and the existing directory's food, health and community groups. The roof reveal can be opened and closed. The three directory tabs support keyboard arrow navigation. A comparison section shows the assembled and opened compositions side by side.

On phones, the illustration stays whole and the selected-place card moves below it. Both views honor reduced motion. Official-source links provide the current operator details; this is not a booking or navigation service.

## Grounding and limitations

- `catalog-reference.json`, `directory-reference.json` and `geography-reference.json` are unchanged snapshots from the prior Atlas worktree, runtime revision `4e6c83f7b32143b340398d142a4f1573da700bdb`.
- Grounded anchors: Sterling Center `[-105.037492,39.506824]`; Overlook `[-105.0318231,39.5026661]`; Burns `[-105.044373872245,39.493107823419]`; Prospect `[-105.069455963122,39.4801306675546]`. A source anchor is not a surveyed footprint, entrance or parking location.
- The neighborhood image is **generated schematic art**, with geographic reference and prior landmark illustrations supplied to image generation. Roads, streams, water, houses, vegetation, building footprints and path continuity are not validated. It must not be promoted into navigational geometry or presented as the full current neighborhood.
- Burns is shown with eight courts, not later park phases. Prospect's future phases are not a promise of currently available amenities.
- The four-landmark subset is an art-direction study. It does not claim to include the entire community, all destinations or the trail inventory. The complete working catalog remains in the earlier comparison.
- All three Sterling Center directory groups from the source supplement are represented. Ranch Social contains Atlas Coffee, Salta, Living the Dream and Agora. UCHealth's services are nested within its medical-center listing. CAB is a contact associated with the Info Center; a separately visitable counter is not asserted.
- The opened illustration is not an interior floor plan, suite-position diagram or accessible wayfinding plan. Group labels do not identify physical locations inside the building.
- No source approvals, current hours or geographic validation were newly granted by this design task. The prior source review dates are preserved.

## Verification

Focused checks for this isolated static artifact, September 21, 2026:

- JavaScript/helper syntax validated; every referenced PNG fully decoded.
- Desktop and 390×844 phone browser review; complete artwork and responsive visit card checked. A clipped phone label was corrected.
- Landmark selection changes the visit information; Burns exposes eight courts and the official reservations source.
- Sterling Center opens and closes, keeps a context map, and renders all three real directory groups. Keyboard arrows switch the groups.
- All loaded images report complete and nonzero natural dimensions. Phone body does not overflow horizontally.
- Reduced-motion styling removes transitions. No application behavior is touched.

Exact final HTTP/browser closeout evidence is in `VERIFICATION.md`. A full production release gate is not applicable: no production candidate or deployment is created here. A later implementation still needs the complete inventory, geographic validation, owner design approval and its applicable release checks.

## Documentation

Design reference: https://www.notion.so/3dabf909186d81b99d91ddd39861536b

Record this study as proposed and locally verified, preserving prior dated design history. Synchronization/readback status is recorded in `VERIFICATION.md`.

See `IMAGE-PROMPT.md` for the generation request, references and provenance. Generated artwork is a design material, not evidence for source facts.
