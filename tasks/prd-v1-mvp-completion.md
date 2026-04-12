# PRD: V1 MVP Completion

## Introduction

This PRD defines the work required to move the current v1 codebase from a partially usable patient workflow to the complete MVP described in the repository documentation.

The current application already supports authentication, patients, conditions, instructions, tasks, prescriptions, bookings, and a patient overview. It does not yet satisfy the documented MVP because important workflow areas are still missing or incomplete: persistent user settings, patient sharing, medications, documents, timeline, notifications, and a full end-to-end care history view.

This PRD is based on:

- `docs/testing-and-fixing/01_findings_after_v1.md`
- `docs/funcional/functional-requirements.md`
- `docs/tecnical/mvp-roadmap.md`
- `docs/tecnical/implementation-plan.md`
- `docs/tecnical/ui-flows.md`
- `docs/tecnical/api-design.md`
- `docs/tecnical/domain-model.md`
- `docs/tecnical/database-schema.md`
- `docs/tecnical/tecnical-overview.md`

Assumptions used to avoid blocking on clarification:

- the target is the documented MVP, not a reduced interim slice;
- all authorized users keep the same permissions in v1;
- Telegram is the only notification channel required for MVP;
- filesystem-backed document storage remains acceptable for MVP;
- the existing implemented modules remain the baseline and should be extended, not redesigned.

## Goals

- Deliver the documented MVP end-to-end workflow without manual database intervention.
- Close the confirmed defects that block basic product trust, especially language persistence and misleading placeholder navigation.
- Make multi-user family collaboration real through patient sharing and shared visibility.
- Complete the GP-driven care workflow with medications, renewal tracking, and reminders.
- Add documents, timeline, and care-history capabilities so the app supports both operational tracking and longitudinal review.
- Provide a settings area and notification infrastructure that make the application usable day to day.
- Keep the implementation aligned with the existing modular backend and frontend architecture.

## User Stories

### US-001: Fix persistent user profile updates
**Description:** As a user, I want my profile updates, especially preferred language, to persist so that the application behaves consistently after reload.

**Acceptance Criteria:**
- [ ] `PATCH /api/v1/users/me` succeeds for an authenticated user updating `fullName` and `preferredLanguage`
- [ ] Reloading the app preserves the saved preferred language
- [ ] The restored session uses the persisted preferred language on initial app load
- [ ] Unauthorized profile updates return a consistent error response
- [ ] Backend typecheck, lint, and test pass
- [ ] Frontend typecheck, lint, and test pass
- [ ] Verify in browser using dev-browser skill

### US-002: Deliver a real settings and profile area
**Description:** As a user, I want a dedicated settings screen so that I can manage my profile instead of relying on partial shell controls.

**Acceptance Criteria:**
- [ ] `/app/settings` is replaced with a real settings page
- [ ] Settings page shows current user full name, email, and preferred language
- [ ] User can update supported editable fields from the settings page
- [ ] Save feedback and validation errors are visible in the UI
- [ ] Hardcoded placeholder copy is removed from the route
- [ ] Frontend typecheck, lint, and test pass
- [ ] Verify in browser using dev-browser skill

### US-003: Align shell navigation with implemented functionality
**Description:** As a user, I want the main navigation to expose only real features or real MVP pages so that the shell does not lead me into dead ends.

**Acceptance Criteria:**
- [ ] Every visible primary navigation item opens an implemented page with real data or actions
- [ ] Placeholder routes are either implemented or removed from visible navigation
- [ ] Navigation labels are localized in both Italian and English
- [ ] Navigation still preserves access to patients, patient overview, tasks, timeline, documents, and settings as required by the MVP UI flows
- [ ] Frontend typecheck, lint, and test pass
- [ ] Verify in browser using dev-browser skill

### US-004: Implement patient sharing management
**Description:** As a caregiver, I want to share a patient with another user so that family members can collaborate on the same care workflow.

**Acceptance Criteria:**
- [ ] Backend implements `GET /api/v1/patients/:patientId/users`
- [ ] Backend implements `POST /api/v1/patients/:patientId/users`
- [ ] Backend implements `DELETE /api/v1/patients/:patientId/users/:userId`
- [ ] Sharing rules prevent duplicate patient-user links
- [ ] Removing access immediately blocks future patient access for that user
- [ ] Patient sharing UI lists linked users and supports add and remove flows
- [ ] Sharing actions are authorization-protected and audited in tests
- [ ] Backend typecheck, lint, and test pass
- [ ] Frontend typecheck, lint, and test pass
- [ ] Verify in browser using dev-browser skill

