# Findings After V1

## Purpose

This document refines the first post-V1 findings using:

- direct browser verification on the local app;
- repository checks and automated tests;
- comparison with the intended scope in `docs/funcional/` and `docs/tecnical/`;
- the latest Ralph progress recorded in `scripts/ralph/`.

The goal is to separate:

- real defects;
- placeholder sections that look available but are not implemented;
- major MVP capabilities that are still missing.

## Evidence Used

### Browser verification

Verified on March 19, 2026 against the locally running stack:

- frontend on `http://localhost:9000`
- backend on `http://localhost:3000`
- local PostgreSQL via `backend/compose.yaml`

Observed in browser:

- patient list works;
- patient overview works and includes conditions, instructions, prescriptions, tasks, and bookings inside patient context;
- `/app/tasks`, `/app/timeline`, and `/app/settings` are still scaffold pages;
- language switching updates the current page immediately, but the persistence request fails.

### Automated checks

Frontend:

- `bun run typecheck`: passed
- `bun run lint`: passed
- `bun run test`: passed

Backend:

- `bun run typecheck`: passed
- `bun run lint`: passed
- `bun test`: passed when run with access to the Docker-backed PostgreSQL instance

Important nuance:

- the backend app itself runs correctly against Docker Postgres;
- the default sandboxed `bun test` path fails with `ECONNREFUSED 127.0.0.1:5432`;
- the same backend suite passes outside the sandbox, so this is an environment and test-execution gap, not a product logic failure.

### Latest Ralph state

Latest implemented slice from `scripts/ralph/progress.txt` and `scripts/ralph/prd.json`:

- patient overview summary endpoint;
- overview UI;
- conditions;
- instructions;
- tasks and task dependencies;
- prescriptions;
- bookings and facilities.

This means the codebase is ahead of the original short findings list in some areas, especially around tasks.

## Confirmed Defects

### 1. Language persistence is broken

Status:

- confirmed defect

What happens:

- switching language in the top navigation updates the visible UI immediately;
- after reload, the app returns to English;
- browser network logs show `PATCH /api/v1/users/me` returns `401 Unauthorized`.

Impact:

- user language preference is not saved;
- the app does not honor the intended persistent `preferredLanguage` profile setting;
- the current language selector gives the impression of persistence, but only changes in-memory UI state.

Likely root area:

- current-user update flow used by the language switcher, not the general session restore flow;
- `GET /api/v1/auth/session` and `GET /api/v1/users/me` succeed, but `PATCH /api/v1/users/me` fails.

### 2. Global navigation exposes non-implemented sections

Status:

- confirmed UX and product gap

What happens:

- sidebar shows `Tasks`, `Timeline`, and `Settings`;
- those routes open generic scaffold pages instead of real features.

Impact:

- the app appears more complete than it is;
- users can navigate into dead-end sections from the main shell.

Clarification:

- task management is not completely missing;
- tasks exist inside the patient overview and have backend plus store coverage;
- what is missing is the dedicated global task workspace promised by the shell navigation.

### 3. Some pages are only partially localized

Status:

- confirmed content gap

What happens:

- when Italian is selected, many shell and patient-overview labels translate correctly;
- scaffold pages still show hardcoded English titles and descriptions such as `Tasks`, `Timeline`, and `Settings`.

Impact:

- the language experience is inconsistent even before persistence is fixed.

## Incorrect Or Outdated Original Findings

### "Tasks section is unimplemented"

This is only partially true.

Current reality:

- task backend routes exist;
- task dependency validation exists;
- task UI exists inside patient overview;
- task tests exist on frontend;
- what is missing is the standalone `/app/tasks` page and a broader cross-patient task workspace.

So the correct finding is:

- `global task section missing`, not `task functionality completely missing`.

## Major MVP Capabilities Still Missing

These are not small polish items. They are substantial parts of the documented MVP that do not yet exist in code.

### 1. Patient sharing and multi-user collaboration

Required by docs:

- multiple users on the same patient;
- shared visibility;
- sharing management UI.

Current state:

- `patient_users` table exists for authorization;
- no sharing routes or sharing UI are implemented.

Gap:

- the app supports ownership and membership internally, but not actual caregiver collaboration workflows.

### 2. Medications module

Required by docs:

- medication CRUD;
- renewal cadence;
- next GP contact date;
- medication tracker UI.

Current state:

- prescription types include `medication`;
- schema and API docs reference medications;
- no medications module exists in backend or frontend.

