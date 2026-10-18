# TestBraid — Functional Specification

**Status:** Working draft (v0.1)  
**Date:** 2026-10-18  
**Project:** TestBraid  
**Primary project language:** English

> This document captures the requirements discussed so far. It distinguishes agreed requirements from suggested defaults and open decisions. It is not an implementation plan, and the scope of the first proof of concept has not yet been selected.

## 1. Purpose and audience

TestBraid is a lightweight, self-hosted application for creating and publishing educational **self-assessment tests**. A small number of **authors** prepares tests; **learners** use them independently to check their understanding. There is no teacher review or centralized grading.

The application should be usable internationally, by authors and learners speaking different languages, and deployable on ordinary shared web hosting.

### Roles

- **Learner:** Opens a test, answers its tasks and requests feedback. No account required.
- **Author / administrator:** Signs in to manage tests, groups and media. Only a few author accounts are expected; initially they have the same privileges.
- **Server administrator:** Provisions accounts and manages hosting operations not exposed through the application.

There is **no requirement to store individual learner results** or register learners.

## 2. Shared content and task model

A test contains a title, an introductory description, a sequence of tasks/questions, and a group/category association.

Each task uses a **shared content representation**: prompts, answer options and matching elements may independently contain text, images, videos, or any combination of them.

Task types must be extendable without restructuring the whole editor, runner or scoring mechanism. Each type should have a distinct identifier and its own editing, rendering, validation and evaluation logic. We do **not** require a generic plugin platform in the first release.

## 3. Task type A — Choice question

**Agreed requirements**

- The prompt can combine text, images and videos.
- The author can define a variable number of answer options, with the same content flexibility.
- Exactly one or several options may be correct.
- Learners select one or more options; the application evaluates their selections.

**Design direction:** One task type with single-select and multiple-select modes, rather than unrelated task types. The precise interaction and appearance remain to be designed.

## 4. Task type B — Matching pairs

**Agreed requirements**

- There are two collections of items, A and B.
- Each item can combine text, images and videos.
- Initially the relationship is **one-to-one**: every A item has exactly one corresponding B item and vice versa.
- The number of pairs is not fixed.

**Low-priority future extension:** Permit extra unmatched items (distractors). This does not need to work initially, but should not be made unnecessarily difficult by the data model.

How learners connect the pairs (drag-and-drop, dropdowns, selection, lines, etc.) is still open.

## 5. Test organization

**Agreed requirements**

- Each test has a **title** and an **introductory description**.
- Tests can be placed into editable named **groups/categories** such as "Lesson 1", "Lesson 2" or another author-chosen name.
- "Lesson" is an example, not a hard-coded entity.
- Each group can contain an arbitrary number of tests.

**Proposed, not yet confirmed**

- Single-level groups, without nesting.
- One group per test.
- Optional manual ordering of groups and tests.
- Draft/published states and shareable test URLs are likely useful, but their details are not yet agreed.

## 6. Taking and evaluating tests

**Agreed requirements**

- A learner completes the tasks in a test and presses an **Evaluate** button at the end.
- The application shows the **overall score**.
- More importantly, it distinguishes **correct and incorrect answers**, shows correct choices and indicates the right pairs in matching tasks, especially when mistakes were made.
- Tests are for self-assessment, not formal teacher-graded examinations.
- No learner identities, attempts or results need to be persisted centrally.

**Open decisions**

- Partial-credit scoring for questions with multiple correct options and partially correct pair assignments.
- How unanswered questions are treated.
- Whether answers can be changed, or tests retried, after evaluation.
- Whether manually authored tasks or answer options should be shuffled.

**Technical direction:** Evaluation can run in the learner's browser. That exposes the answer key to the client, which is acceptable for **self-assessment** but not appropriate for a secure exam system.

## 7. Internationalization and languages

**Agreed requirements**

- Both learner-facing and author-facing interfaces are localized.
- Initial UI locales: **English and Czech**.
- More UI languages can be added without changing application logic.
- Users may select a language; the browser's language may determine the default.
- **Test content language is independent of UI language.** An author using an English UI can write a test in Polish, for example.
- Authors must not be restricted to languages for which an interface translation exists.
- Each test stores a language code, e.g. `cs`, `en`, `pl`.

**Deferred:** One logical test may later support multiple translated versions of titles, descriptions, questions and answers. Stable IDs and language metadata should make this possible, but translation management is **not** part of the initial implementation. In the initial application each test has content in one language.

**Project convention:** GitHub documentation, code identifiers, comments, issues, pull requests and commit messages are primarily **in English**. Discussions with the project owner can be in Czech.

## 8. Author authentication and access control

**Agreed direction**

- A small number of authors, no public sign-up.
- All authors initially have equal privileges across all tests.
- An application sign-in form backed by **PHP sessions**.
- No database for accounts or sessions.
- Simultaneous editing conflict resolution is deferred.

**Security baseline**

- Every privileged API operation must enforce authorization on the backend; hiding a Vue route is not security.
- Passwords are stored only as secure hashes, outside the public web root.
- Require HTTPS, secure session cookies, session ID regeneration on login, logout, CSRF protection for state-changing requests, and login-attempt throttling.
- Only authenticated authors can upload media or modify tests.
- Validate uploads, constrain allowed types and sizes, and generate safe storage names.