### US-005: Provide a global task workspace
**Description:** As a caregiver, I want a cross-patient task view so that I can see what needs attention across the whole family workflow.

**Acceptance Criteria:**
- [ ] `/app/tasks` is replaced with a real task workspace
- [ ] Workspace shows tasks grouped or filterable by patient
- [ ] Workspace supports at least pending, blocked, overdue, upcoming, and completed views
- [ ] User can open the related patient and source record from a task row or card
- [ ] Task status updates stay consistent with patient-scoped task logic
- [ ] Frontend typecheck, lint, and test pass
- [ ] Verify in browser using dev-browser skill

### US-006: Implement medications and renewal tracking
**Description:** As a caregiver, I want to manage recurring medications and their renewal cadence so that I know when to contact the GP before a medication runs out.

**Acceptance Criteria:**
- [ ] Backend adds medication CRUD for a patient
- [ ] Medication supports name, related condition, prescribing doctor when known, dosage, quantity, renewal cadence, next GP contact date, notes, and related prescriptions
- [ ] Frontend adds medication list and create or edit flows in patient context
- [ ] User can view active medications from patient overview
- [ ] Medication records can link to prescription records without breaking existing prescription workflows
- [ ] Backend tests cover medication CRUD and patient authorization
- [ ] Frontend typecheck, lint, and test pass
- [ ] Verify in browser using dev-browser skill

### US-007: Support medication renewal planning
**Description:** As a caregiver, I want medication renewals to create actionable reminders and tasks so that recurring treatment is not missed.

**Acceptance Criteria:**
- [ ] A medication can define whether renewal tracking is active
- [ ] The system stores the next GP contact date for renewal planning
- [ ] User can create or update renewal-related tasks from medication context
- [ ] Renewal workflow is visible in patient context and patient overview
- [ ] Automatic recurrence remains configurable and disabled by default unless explicitly enabled
- [ ] Backend tests cover renewal-related validation
- [ ] Frontend typecheck, lint, and test pass
- [ ] Verify in browser using dev-browser skill

### US-008: Implement documents upload and retrieval
**Description:** As a caregiver, I want to upload and retrieve medical documents so that prescriptions, reports, and results are stored with the patient history.

**Acceptance Criteria:**
- [ ] Backend implements document upload, list, metadata retrieval, and secure download endpoints
- [ ] Supported document metadata includes patient, type, title or filename, upload timestamp, uploader, and related entity links
- [ ] Files are stored outside compiled output with validated allowed file types
- [ ] Unauthorized users cannot list or download another patient's documents
- [ ] Frontend adds patient-context document list and upload flow
- [ ] User can attach a document to at least an instruction, prescription, booking, care event, medication, or patient record
- [ ] Backend tests cover upload authorization and metadata persistence
- [ ] Frontend typecheck, lint, and test pass
- [ ] Verify in browser using dev-browser skill

### US-009: Add instruction and workflow document linking
**Description:** As a caregiver, I want documents linked to the relevant medical workflow records so that supporting paperwork is visible where it is needed.

**Acceptance Criteria:**
- [ ] Instruction detail shows linked documents
- [ ] Prescription and booking views show linked documents when present
- [ ] User can add a document from a relevant entity flow without leaving patient context
- [ ] Linked documents appear in the patient document area and preserve related entity references
- [ ] Frontend typecheck, lint, and test pass
- [ ] Verify in browser using dev-browser skill

### US-010: Implement care events as first-class history items
**Description:** As a caregiver, I want to record completed visits, exams, and treatments as explicit care events so that the app captures the real clinical history instead of only pending operational work.

**Acceptance Criteria:**
- [ ] Backend adds care-event CRUD scoped to a patient
- [ ] Care event supports event type, linked task or booking when relevant, performed date, provider or facility, notes, and optional related documents
- [ ] Frontend adds create and view flows for care events in patient context
- [ ] Completing an exam or specialist visit can be reflected as a care event without losing the original task or booking history
- [ ] Backend tests cover care-event CRUD and authorization
- [ ] Frontend typecheck, lint, and test pass
- [ ] Verify in browser using dev-browser skill

### US-011: Implement patient timeline aggregation
**Description:** As a caregiver, I want a patient timeline so that I can review instructions, tasks, prescriptions, bookings, care events, medications, and documents chronologically.

