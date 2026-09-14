# Remove the rejected illustrated place view

September 13, 2026. Marissa rejected the new illustrated view: it did not look good or make the Atlas more helpful. This supersedes approval of that visual treatment. Staging correction only; production launch remains unapproved.

The illustration controller replaced the geographic map with a decorative place screen on every selection. It hid the existing nested amenities and useful detail controls behind an extra presentation layer. This affected all destinations, including places without a custom landmark.

The correction removes the illustrated discovery row, map artwork, unfolding place screens and their layout/palette overrides. The art script is no longer loaded. Place selection again opens the existing details directly over the geographic map, with its Close control, parent links and nested amenities. The lighter experience controller retains Now / With what's coming and the sourced future-project cards. All 100 records under 33 destinations and the three walking guides are unchanged. No new place facts, source approvals, Assistant behavior or resident data changes.

Validation: 16 existing Atlas checks, script syntax checks and actual local HTTP staging/production isolation passed. Desktop and 390 × 844 phone browser review confirmed no illustrated elements, a visible map behind direct details, McCormick's nested playground/shelter, accessible Close controls and no horizontal overflow. After closing the project details, returning from the future category to Now restores 33 destinations and 18 map areas. The About 30 minute trail option still selects the Providence guide. No browser errors or resident questions. The earlier full-suite results belong to the previous release; this limited UI removal uses focused checks.

Deployment and Notion verification pending at this implementation checkpoint.
