# Route highlighting — September 23, 2026

Owner feedback: the repeated landscape picture and detached route-shape inset did not help locate a walk. That treatment is superseded in this local candidate. Preview 4196; 4195 preserved. Owner review pending, no staging or production deployment.

## Implemented

All eight guides now use a route-specific crop of the actual CAB source map, muted into the Atlas green/cream palette. Their saved polylines are highlighted directly over the corresponding trail, with a white casing, copper center line, A/B endpoint markers and subtle directional dots. Loop A means start/return. One-way guides state the out-and-back distance. Surrounding roads, intersections and unselected paths remain visible. The source image and route points use one coordinate frame (1242 × 2000); the original 2483 × 4000 PNG is stretched explicitly to this saved frame to avoid aspect-ratio drift. No coordinates were transferred onto the non-georeferenced neighborhood painting.

The forty broader section entries show their map crop and a ring around the recorded mileage label, with an explicit label explaining this. They are not presented as forty fully traced routes. The full map remains linked. Source dates, unverified entrance/access limits and future-project separation remain intact.

The new route view is a styled source map, not a new 3D reconstruction. The main neighborhood painting, all models and all inventory records are unchanged. Existing rejected walking-inset screenshots remain historical evidence only.

## Review

GPT-5.6 Terra independently reviewed all eight source traces and endpoints on the actual source image and found no corrections needed. Saved analysis crops/overlays are under eval/alignment-review. Junction markers do not establish accessible visitor entrances.

GPT-6 Astra reviewed actual desktop (900 × 1200) and phone (390 × 1200) screenshots, guide/source dialogs, loop and one-way markers, the 0.27-mile section locator, card buttons, and Unfold. Captures waited for map-image loading. The phone card button width was corrected after a clipped arrow was observed. Escape restores trigger focus, original-map color disclosure works, and no console errors or horizontal overflow were observed.

77 automated tests pass. New checks require source-context highlighting (and reject detached shape/repeated landscape output), preserved source points, distinct route framing, endpoints inside each frame, loop/one-way marker rules, and honest section locators. Existing coverage and asset-pin checks pass. Reduced-motion CSS disables directional animation; a real touch-device field/navigation test was not performed.

Fresh walking screenshots and hashes replace the five required walking states and the walking-guide discovery state. Core/model/future/focus evidence is reused only for unchanged scope, with baseline scores unchanged. The gate verifies recorded evidence and runtime identity; it does not automatically judge visual quality or authorize launch.