**Acceptance Criteria:**
- [ ] Backend implements a patient timeline endpoint that aggregates chronological events from core workflow entities
- [ ] Timeline supports filtering by event type and date range
- [ ] Timeline includes at least instructions, task changes, prescription changes, bookings, care events, document uploads, and medication renewal items
- [ ] Frontend replaces the patient timeline placeholder with a real timeline page
- [ ] Timeline items can navigate to the related source entity
- [ ] Backend tests cover event aggregation ordering and authorization
- [ ] Frontend typecheck, lint, and test pass
- [ ] Verify in browser using dev-browser skill

### US-012: Implement a global timeline workspace
**Description:** As a caregiver, I want a cross-patient timeline view so that I can review the family care history and recent activity from one place.

**Acceptance Criteria:**
- [ ] `/app/timeline` is replaced with a real timeline workspace
- [ ] Workspace supports filtering by patient and event type
- [ ] User can open the related patient and entity from a timeline item
- [ ] The page is localized and uses real API data
- [ ] Frontend typecheck, lint, and test pass
- [ ] Verify in browser using dev-browser skill

### US-013: Implement Telegram notification settings and delivery
**Description:** As a caregiver, I want Telegram reminders for upcoming and overdue care items so that the app warns me proactively instead of only storing data.

**Acceptance Criteria:**
- [ ] Backend adds notification settings and delivery records required for Telegram reminders
- [ ] Patient-specific Telegram chat configuration can be stored securely
- [ ] Reminder generation covers at least overdue tasks, upcoming appointments, and medication renewal contact dates
- [ ] Notification records track pending, sent, and failed states
- [ ] Frontend adds notification-related settings where required by the MVP
- [ ] Backend tests cover notification scheduling decisions and authorization
- [ ] Frontend typecheck, lint, and test pass
- [ ] Verify in browser using dev-browser skill

### US-014: Add background jobs for reminders and recurring workflows
**Description:** As a developer, I want scheduled jobs for reminders and recurring workflow generation so that time-based care logic runs without manual triggering.

**Acceptance Criteria:**
- [ ] Scheduled job infrastructure exists inside the application deployment
- [ ] Reminder job scans for upcoming and overdue items and creates notification records
- [ ] Recurrence job respects the rule that automatic recurrence is disabled by default
- [ ] Jobs are idempotent enough to avoid duplicate records for the same run window
- [ ] Backend tests cover at least one reminder generation path and one recurrence path
- [ ] Backend typecheck, lint, and test pass

### US-015: Localize remaining MVP screens and flows
**Description:** As a user, I want the MVP screens to behave consistently in Italian and English so that the application is usable in either supported language.

**Acceptance Criteria:**
- [ ] All MVP shell pages and patient-context pages use translation keys instead of hardcoded English UI copy
- [ ] Validation, empty states, headers, and key action labels are localized for Italian and English
- [ ] Language selection works from persisted profile data on reload
- [ ] Frontend typecheck, lint, and test pass
- [ ] Verify in browser using dev-browser skill

### US-016: Make backend integration tests self-contained
**Description:** As a developer, I want backend integration tests to run reliably in the normal development environment so that green tests are a trustworthy signal.

**Acceptance Criteria:**
- [ ] Document and implement one supported backend test path that does not depend on hidden manual setup
- [ ] Database-backed tests bootstrap their required state consistently
- [ ] The repository documents how to run backend tests successfully for this project
- [ ] Backend `bun test` is reliable in the intended local workflow
- [ ] Backend typecheck and lint still pass

### US-017: Validate the complete documented MVP journey
**Description:** As a product owner, I want one verified end-to-end MVP workflow so that the application is proven ready for practical day-to-day use.

**Acceptance Criteria:**
- [ ] A user can sign in, create a patient, add conditions, record an instruction, create tasks, track a prescription, manage a medication renewal, create a booking, upload a document, record a care event, review the timeline, and receive a reminder without manual database edits
- [ ] The full journey is covered by at least one automated integration or end-to-end test plus one manual browser verification flow
- [ ] Documentation reflects the delivered MVP behavior and no longer claims placeholder functionality as complete
- [ ] Backend typecheck, lint, and test pass
- [ ] Frontend typecheck, lint, and test pass
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

