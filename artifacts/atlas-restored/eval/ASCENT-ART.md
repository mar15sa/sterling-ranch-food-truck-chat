# Ascent trail background artwork

- **Final asset:** `assets/trails-ascent.png`
- **Tool:** built-in ImageGen (`image_gen.imagegen`), not an API/CLI fallback.
- **Output:** 1167 × 1348 px PNG (aspect ratio 0.8656; source crop is 900 × 1040 px, 0.8654).
- **Geometry source crop:** `eval/alignment-review/ascent.png`, 900 × 1040 px. The crop represents `[620,850,450,520]` within the 1242 × 2000 source image and was treated as the geometry authority.
- **Style reference:** `assets/full-landscape.png`, inspected through the project-local decoded preview `eval/alignment-review/style-reference.jpg`. The original style PNG has an uncommon PNG filter that ImageGen's strict decoder rejected, so its decoded JPEG preview was supplied as the style-only reference. The original was not changed.

## Exact generation prompt

```text
Use case: precise-object-edit
Asset type: trail-map landscape base layer for a web route overlay
Input images: Image 1 is the GEOMETRY AUTHORITY and exact crop/frame to preserve. Image 2 is STYLE ONLY.
Primary request: Create one detailed miniature landscape raster artwork for exactly the framed region of Image 1, retaining all actual road and greenway centerlines, curves, crossings, and junctions at the exact same normalized locations as Image 1. Image 1 is north-up and must stay north-up. Preserve the 900 x 1040 portrait crop aspect ratio and geographic bounds; do not zoom, pan, rotate, tilt, or reframe.
Scene/backdrop: a rich orthographic overhead miniature community landscape. Warm olive meadow, terrain, dense clusters of small realistic trees, subtle creek/greenway vegetation, and muted small houses ONLY in the residential parcels shown in the geometry map.
Style/medium: match Image 2's high-detail warm miniature diorama aesthetic: softly lit, natural, polished, realistic miniature landscape; do not copy Image 2 layout.
Composition/framing: exact Image 1 framing, strict true overhead orthographic view, north up.
Lighting/mood: soft warm late-afternoon light, natural shadows, calm.
Color palette: olive and sage greens, warm straw meadow, muted gray roads, subdued residential roofs.
Constraints: Remove every label, number, callout box, leader line, logo, route highlight, dashed route line, measurement, and annotation from Image 1. Annotation leader lines are NOT roads. Preserve only the actual map geometry: street and greenway layout. Do not introduce landmark features beyond natural meadow, trees, creek vegetation, roads, greenways, and small houses within mapped residential parcels. Leave visual clarity for SVG routes to be overlaid later. Maintain all real road and trail centrelines with alignment accuracy as the primary goal.
Avoid: text, letters, numbers, icons, pins, arrows, borders, callout lines, highlighted teal routes, dashed blue routes, decorative paths that do not exist in Image 1, empty white voids, perspective tilt, aerial camera angle, map labels, watermarks.
```

## Visual alignment notes

The result is a north-up, true-overhead-looking miniature landscape and retained the requested portrait frame closely. It contains no visible labels, route highlights, or callout lines.

Alignment is **not exact enough to certify against the existing SVG route paths**. Image generation broadly echoed the large left-side north–south road, the upper east–west road, and the lower residential masses, but it changed several local street curves, crossings, parcel patterns, and greenway shapes. It also added a central pond/lake, which is an invented feature. Treat this as an art exploration/background candidate only until a visual overlay comparison confirms whether the path layer remains usable; do not claim pixel-accurate route alignment from this output.

## Revision 1 — final asset

The first candidate was replaced in `assets/trails-ascent.png` with one further built-in ImageGen edit. It used the same original source crop as the geometry authority and the first candidate only as a rendering reference. The revision removed the invented pond/lake and kept the same 1167 × 1348 output dimensions.

```text
Use case: precise-object-edit
Asset type: illustrated context layer beneath fixed source SVG polylines
Input images: Image 1 is the strict source map and absolute geometry authority. Image 2 is a prior art candidate for texture and rendering only; do not use its geometry, lake, roads, or houses.
Primary request: Rebuild Image 1 as a clean north-up, strictly orthographic miniature landscape while keeping the source map's exact crop, bounds, normalized coordinates, and actual road/greenway centreline geometry. This must be a direct map edit, not a new imagined community scene. Follow Image 1's road and greenway layout literally: every curve, crossing, junction, and street position must align to Image 1 so source polylines can render on top.
Scene/backdrop: only the land-use implied by Image 1: olive meadow and trees in green areas; slender vegetated creek/greenway corridors; compact muted houses only inside the pale mapped residential blocks; muted light-gray roads following the source.
Style/medium: Image 2's warm, detailed miniature diorama material quality, but applied strictly to Image 1 geometry.
Composition/framing: preserve Image 1's 900x1040 portrait aspect ratio, north up, exact geographic framing. No tilt, zoom, crop shift, rotation, or perspective.
Constraints: Remove only the labels, measurement text, callout boxes, leader lines, logo, teal highlight boundary, and blue dashed/solid overlay routes from Image 1. Leader lines are annotations and must not become roads. Keep actual streets and mapped greenway paths exactly where Image 1 shows them. This area has NO pond or lake: remove the invented central pond from Image 2. Do not add water bodies, roundabouts, cul-de-sacs, roads, trails, parks, sports courts, buildings, or landmarks absent from Image 1. Preserve open mapped parcels as open meadow.
Avoid: all text, numbers, markings, pins, borders, route highlights, dashed paths, callout leaders, logos, invented water, invented street grids, invented residential blocks, visual geometry drift, oblique aerial angle, watermark.
```

The source semantics were rechecked after generation: **cyan thick lines are trails, not streams or other water; navy filled polygons are parks, not ponds.** The final candidate has no central pond/lake. It still renders a narrow stream-like linear feature beside the left-side road instead of a clear narrow walking trail, and it continues to create extra local street/house geometry. These are remaining visible limits. Therefore it is still not certified for direct use under the source polylines. Any later use should make the cyan trail corridors read as narrow walking paths in meadow and remove every inferred water feature.
