# Providence trail art generation record

## Result

Generated with the built-in ImageGen tool and saved unchanged at `assets/trails-providence.png`. The file is the one targeted revision described below.

- Output dimensions: 1331 x 1182 pixels (same 1.126:1 aspect ratio as the 1284 x 1140 authority map).
- No API or CLI fallback was used.

## Inputs inspected

- Geometry authority: `eval/alignment-review/providence.png`, 1284 x 1140 pixels.
- Source crop frame: `[600,400,642,570]` within the original 1242 x 2000 source.
- Original style-only source: `assets/full-landscape.png`, 1536 x 1024 pixels. It was not edited.
- Readable style-only reference used by ImageGen: `eval/alignment-review/style-reference.jpg`, a non-creative JPEG conversion of the original created to resolve ImageGen's PNG decoder error. It was visually inspected before generation.

## Tool

Built-in `image_gen.imagegen`, one successful asset generation, with the geometry map and readable style reference supplied as local references.

## Exact prompt

```text
Use case: stylized-concept
Asset type: one project raster background for an interactive trail overlay.
Input images: Image 1 is the GEOMETRY AUTHORITY and the exact edit target. Image 2 is STYLE ONLY.
Primary request: Transform Image 1 into a rich overhead, north-up illustrated miniature terrain rendering of exactly the same cropped region. Preserve the street centerlines, parcel/street pattern, greenway boundaries, road centerlines, trail centerlines, junctions, and cropped bounds at the exact same normalized positions as Image 1. This is a precise map-background reconstruction, not a new composition.
Scene/backdrop: warm olive grass greenways and open space, detailed but muted homes only within existing street parcels, small trees, subtle planted edges, small water/creek areas only where present in the geometry.
Style/medium: match Image 2's detailed, polished miniature landscape illustration: rich overhead cartographic terrain, softly dimensional buildings and trees, warm soft shadows, restrained natural color, no camera tilt.
Composition/framing: exact 1284 by 1140 aspect ratio, overhead vertical view, NORTH-UP, exactly the reference crop. Preserve every road and path's centerline and all intersections.
Lighting/mood: warm soft daylight shadow, calm and richly detailed.
Color palette: warm olive green open land, low-saturation blue-gray streets, muted roof tones, gentle turquoise water only where geometry specifies it.
Text (verbatim): no text.
Constraints: delete all annotation callout boxes, leader lines, land labels, road names, symbols, route highlighting, routes, dashed paths, route distance numbers, logos, icons, and all lettering from Image 1 while retaining the underlying physical road/trail geometry. Do not infer named places or facilities from annotation leaders. Existing SVG route paths will be layered on top, so geometry must be exact.
Avoid: no labels, no typography, no numbers, no visible routes or highlighted paths, no border framing, no map rotation, no crop change, no camera tilt, no invented landmarks, no invented roads, no buildings outside existing parcel/street areas, no watermark.
```

## Visual alignment notes

The required geometry reference was visibly inspected before the successful tool call; its target frame is north-up and includes curved residential streets in the center and lower-left, a broad eastern open-greenway area, the north-south Moore Road on the right, and the primary route network.

The output is north-up and preserves the source aspect ratio. It contains no labels, callout boxes, route highlighting, text, distance numbers, leader lines, or blue water features. The miniature-terrain look, warm olive greenways, small trees, muted homes, and soft shadows match the intended visual direction.

However, visual inspection shows material geometry drift. The generated road network uses different curvatures and junction placements from the authority map; the central and lower-left residential streets are substantially reinterpreted, the long eastern road/open-space edge has shifted, and new circular intersections appear. It is therefore a styled visual candidate only, not an aligned background that can safely receive the existing route SVG overlays without further correction.

## Targeted correction revision

The initial image incorrectly read the source's cyan trail marks as water and navy park polygons as ponds. One built-in ImageGen revision replaced every visible invented water feature with dry olive meadow, trees, and narrow pale walking paths, while making the former pond-like clearings dry park areas. The new output was copied over `assets/trails-providence.png` unchanged.

Exact revision prompt:

```text
Use case: precise-object-edit
Asset type: interactive trail-overlay background.
Input images: Image 1 is the current candidate edit target. Image 2 is the GEOMETRY AUTHORITY.
Primary request: Revise Image 1 with one focused correction using Image 2 for exact meaning and placement. The cyan markings in Image 2 are TRAILS, not water; remove every invented blue stream, creek, river, pond, lake, channel, or water feature from Image 1. Replace those invented water features with warm olive meadow, low grass, small scattered trees, and narrow pale walking paths only where the cyan trail geometry appears in Image 2. The navy polygons/circles in Image 2 are PARK CLEARINGS, not ponds; restore them as dry tree-ringed olive park clearings in their source locations. Preserve the miniature overhead illustrated terrain style and muted homes.
Geometry: keep Image 2 north-up aspect ratio and the road/street centerlines, intersections, parcel areas, and park/greenway boundaries as close as possible to their exact normalized source positions. Do not add, move, curve, or infer roads, facilities, ponds, or landmarks. Fix only the invented water interpretation and restore dry parks.
Constraints: no text, labels, callouts, leader lines, logos, icons, dashed overlays, highlighted routes, route lines, distances, numbers, water features, camera tilt, rotation, or crop change.
Avoid: any blue water, canals, creeks, ponds, lakes, artificial circular water, or invented amenity structures. Existing route SVGs will sit above this background.
```

Revision assessment: visually, the blue streams and ponds have been removed. The source geometry remains materially shifted, especially in residential roads, intersections, and the eastern open-space edge.
