# One feedback pair per page

Owner request: Report a bug and Request a feature appeared twice on certain pages.

The Assistant had both a below-conversation feedback block and the shared footer. Food Trucks retained its older settings-menu feedback pair in addition to the shared footer. Removed those redundant blocks, including Food Trucks' now-unneeded in-chat footer. Each of the six pages retains one pair in its shared footer. Food Trucks' existing feedback analytics attributes are moved to that surviving pair; mailto subjects and body prompts are preserved.

This is a markup-only change, with no changes to answers, evidence, source controls, inputs, or email sending behavior. Browser verification checks all six pages at desktop/mobile sizes, counts hidden as well as visible links, verifies the surviving links' footer placement and mailto targets, and captures the two affected footers. No emails or Assistant questions are sent.

All 12 candidate cases passed, with one feedback pair per page and no page errors. Whitespace checks passed. FEEDBACK_LIVE=1 repeats the same checks against the deployed pages.
