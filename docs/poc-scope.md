# TestBraid — Proof of Concept Scope

**Status:** Agreed scope; implementation details pending  
**Date:** 2026-10-18  
**Milestone:** PoC 1 (first practically usable version)  
**Related documents:** [Functional specification](functional-specification.md) · [Preliminary technical research](technical-research.md)

## 1. Goal

The first proof of concept (PoC) should be a **small, genuinely usable TestBraid application**, not just an isolated technical demo.

An author should be able to sign in, create a group and a multimedia self-assessment test, publish it, share a URL, and later edit the test. A learner should be able to open that link without an account, complete the test and see clear evaluation feedback.

In parallel, the PoC must validate the full deployment path on the **selected real Apache/PHP shared hosting environment**, without a database or an application server running Node.js.

The functional requirements in the main specification remain the longer-term product reference. This document defines what is **included in PoC 1**, what is intentionally simplified, and what remains undecided.

## 2. Functional scope

| Area | Included in PoC 1 |
| --- | --- |
| Author access | Sign in/out via PHP sessions; one provisioned author account is sufficient for testing |
| Test administration | Create, list, edit, save, publish, and access a previously saved test |
| Test groups | Create and rename author-defined groups; assign tests to groups |
| Test metadata | Title, introductory description, and test-content language |
| Choice questions | Variable number of choices; single correct answer or multiple correct answers |
| Matching questions | One-to-one pairs between two sets of items |
| Multimedia | Compose prompts, choices and matching items from text, image and video blocks |
| Upload | Upload images and videos; use uploaded files in tests |
| Learner access | Shareable URL for a published test; no learner account |
| Evaluation | Explicit **Evaluate** button; total score; highlight incorrect responses and reveal correct responses/pairings |
| UI languages | English and Czech, for both author and learner interfaces |
| Storage | JSON files for tests/groups and filesystem storage for media; no database |
| Deployment | Built Vue client and PHP backend on standard Apache/PHP hosting |

### 2.1 Authors and authentication

- Provide a minimal author login and logout flow.
- Provision at least one account using a secure, non-public configuration file. Architecturally, additional accounts should be possible without a database.
- All authors may manage all tests; per-test permissions are not needed.
- No self-registration, invitation or user-management screens.
- No simultaneous-edit conflict resolution.

Security is **not** an optional PoC shortcut. Enforce privileges on the PHP API, secure password hashing, safe PHP sessions, CSRF protection on state-changing requests, HTTPS and basic login-attempt throttling. Test that an anonymous request cannot write data or access a draft test.

### 2.2 Author workflow

An author can:

1. Sign in to the administration interface.
2. Create and rename a group (for example, `Lesson 1`).
3. Create a test in the group, with a title, introductory description and content language.
4. Add and remove tasks of either supported type.
5. Compose text/image/video blocks for task prompts and answers, including multiple block types together.
6. Define the correct option(s) or one-to-one pair assignments.
7. Upload files and reference them in tasks.
8. Save the test, reopen it for editing, and publish it.
9. Copy/open its public URL and verify the published result.

**For the PoC:** a simple form-based block editor is sufficient. Text formatting beyond straightforward text blocks is not required. There is no need for a general WYSIWYG editor or a media library with sophisticated asset management.

### 2.3 Choice questions

- One shared task type with single-select and multiple-select modes.
- Each answer option may contain a mixture of text, images and/or video.
- The number of answer options is configurable (subject to basic validity checks).
- The author selects one or several correct options.

**PoC scoring:** A choice question earns **one point only when the exact set of selected answers is correct**. There is no partial credit.

### 2.4 Matching questions

- Two collections of content items, A and B.
- Each A item corresponds to exactly one B item, and vice versa.
- The UI supports assigning the correct counterpart for each A item.
- **PoC interaction:** A simple, keyboard-accessible two-column/select-based method is acceptable. Drag-and-drop is explicitly unnecessary for PoC 1.
- The number of pairs is not fixed in the data model.

**PoC scoring:** A matching question earns **one point only when all pairs are correct**. There is no partial credit.

**Not in PoC:** Extra unmatched items/distractors.

### 2.5 Learner workflow and evaluation

- A published test is accessible through its URL without login.
- The learner reads the test introduction and answers the tasks.
- At the end, an **Evaluate** action displays the total score (e.g. `2/3`).
- Each task visibly distinguishes correct and incorrect responses.
- Choice questions show which options were correct and which incorrect ones the learner selected.
- Matching questions show the correct pairings, emphasizing mismatches.
- The learner's attempts and results are **not persisted on the server**.

**PoC scoring rule:** Each task is worth one point, with all-or-nothing grading. This is a scope simplification, not a commitment for later releases.

**Still to specify:** Retry/change-answer behavior after evaluation and presentation of unanswered questions. For acceptance testing, an unanswered task should not earn a point.

### 2.6 Localization

- English and Czech user interface translations in both areas.
- Include validation messages, navigation, form labels and evaluation feedback.
- The author can declare a test's content language independently of UI language; arbitrary content languages must be supported even without a corresponding UI translation.
- Translation of the **same test's content into multiple languages** is postponed.

## 3. Technical validation objectives

### 3.1 Hosting and deployment

