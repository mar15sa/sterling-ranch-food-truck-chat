# Image generation record

Built-in image-generation tool; visual-study artwork only. The first reference image is a code-rendered view of the saved OSM geography with four catalog anchors. Other references are the previously generated photo-informed Sterling Center, Overlook and Prospect models. The output is a schematic interpretation, not verified geography, buildings, paths, landscaping, entrances or infrastructure.

## Selected output and exact request

- Tool: built-in `image_gen.imagegen`.
- Selected output: `assets/neighborhood-study-v2.png` (1536 × 1024, fully decoded after copying).
- Original generated file: `C:/Users/mar15/.codex/generated_images/01a09b67-6431-7ac2-95c7-a4f6738e500e/exec-6eab82c5-78d9-4748-b024-5cebfa94bd4b.png`.
- Reference 1: `assets/geography-reference.png`, rendered by `build-reference.cjs` from the saved geography and catalog.
- References 2–4: `public/atlas/opened/assets/sterling-center.png`, `overlook-model.png`, and `prospect-model.png` from the preserved `atlas-opened-worktree` (branch `codex/atlas-opened-20260921`). These are prior illustrations, not surveys.
- The initial generated attempt was not selected because its PNG failed a full decode; its invalid project copy was removed. No editing or filtering of the generated pixels was performed outside image generation.
- The selected regeneration used the complete prompt below, with this final sentence appended verbatim:

> CRITICAL: The Burns Park compound must show eight individually enclosed pickleball courts in TWO ROWS OF FOUR, each with full white boundary and central net. Do not use four long courts. Output a valid fully decodable PNG.

The output follows the relative landmark ordering but does not faithfully reproduce all supplied geography. The study explicitly labels the artwork as schematic. Do not derive any new source fact from it.

## Initial prompt

Use case: stylized-concept. Create one exceptionally beautiful, polished architectural miniature atlas illustration for a Sterling Ranch neighborhood design study. Wide landscape 1536x1024. This is a single continuous crafted landscape seen from almost overhead, with a gentle 3D orthographic tilt. It must feel like a collectible architectural model photographed for Monocle magazine: intricate, warm, inviting, intelligible, expensive. NOT a standard web map, not an empty slab, not a collage of floating building cutouts.
REFERENCE ROLES: Image1 is a true north-up geography and anchor guide. Preserve its major road shapes, relative four anchor positions and diagonal composition. Images2,3,4 are appearance references for Sterling Center, Overlook, Prospect playground. Recreate them in one consistent miniature rendering style with shared scale exaggeration, lighting and shadows; do not paste these photographs.
Composition: use virtually the entire frame, edge to edge. Sterling Center in upper-right quadrant near 72% across/16% down, Overlook at 84% across/29% down, Burns courts at 61% across/54% down, Prospect park at 14% across/86% down. The landscape between these anchors is continuous. Geography is schematically compressed, but don't reorder these anchors. Main developed area follows the road geometry along the right side. West/left middle is simple golden Colorado meadow texture, with no invented focal destination or giant mountain. The denser small houses belong around Providence in the upper-right. Keep context buildings subtle and landmarks disproportionately large enough to recognize at browser scale.
Four hero destinations: Sterling Center has a two-story red brick and warm cedar wing beside a tall glass hall and white/silver facade, as reference2. Overlook white gabled clubhouse, dark metal roofs, stone details, turquoise outdoor pool as reference3. Burns is a compact group of EXACTLY EIGHT blue pickleball courts, arranged two rows of four, with slim low visual glass enclosure; no other developed regional park sports grounds, no stadium. Prospect is an intimate green park with a distinctive lime-green shade-sail inclusive playground with blue slides, a small curved lawn and a walking loop, as reference4; no beach club, no big water park.
Art direction: intricate small dimensional architecture, subtly textured sage and straw landscape, delicate dense miniature trees only as contextual illustration, warm cream road ribbons, clear earth-colored walking paths following reference geometry, turquoise accents only at actual referenced water/pool locations. No invented path joining farapart destinations. Warm directional late-afternoon sunlight, soft precise shadows, broad crisp focus, tactile materials, sophisticated restrained color. Residential footprints are context, not the star. These should all belong to one physical scene.
No text whatsoever, no labels, no numbers, no UI, no floating pin markers, no thick rectangular plinth, no detached islands, no exploded transparent layers, no perspective horizon, no tiltshift blur, no fantasy architecture, no invented future school/library buildings. The UI and truthful labels will be added separately. This artwork is an explicitly schematic design concept, not navigational cartography.