Gap:

- the recurring medication renewal cycle is not implemented as its own domain workflow.

### 3. Documents and file management

Required by docs:

- upload and retrieve documents;
- link documents to care entities;
- document list and download flow.

Current state:

- no backend documents module;
- no frontend documents module;
- no storage workflow;
- no upload UI.

Original finding `File managing is missing` is correct, but too narrow.

The fuller finding is:

- document storage, retrieval, attachment, and download are all missing.

### 4. Timeline

Required by docs:

- patient timeline API;
- mixed chronological events;
- timeline-driven create or edit shortcuts.

Current state:

- no backend timeline module;
- no frontend timeline page;
- `/app/timeline` is only a placeholder.

Gap:

- the app still lacks the history-based workflow view that the functional requirements describe as central.

### 5. Notifications

Required by docs:

- Telegram reminders;
- notification rules;
- notification logs;
- shared notification visibility.

Current state:

- no notification module;
- no settings UI for reminders;
- no Telegram integration.

Gap:

- the proactive reminder layer of the MVP is completely absent.

### 6. Settings and user profile management

Required by docs:

- user profile screen;
- persistent language preference;
- settings area.

Current state:

- only the top-nav language selector exists;
- `/app/settings` is a placeholder;
- no real profile management screen exists.

### 7. Care events or completed visit history beyond current domain cards

Required by docs:

- care-event history and timeline context;
- the circular journey from visit to instruction to prescription to booking to visit.

Current state:

- instructions, prescriptions, tasks, and bookings exist;
- there is no explicit care-event domain to capture performed visits or exam outcomes as first-class historical events.

Gap:

- the workflow is still mostly operational state, not a full longitudinal care history.

## End-To-End Workflow Gaps

The current app supports a useful partial workflow:

1. sign up or sign in
2. create patient
3. add or manage conditions
4. add instructions
5. create tasks
6. track prescriptions
7. create bookings

What is still missing for the fuller documented care cycle:

1. record the actual visit or exam result as a first-class event
2. attach reports, prescriptions, or result files
3. manage recurring medication renewals
4. visualize the cycle chronologically in timeline form
5. share the patient with other caregivers from the UI
6. notify collaborators proactively

This is the real reason the current journey still feels unclear: the app covers operational work items, but not yet the full loop of historical events, documents, recurrence, and collaboration.

## Additional Quality Gaps

### 1. Backend integration tests are not self-contained enough

Current problem:

- backend database-backed tests depend on Docker-published PostgreSQL;
- local app runtime can work while the default sandboxed backend test command still fails with `ECONNREFUSED`.

Impact:

- test results do not currently give a dependable green or red signal for development;
- regressions may be harder to trust or diagnose.

This should be treated as an engineering gap even if product functionality appears to work.

### 2. Shell navigation and implemented vertical slices are misaligned

Current problem:

- the most complete functionality lives inside patient overview;
- the main shell advertises broader module pages that do not exist yet.

Impact:

- information architecture suggests a more mature app than the current implementation supports.

## Priority To Reach A More Complete MVP

Recommended order:

1. Fix language persistence and add a real settings or profile page.
2. Replace scaffold shell routes with either real pages or temporary hidden navigation.
3. Implement patient sharing flows so multi-user care coordination becomes real.
4. Implement medications and recurring renewal workflow.
5. Implement documents and file upload or download support.
6. Implement patient timeline with cross-entity event aggregation.
7. Implement notification rules and Telegram reminders.

## Practical Reframing Of The Original Notes

The original notes should now be understood as:

- `Language switching`:
  real defect, confirmed.
- `Tasks section`:
  partially outdated; task functionality exists, but the dedicated shell page does not.
- `Timeline section`:
  truly missing.
- `Settings section`:
  truly missing.
- `File managing`:
  truly missing and should be expanded to full document management.
- `Unclear user journey`:
  valid product concern caused mainly by missing care-event history, documents, medications, sharing, and timeline.

## Bottom Line

The app is no longer a basic scaffold. It already provides a meaningful patient-context workflow for:

- patients;
- conditions;
- instructions;
- tasks;
- prescriptions;
- bookings.

But it is not yet a complete MVP according to the repository docs.

The biggest missing pieces are:

- persistent settings and language updates;
- patient sharing;
- medications;
- documents;
- timeline;
- notifications;
- a fuller event-history model for the circular medical journey.