We will research maintained reusable authentication and upload components before choosing implementation details.

## 9. Media management

**Agreed requirements**

- Authors can upload images and videos for prompts, answer choices and matching items.
- Media is stored as files on the webhost. Test configuration references those files rather than embedding binary data.
- Published media can be accessed by learners viewing a test.

**Implementation considerations / open decisions**

- Safe media validation, storage names and upload limits.
- Filesystem capacity, PHP upload settings and playable video formats must be tested on the chosen host.
- Backup and reuse of uploaded files should be practical.
- Accepted formats, maximum sizes, media deletion/reuse policies and external hosting are not yet specified.

## 10. Future feature — Question banks and random test generation

**Priority:** Future feature, **explicitly outside the first release**.

Authors may eventually define reusable collections of correct associations belonging to a group (for instance, a video and its correct textual answer, or two matching media/text items). The application could generate random tests from these collections.

Possible generation methods:

1. **Choice tasks:** Select a prompt and correct answer, then suitable incorrect alternatives.
2. **Matching tasks:** Select a number of correct pairs and shuffle their displayed positions.

The generated tasks should use the same runner and evaluation machinery as manually created ones.

**Important constraint:** Different entries in a bank are not automatically wrong answers to a given prompt. Random distractor generation must account for cases with multiple valid associations.

For now, the editor, generator parameters, constraints and storage format remain unspecified. Architecture should leave room for question banks without building them prematurely.

## 11. Technical and deployment constraints

**Agreed direction**

| Area | Direction |
| --- | --- |
| Hosting | Shared hosting with Apache, PHP and filesystem write access |
| Frontend | Vue 3 + TypeScript + Vite (preferred) |
| Backend | Small PHP API; no PHP framework unless justified by research |
| Test configurations | JSON files on disk |
| Media | Files on disk |
| Database | None required |
| Authentication | PHP sessions and securely stored accounts |
| Learner results | Not centrally persisted |
| Deployment | Build frontend assets and deploy them with PHP; no Node.js runtime on the host |

**Operational principles**

- Store private configurations, password hashes and other secrets outside the publicly served directory.
- Provide only appropriate learner-facing data through the public API; writing requires authentication.
- Separate UI, backend/API and persistence so a future database could be introduced if needed.
- Protect JSON writes against partial updates (temporary file, suitable locking and atomic replacement where supported).
- Keep filesystem-based backups straightforward.
- Validate the selected hosting environment's PHP version, permissions, upload sizes, disk limits and Apache configuration.

These are constraints and architectural intentions, **not** a finalized implementation design.

## 12. Project workflow

Source repository: [Radouch/TestBraid](https://github.com/Radouch/TestBraid) (private at the time of this draft). Development is conducted incrementally through GitHub, with changes discussed with the project owner. Project materials should be primarily English.

**Planned sequence**

1. Refine and agree on the functional specification.
2. Select the project name (**TestBraid** selected as the working name).
3. Research existing open-source solutions and maintained, appropriately licensed Vue/PHP components before implementing commonplace functionality anew.
4. Define a **small proof of concept / MVP**, validating both essential interactions and deployment on the target shared webhost.
5. Implement, review, deploy and validate iteratively in the GitHub repository.

The precise scope of the PoC/MVP has **not** yet been decided.

## 13. Requirements and priorities at a glance

| Requirement | Priority / status |
| --- | --- |
| Choice questions, single and multiple correct options | Core — agreed |
| One-to-one matching questions | Core — agreed |
| Text + image + video combinations in all task elements | Core — agreed |
| Extensible task architecture | Architectural — agreed |
| Title and introductory description per test | Core — agreed |
| Editable named groups/categories | Core — agreed |
| Evaluate button, score, correct/incorrect highlighting | Core — agreed |
| Small number of authenticated authors | Core — agreed |
| Anonymous learners, no stored results | Core — agreed |
| English/Czech UI, extendable to further languages | Core — agreed |
| Test language independent of interface language | Core — agreed |
| Readiness for translated variants of a test | Architectural — agreed |
| Unmatched distractor items in matching tasks | Low priority — deferred |
| Question banks and randomized test generation | Future — deferred |
| AI-based question generation | Not requested |
| Concurrent editor conflict handling | Out of scope for now |
| Specific interaction and scoring rules | Open |
| Draft/published status, share URLs, nesting, manual ordering | Proposed / open |

## 14. Outstanding questions for further specification

- How learners browse and discover groups/tests, whether tests are listed publicly or available only by link, and whether unpublished drafts exist.
- Detailed learner flow and UI interactions on desktop and mobile.
- Scoring, including partial and unanswered responses.
- Media attachment, reuse, replacement and deletion.
- Whether authors can add explanations or feedback to answers.
- Duplication, import and export of tests or questions.
- Access restrictions for learners, if any.
- Accessibility and usable keyboard alternatives to drag-and-drop.
- Actual shared-hosting constraints and acceptance criteria for the PoC/MVP.

---

**Next step:** Technical research into reusable libraries and existing solutions, followed by agreement on a deliberately small initial implementation scope.