- Deploy the built frontend and PHP backend to the selected shared Apache host.
- No database, persistent Node.js process, Docker service or desktop authoring application is necessary.
- The build can run locally or in CI; the hosting environment only serves the compiled client and runs PHP.
- Verify HTTPS, document root configuration, asset loading, and deep-link navigation to public tests.

### 3.2 Filesystem storage

- Persist test/group configuration in JSON files.
- Test create → save → reload → modify → save again; ensure contents remain correct.
- Prevent partial/corrupt writes where feasible (temporary file, locking, atomic replacement on a compatible filesystem).
- Store private configurations and credentials outside the public document root.
- Use stable IDs and a format that can evolve to new task types and potentially translated tests.
- Verify permissions, directory ownership and backup feasibility on the real host.

### 3.3 Media

- Successfully upload, store, display and play representative image and video files.
- Confirm actual PHP, Apache and hosting limits (size, timeouts, quotas and available disk).
- Restrict accepted formats; validate uploads on the server, assign safe generated filenames and prevent execution of uploaded scripts.
- Published media can be delivered efficiently by Apache where appropriate; access-control implications for media attached to drafts need explicit design.
- **Large/resumable/chunked upload is not required** unless practical hosting tests show it is essential.

### 3.4 Access control and security

- A valid author account can sign in, perform authorized writes and log out.
- Anonymous clients cannot use privileged API endpoints.
- Unpublished tests are not available via public test endpoints.
- Test session handling, CSRF defenses and upload rejection cases.
- Never mistake client-side route hiding or form validation for backend authorization.

## 4. Illustrative acceptance scenario

This scenario covers the complete vertical slice:

1. The author logs in and creates `Lesson 1`.
2. The author creates `Recognizing objects`, with title, description and language.
3. The author adds three tasks:
   - single-answer choice with an image in the prompt;
   - multiple-answer choice;
   - matching text items to videos.
4. The author uploads the image and videos, saves the test and publishes it.
5. A learner follows its URL without logging in.
6. The learner deliberately answers some tasks incorrectly, presses **Evaluate**, and sees a total score plus unambiguous per-question feedback and correct answers.
7. The author reopens the test, edits it, saves, and verifies that the published version reflects the changes.
8. Both author and learner interfaces can be switched between English and Czech.
9. All steps work on the real selected Apache/PHP host without any database.

The example's subjects and item counts are illustrative; they are not fixed application limits.

## 5. Two implementation increments

### PoC-A — Technical foundation

Deliver and deploy:

- a minimal Vue app with English/Czech UI;
- PHP API and working file-backed persistence;
- secure author sign-in/out and protected write endpoints;
- image and video upload/display;
- basic production build/deployment configuration for the actual host.

**PoC-A acceptance gate:** Demonstrate the full stack on the target hosting environment before investing heavily in the question editor.

### PoC-B — Usable end-to-end application

Build on PoC-A:

- test/group administration and metadata;
- the simple block-content editor;
- both question types;
- publication and public URLs;
- learner runner, score and answer-level feedback.

**PoC-B acceptance gate:** Complete the acceptance scenario in Section 4 on the real host.

This is one agreed PoC milestone split into two increments, not two separate products.

## 6. Explicit exclusions from PoC 1

- Question banks and automatic/random test generation.
- Unmatched distractors in matching tasks.
- Translation management for multiple language versions of one test.
- Central learner accounts, stored attempts, statistics or teacher-led grading.
- Partial credit, custom weights or advanced scoring rules.
- Drag-and-drop matching.
- General-purpose rich-text/WYSIWYG editing.
- Sophisticated shared media library, bulk operations and advanced media lifecycle management.
- Test/question import-export and duplication.
- Nested groups, manual ordering and complex content workflows unless agreed later.
- Author self-registration, web-based account management, per-test roles.
- Concurrent author conflict handling.
- A generalized plugin ecosystem.

**Note:** Draft/published state is included because publication and protection of unpublished content are essential to the agreed scenario; more elaborate editorial workflows are excluded.

## 7. Library and architecture decisions

The frontend styling choice above is agreed. The remaining choices require separate decisions, informed by technical research and hosting constraints:

- **Agreed:** Use Vue 3 with **Bootstrap 5 CSS** for layouts and basic styling, without Bootstrap JS manipulating Vue-controlled DOM. No general Vue component suite for the PoC.
- Which upload widget to use, with native PHP handling on the server.
- How to implement the simple content-block editor without excessive dependencies.
- Whether PHP needs a microframework/router or just small native endpoints.
- JSON validation approach on the frontend **and** the backend.
- Accepted image/video formats and practical upload limits.
- Draft media exposure, file deletion and asset-reuse policy.
- Accessible matching interaction and exact evaluation screen behavior.

No dependency is approved merely by being named in preliminary research.

## 8. Definition of done

PoC 1 is complete when:

- The entire scenario in Section 4 works reliably on the selected real webhost.
- The app has no database dependency and requires no Node.js runtime or desktop tool on the host.
- Both English and Czech UI are usable and changing the UI language does not modify test content.
- JSON persistence survives save/reload/edit cycles, and images/videos load and play.
- Author operations are protected server-side; anonymous learners only access published content.
- The two task types produce predictable scores and clear correct/incorrect feedback.
- The repository contains sufficient setup, deployment and basic test instructions to repeat the result.

---

**Next discussion:** Make concrete dependency/library decisions, then define the implementation plan for PoC-A.
