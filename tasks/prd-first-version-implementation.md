# PRD: First Version Implementation

## Introduction

The first version of the medical care management application should deliver the first end-to-end workflow that is genuinely usable for daily care coordination without attempting to complete the entire MVP roadmap.

This version is intended to solve the current fragmented workflow where caregivers track doctor instructions, prescriptions, bookings, and follow-up steps informally across notes, messages, and memory. The first release must give one authenticated caregiver a clear way to create patients, record specialist instructions, convert them into actionable tasks, track prescription progress, create bookings, and mark work as completed.

This PRD is based on the requirements and technical direction documented in:

- `docs/funcional/functional-requirements.md`
- `docs/tecnical/implementation-plan.md`
- `docs/tecnical/mvp-roadmap.md`
- `docs/tecnical/domain-model.md`
- `docs/tecnical/api-design.md`
- `docs/tecnical/database-schema.md`
- `docs/tecnical/ui-flows.md`

## Goals

- Deliver the first usable vertical slice from sign-in to completed care activity.
- Establish the repository, backend, frontend, database, and authentication foundations for later MVP work.
- Support patient-scoped care management for conditions, medical instructions, tasks, prescriptions, and bookings.
- Preserve original doctor notes while allowing structured follow-up tracking.
- Enforce workflow rules for task dependencies, prescription states, and booking linkage.
- Keep first-release scope narrow enough to implement quickly without blocking later milestones.

## User Stories

### US-001: Initialize the application workspace
**Description:** As a developer, I want the backend and frontend projects scaffolded with shared conventions so that implementation can proceed without setup ambiguity.

**Acceptance Criteria:**
- [ ] Create `backend/` and `frontend/` directories following the structure described in `docs/tecnical/implementation-plan.md`
- [ ] Backend starts locally with Bun + ElysiaJS
- [ ] Frontend starts locally with Quasar
- [ ] Shared environment variable conventions are documented
- [ ] Formatting and linting commands are configured and documented

### US-002: Implement authentication and session handling
**Description:** As a caregiver, I want to sign up, sign in, and keep a session so that only authorized users can access patient data.

**Acceptance Criteria:**
- [ ] Email/password sign-up is available
- [ ] Email/password sign-in is available
- [ ] Session-based authentication works through Better Auth
- [ ] Protected routes reject unauthenticated access
- [ ] Current user endpoint returns id, full name, email, and preferred language
- [ ] Frontend shows sign-in and sign-up screens
- [ ] Configured auth, lint, and typecheck commands pass
- [ ] Verify in browser using dev-browser skill

### US-003: Create and manage patients
**Description:** As a caregiver, I want to create and view patient profiles so that I can organize care work by patient.

**Acceptance Criteria:**
- [ ] User can create a patient with full name, optional date of birth, and notes
- [ ] User can list active patients available to the current account
- [ ] User can open a patient overview screen
- [ ] User can archive and restore a patient through soft deletion
- [ ] Patient queries are scoped by authenticated access rules
- [ ] Backend tests cover patient CRUD and authorization checks
- [ ] Frontend lint and typecheck commands pass
- [ ] Verify in browser using dev-browser skill

### US-004: Manage patient conditions
**Description:** As a caregiver, I want to record the patient’s chronic conditions so that instructions and tasks can be organized in the right clinical context.

**Acceptance Criteria:**
- [ ] User can add a condition with name, notes, and active state
- [ ] User can update an existing condition
- [ ] User can deactivate or archive a condition
- [ ] Conditions are shown inside patient context
- [ ] Backend tests cover condition CRUD for authorized users
- [ ] Frontend lint and typecheck commands pass
- [ ] Verify in browser using dev-browser skill

### US-005: Record medical instructions
**Description:** As a caregiver, I want to record specialist instructions and preserve the original wording so that the care plan is not lost or rewritten inaccurately.

**Acceptance Criteria:**
- [ ] User can create an instruction with doctor name, specialty, instruction date, original notes, target timing text, and status
- [ ] Original notes are stored exactly as entered
- [ ] Instruction list supports at least status and date filtering
- [ ] Instruction detail shows original notes and linked tasks
- [ ] Instruction records are patient-scoped and authorization-protected
- [ ] Backend tests cover instruction creation and retrieval
- [ ] Frontend lint and typecheck commands pass
- [ ] Verify in browser using dev-browser skill