1. `FR-1`: The system must persist authenticated user profile updates, including preferred language.
2. `FR-2`: The system must provide a real settings or profile screen for the current user.
3. `FR-3`: The system must not expose placeholder shell navigation as completed functionality.
4. `FR-4`: The system must allow authorized users to list, add, and remove shared patient access through `patient_users`.
5. `FR-5`: All patient sharing actions must be enforced server-side with patient-scoped authorization.
6. `FR-6`: The system must provide a global task workspace across accessible patients.
7. `FR-7`: The system must allow authorized users to create, edit, list, and view medications for a patient.
8. `FR-8`: Each medication must support recurrence or renewal cadence and next GP contact date tracking.
9. `FR-9`: Medication workflows must integrate with prescription records and renewal-related tasks.
10. `FR-10`: The system must allow authorized users to upload, list, retrieve, and download patient documents securely.
11. `FR-11`: Documents must support linkage to relevant workflow entities such as instructions, prescriptions, bookings, care events, medications, and patients.
12. `FR-12`: The system must validate document file types and protect document access by patient authorization.
13. `FR-13`: The system must allow authorized users to create and view care events representing completed visits, exams, treatments, or follow-up events.
14. `FR-14`: The system must provide a patient timeline API that aggregates chronological events from operational and historical entities.
15. `FR-15`: The patient timeline must support filtering by event type and date range.
16. `FR-16`: The system must provide a global timeline page that can be filtered by patient and event type.
17. `FR-17`: The system must support Telegram as the MVP notification channel.
18. `FR-18`: The system must create reminders for overdue tasks, upcoming appointments, and medication renewal contact dates.
19. `FR-19`: Notification records must track at least pending, sent, and failed states.
20. `FR-20`: Time-based reminder generation and optional recurring workflow generation must run through scheduled jobs or workers.
21. `FR-21`: Automatic recurrence must remain disabled by default and only run when explicitly enabled.
22. `FR-22`: All visible MVP pages must be localized in Italian and English.
23. `FR-23`: Existing modules for patients, conditions, instructions, tasks, prescriptions, and bookings must remain functional while new MVP modules are added.
24. `FR-24`: The complete MVP workflow must be executable from the UI without manual database edits.
25. `FR-25`: Backend and frontend verification commands must remain documented and pass for delivered MVP work.

## Non-Goals

- Granular per-user permissions beyond equal access for authorized collaborators
- OCR, AI parsing, or structured extraction from uploaded documents
- Integration with external hospital booking systems or calendars
- Mobile packaging through Capacitor
- Offline-first behavior
- Advanced analytics or reporting dashboards
- Multi-channel notifications beyond Telegram
- Fine-grained audit diff viewers unless needed to support timeline or core trust requirements

## Design Considerations

- The shell should clearly distinguish global views from patient-context views.
- The current patient must remain obvious across tasks, documents, timeline, medications, and bookings.
- The patient overview should summarize overdue work, upcoming appointments, pending prescriptions, active medications, and recent timeline items.
- Timeline and task views should complement each other: tasks show what to do next, timeline shows what happened.
- Document upload and linking should be available close to the entity where the document is needed.
- Sharing, settings, and notification flows should favor simple management over heavy administration UI.
- Mobile-first behavior remains important because caregivers may perform quick updates on a phone.

## Technical Considerations

- Backend architecture should continue to use thin route handlers with validation, service-layer business rules, and repository-layer data access.
- New backend modules likely required: `patient-users`, `medications`, `documents`, `care-events`, `timeline`, `notifications`, and background job support.
- New frontend modules likely required: `settings`, `medications`, `documents`, `timeline`, `notifications`, and patient sharing management.
- Timeline should be implemented as a projection over source entities, not as the only source of truth.
- Document storage should use filesystem-backed storage with database metadata, as already described in the technical docs.
- Notification delivery should isolate scheduling, persistence, and Telegram transport concerns.
- Authorization checks must be applied to every patient-scoped route, especially new file and sharing endpoints.
- The testing approach should include automated checks for authorization, state transitions, aggregation logic, and at least one full workflow path.

## Success Metrics

- A caregiver can complete the documented MVP journey from patient creation through reminder receipt without manual database changes.
- A second authorized user can access a shared patient and see the same operational and historical data permitted by the MVP.
- Global shell pages no longer route to placeholder content.
- Preferred language persists across reloads and is reflected consistently across MVP pages.
- Documents, medications, timeline, and notifications are all usable in the real app, not only represented in docs or schema.
- Backend and frontend test suites provide a trustworthy green signal for the supported local development workflow.

## Open Questions

- Should patient sharing add users only by exact existing account email, or should MVP also support invitation flows?
- Should document storage support only local filesystem for MVP, or should the code abstract storage enough to swap later?
- Should the global timeline include all patient events by default, or start filtered to recent events only for performance and readability?
- Should reminder delivery be configurable per patient, per user, or both in MVP?
- How much care-event detail is required for MVP beyond event type, performed date, notes, provider or facility, and linked documents?
