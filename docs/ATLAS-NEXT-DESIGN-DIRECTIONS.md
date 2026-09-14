# A map that helps you know the neighborhood

Update, September 13, 2026: Marissa approved staging implementation with “Make it happen.” The first illustrated-place views, future reveal and walk-time experience are implemented in the [open-places release](ATLAS-OPEN-PLACES-IMPLEMENTATION.md). This document preserves the original brainstorm and its longer-term ideas. Production launch remains unapproved.

Brainstorm prepared September 13, 2026. These are design directions for discussion, not approved production designs. The grouped directory and first walking guides are implemented separately; the visual concepts below are proposals.

## Recommended: places that open up

Give the neighborhood a few recognizable illustrated landmarks. A park is one object on the map. Select it and its playground, shelter and other amenities lift into a small labelled arrangement around it, with a line back to the park. McCormick would open into two items; Sterling Center would open into its businesses, with services nested underneath.

The useful question is “What is actually here?” Each item opens the practical details: what to bring, who can use it, whether it needs booking, and the right action. The arrangement explains membership; it does not invent the position of a shelter or slide. Future amenities use a clearly separate treatment.

On a phone, the same interaction becomes a parent card with expandable amenities. A user never has to rotate a 3D object to find a playground. Keep keyboard selection, readable labels, reduced motion and a clear back button.

First visual prototype: McCormick, Burns and Sterling Center. Draw a distinct, restrained landmark silhouette for each and use the existing parent relationships to open the place. [Human Atlas](https://github.com/ashemag/human-atlas) is the interaction reference for moving from an assembled object to its parts; its anatomy and dark styling are not the proposed design.

## Walks that tell you what to do next

Choosing a walk brings forward one colored path with its start and finish. Stops along a verified route become a simple sequence: walk, play, sit, get coffee where the location and opening details support it. Distances and the next useful action live beside the map. The initial three map-based walks are the first functional step toward this direction.

The signature moment is following the path through the neighborhood while places along it become legible. A short-walk selector can eventually answer “I have 20 minutes” using measured route distances, realistic time estimates and suitable known amenities. Do not imply a public connection, stroller suitability or an open cafe from proximity alone.

On a phone, route choices and the start/finish details remain usable without dragging. Larger gestures enhance the map but never replace the instructions. Route diagrams can stay schematic until official geographic linework is available.

## See the neighborhood now and next

A Now / What’s coming control changes the map itself. Existing places stay solid. Confirmed projects appear as lightly illustrated additions, with their phases and latest dated milestone. Selecting the elementary school should show the actual opening target and enrollment action; selecting a future park should show what is proposed and what has started.

The useful question is “What will be near me, and when can I use it?” Keep the full project story in one parent card. Use only sourced planning areas or reference points, and distinguish a target date from a confirmed opening. A timeline must not imply every project has a reliable completion year.

On a phone, use a simple two-state switch and project cards. On desktop, a restrained reveal can show how places fit together. Start with School 51, Burns phases and the library before attempting a whole-neighborhood build-out animation.

## Suggested order

Finish the nested-place interaction first, then prototype the three landmark cutaways. Continue adding source-backed walks to the route guide. Use the Now / What’s coming treatment once the selected projects have reliable location and phase information. That gives the map a distinctive interaction while every visual answers a practical resident question.