### US-006: Create and manage follow-up tasks
**Description:** As a caregiver, I want to create structured tasks from instructions so that I can track what must happen next.

**Acceptance Criteria:**
- [ ] User can create a task linked to a patient and optionally to an instruction and condition
- [ ] Task supports title, description, task type, status, due date, and optional scheduled datetime
- [ ] User can edit task details and change status
- [ ] Task list clearly separates pending, blocked, upcoming, overdue, and completed items
- [ ] Automatic recurrence is disabled by default for all tasks
- [ ] Backend tests cover task CRUD and basic status transitions
- [ ] Frontend lint and typecheck commands pass
- [ ] Verify in browser using dev-browser skill

### US-007: Enforce task dependencies
**Description:** As a caregiver, I want blocked tasks to be identified by prerequisites so that I know the next actionable step in the workflow.

**Acceptance Criteria:**
- [ ] User can create a dependency between two tasks belonging to the same patient
- [ ] Circular dependencies are rejected
- [ ] Cross-patient dependencies are rejected
- [ ] A task with incomplete prerequisites is shown as blocked
- [ ] Backend tests cover dependency validation rules
- [ ] Frontend lint and typecheck commands pass
- [ ] Verify in browser using dev-browser skill

### US-008: Track prescription workflow states
**Description:** As a caregiver, I want to track whether a prescription is needed, requested, available, or collected so that I do not lose time in the GP-driven part of the workflow.

**Acceptance Criteria:**
- [ ] User can create a prescription linked to a patient and optionally to a task
- [ ] Prescription supports type, status, requested date, received date, collected date, issue date, expiration date, and notes
- [ ] The system distinguishes requested, available, and collected as separate states
- [ ] Invalid prescription status transitions are rejected server-side
- [ ] Prescription data is visible in patient context and linked task context
- [ ] Backend tests cover prescription CRUD and workflow validation
- [ ] Frontend lint and typecheck commands pass
- [ ] Verify in browser using dev-browser skill

### US-009: Create and manage bookings
**Description:** As a caregiver, I want to create bookings for exams and visits so that scheduled care activities are tracked with the right dates and linked prerequisites.

**Acceptance Criteria:**
- [ ] User can create a booking linked to a patient and task
- [ ] Booking can optionally link to a prescription
- [ ] Booking supports provider or facility, booking date, appointment datetime, status, and notes
- [ ] Booking statuses support not booked, booking in progress, booked, completed, and cancelled
- [ ] Invalid booking status transitions are rejected server-side
- [ ] Upcoming appointments are visible in patient context
- [ ] Backend tests cover booking CRUD and transition validation
- [ ] Frontend lint and typecheck commands pass
- [ ] Verify in browser using dev-browser skill

### US-010: View patient operational summary
**Description:** As a caregiver, I want a patient overview page so that I can understand the current care state in a few seconds.

**Acceptance Criteria:**
- [ ] Patient overview shows overdue tasks
- [ ] Patient overview shows upcoming appointments
- [ ] Patient overview shows pending prescriptions
- [ ] Patient overview shows active conditions
- [ ] Patient overview exposes quick actions for adding instructions, tasks, prescriptions, and bookings
- [ ] Overview data comes from a dedicated aggregated API response
- [ ] Frontend lint and typecheck commands pass
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

