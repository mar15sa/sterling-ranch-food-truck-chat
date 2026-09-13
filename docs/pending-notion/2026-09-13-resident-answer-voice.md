# Resolved Notion update: resident answer voice gate

- Target page: [How the project works](https://www.notion.so/3dabf909186d8166b507c2a4e1d1aced)
- Affected section: Community Assistant answer composition, validation, and fallback flow
- Status: Synchronized to Notion and re-fetched successfully on September 13, 2026
- Implementation commits: `ed32a04`, `942608a`
- Staging commits: `d951f4a`, `f6358a0`
- Pull request: https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/123
- Staging evidence: `/api/health` returned revision `f6358a0861efb854b075d912c61eb3f3f45425e0` with current rules and community sources. Test-mode Community Assistant requests returned complete source-derived privacy-screen and animal-rule answers with no quality issues.
- Production evidence: `/api/health` returned merge revision `e1bfd7879c43124457ab27d09a98ea8694c623a7`, ready with current rules, current community sources, and zero source failures. A test-mode Community Assistant request returned the complete source-derived privacy-screen answer with no quality issues. The post-merge GitHub workflow also passed: https://github.com/mar15sa/sterling-ranch-food-truck-chat/actions/runs/34767056578
- Synchronized page: https://www.notion.so/3dabf909186d8166b507c2a4e1d1aced
- Final production revision checked: `fcb46c5a2fb5d984f502d83a953b5f9f873c5ab3`
- Privacy-screen follow-up pull request: https://github.com/mar15sa/sterling-ranch-food-truck-chat/pull/122
- Exact-revision deployment check: https://github.com/mar15sa/sterling-ranch-food-truck-chat/actions/runs/34768898498
- The page now includes the plain-language voice gate in the diagram and accessible text, plus the verified privacy-screen example. The updated page was fetched after editing to confirm the new image, text, revision, and evidence links.

## Proposed explanation

After a source-grounded rule answer is composed, every resident-facing field passes through a shared plain-language voice gate. The gate changes presentation only. It does not add resident facts, choose sources, or change a claim's authority. It cleans rulebook fragments, formal measurements, source-author language, repeated claims, and awkward passive prohibitions while preserving the facts supported by the selected current evidence.

The same gate applies when the optional AI rewrite is accepted and when the deterministic fallback is used. An AI rewrite that still contains a flagged voice problem is rejected. The deterministic answer remains available, is cleaned by the shared gate, and must still pass the existing grounding and answer-coverage checks.

Verified official actions also shape the next step. When a source provides a reference document and a submission action, the answer can tell the resident to review the document and then submit the application. The action destination still comes from approved source metadata rather than fixed answer code.

The quality scorer treats source-meta wording, sentence fragments, rulebook measurement language, source-author voice, awkward passive prohibitions, and duplicated claims as failures. This prevents an accurate but unnatural answer from receiving a Good rating.

## Proposed diagram change

Add a box between **Source-grounded answer composition** and **Resident answer contract**:

**Plain-language voice gate**  
Source-independent wording and formatting; preserves claims, citations, and authority.

Show both the accepted AI rewrite and the deterministic source-derived fallback entering this gate. Show a failed voice check sending the AI path back to the deterministic fallback. Keep grounding, coverage, and action-link validation after the voice gate and before the answer is shown to the resident.

## Completed verification

1. Fetched the Notion page before editing and preserved unrelated owner content.
2. Updated the explanation, accessible diagram text, Mermaid flow, and hub image.
3. Added the verified production revision, pull request, and deployment-check links.
4. Fetched the page again and confirmed the updated image, text, revision, and evidence links.
5. Resolved this record so it cannot be mistaken for unfinished work.
