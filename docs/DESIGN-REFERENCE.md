# Design reference and history

Reconciled September 13, 2026 against production revision `0bb9a4d4856b5389089d350a6c97bdfc9677b4ce` and the existing dated design evidence. The [Notion design guide](https://www.notion.so/3dabf909186d81b99d91ddd39861536b) holds the visual reference, screenshot, assets, and separately labeled prototypes. This review does not create new design approval or claim new browser coverage.

## Which reference to use

Use implemented styles and the dated live screenshot for shipped appearance. Use the matching approval/release record for authorization. Use old mockups to understand exploration. An implementation or merged PR does not establish the reason for every individual design choice.

| Record | Status and use |
| --- | --- |
| Original local `design-mockups/design-review.md` | Earlier proposal/approval snapshot. Newsreader/Inter, earlier headline/navigation names, and mauve `#9B7188` are not today's complete specification. |
| Original local `design-mockups/editorial-v4/README.md` | September 8 preparation record, with the owner's corrected nine-color palette including mauve `#987188`. Its pending-approval sentence describes that preparation stage. |
| [September 9 implementation record](../artifacts/editorial-ui/README.md) | Records implementation against the approved v4 review, local checks and early calendar behavior. Its no-deployment statement applies to that work session. |
| [Editorial release #102](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/102) | Shipped the approved shared editorial site September 11, merge `dcf4f0e170e5cdedd86d7dcbf7693e089c998761`. The PR and closeout establish the overall approved release. |
| [Weather #105](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/105) and [homepage/calendar #116](https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/116) | Later changes supersede relevant earlier weather, homepage, and calendar descriptions. |
| Notion screenshot captured September 13 at `4a0e65f` | A dated desktop observation. It is not new mobile testing or verification of later owner panels/prototypes. |

The original mockup folders remain in the owner's local workspace and are not included as production assets in the inspected repository. Their historical labels preserve the originals without changing the website.

## Shipped implementation locations

- Shared typography, palette and components: [society.css](../public/society.css).
- Homepage overrides: [briefing-home.css](../public/briefing-home.css).
- Subpage overrides: [society-subpage.css](../public/society-subpage.css).
- Homepage structure and navigation: [index.html](../public/index.html) and [society.js](../public/society.js).
- Dated implementation, interaction and accessibility evidence: [editorial-ui](../artifacts/editorial-ui/README.md).

The shared shell uses Georgia/Times New Roman headings and Arial body/interface text; the homepage has broader Times New Roman overrides. The homepage heading is The Daily Briefing. The corrected palette's mauve is `#987188`; the earlier `#9B7188` reference is superseded by the September 8 palette correction. Current values and screenshot dates are recorded in Notion.

## Decision trail and limits

The palette correction has an explicit dated owner record. The overall editorial release has the approved implementation reference, PR #102, and the [September 11 closeout](COMMUNITY-ASSISTANT-GOAL-CLOSEOUT-2026-09-11.md). The retrieved records do not establish an individual reason for every font or navigation-name change; retain that bounded unknown rather than inventing a rationale or treating all designs as awaiting approval.

Keep new proposals, owner-approved designs, implemented changes, and verified-live changes separate. Resident-facing design work still requires the owner's explicit approval. Update the Notion reference after the relevant release is verified and preserve the older screenshot's date.