1. `FR-1`: The system must provide a web frontend and backend API with separate `frontend/` and `backend/` application roots.
2. `FR-2`: The system must use Better Auth with email/password authentication and session-based protected routes.
3. `FR-3`: The system must support a current authenticated user profile with full name, email, and preferred language.
4. `FR-4`: The system must allow authorized users to create, list, view, update, archive, and restore patients.
5. `FR-5`: All medical workflow data must be scoped to a single patient.
6. `FR-6`: The system must allow users to create, update, list, and deactivate patient conditions.
7. `FR-7`: The system must allow users to record medical instructions with original free-text notes preserved exactly as entered.
8. `FR-8`: The system must allow instructions to be linked to one or more downstream tasks.
9. `FR-9`: The system must allow users to create, update, and view tasks with task type, status, due date, optional scheduled datetime, and notes.
10. `FR-10`: The system must distinguish at least pending, blocked, scheduled, completed, cancelled, and deferred task states.
11. `FR-11`: The system must allow task dependencies only between tasks belonging to the same patient.
12. `FR-12`: The system must reject circular task dependencies.
13. `FR-13`: The system must show blocked tasks distinctly from actionable tasks.
14. `FR-14`: Automatic recurrence support may exist in the data model, but it must be disabled by default in this version.
15. `FR-15`: The system must allow users to create and update prescriptions for exams, specialist visits, and medications.
16. `FR-16`: The system must distinguish requested, available, and collected prescription states as separate workflow states.
17. `FR-17`: The system must validate prescription state transitions server-side.
18. `FR-18`: The system must allow users to create and update bookings linked to a patient, a task, and optionally a prescription.
19. `FR-19`: The system must validate booking state transitions server-side.
20. `FR-20`: The system must provide a patient overview endpoint and screen summarizing overdue tasks, upcoming appointments, pending prescriptions, and active conditions.
21. `FR-21`: The system must enforce patient access authorization server-side for every patient-scoped route.
22. `FR-22`: The system must use PostgreSQL with UUID identifiers and migration tooling.
23. `FR-23`: The backend should follow a route, validation, service, and repository structure for each module.
24. `FR-24`: The frontend should provide authenticated pages for sign-in, patient list, patient overview, conditions, instructions, tasks, prescriptions, and bookings.
25. `FR-25`: The application must support Italian and English UI labels from the start, even if Italian is the default.

## Non-Goals

- Document upload, storage, and retrieval
- Patient timeline screens and timeline query APIs
- Telegram notifications and reminder jobs
- Audit log viewer and detailed audit history
- Medication management beyond prescription linkage
- OCR, AI extraction, or structured parsing of uploaded documents
- Granular roles and permissions beyond equal-permission authorized users
- Mobile app packaging, offline support, calendar sync, or external healthcare integrations
- Advanced reporting, analytics, or dashboards beyond the operational patient overview
- Full patient sharing UI unless required to support initial authorization design

## Design Considerations

- The UI should be mobile-first and prioritize clarity over density.
- The current patient must always be obvious in the interface.
- Overdue, blocked, and upcoming items should be visually prominent.
- Actions should be available close to the relevant data, especially on the patient overview screen.
- Instruction forms must emphasize preservation of the original doctor notes.
- Task, prescription, and booking screens should favor quick status updates over heavy data entry.

## Technical Considerations

- Backend technology direction: Bun + ElysiaJS modular monolith.
- Frontend technology direction: Quasar with Vue.js.
- Database: PostgreSQL with UUID primary keys and explicit patient-scoped foreign keys.
- Authentication: Better Auth with email/password only.
- Repository layout should follow `docs/tecnical/implementation-plan.md`.
- Core backend modules required in this version: auth, users, patients, patient_users, conditions, instructions, tasks, task_dependencies, prescriptions, bookings.
- Core frontend screens required in this version: sign-in, authenticated shell, patient list, patient overview, condition management, instruction list/form, task list/form, prescription tracker, booking manager.
- Service-layer validation is required for task dependency rules, prescription transitions, and booking transitions.
- Soft deletion is required at least for patients and tasks where already defined by the domain and schema docs.
- Internationalization must be structured from the beginning to avoid rework later.

## Success Metrics

- A developer can clone the repo, start backend, frontend, and database locally, and access the app.
- An authenticated user can complete this workflow without manual database edits: create patient, add condition, add instruction, create task, update prescription state, create booking, and mark work completed.
- All patient-scoped routes reject unauthorized access in automated tests.
- The first end-to-end workflow is covered by at least one automated integration or end-to-end test.
- The patient overview gives enough operational context that a caregiver can identify the next action in a few seconds.

## Open Questions

- Should first-version authorization include patient sharing UI, or only the underlying patient-to-user model needed for future collaboration?
- Should medication CRUD be partially included in v1 because prescriptions can reference medications, or deferred entirely until the next slice?
- Which migration tool will be used for PostgreSQL?
- Will the application own the canonical `users` table, or will Better Auth own it with an application profile extension?
- Which testing stack will be used for backend integration tests and frontend browser verification?
