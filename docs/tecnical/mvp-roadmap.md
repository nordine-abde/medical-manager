# MVP Roadmap

## 1. Purpose

This document translates the current product, domain, API, and schema decisions into a practical MVP delivery roadmap.

It is based on:

- [functional-requirements.md](/home/abdessamad/apps/medical-manager/functional-requirements.md)
- [tecnical-solutions.md](/home/abdessamad/apps/medical-manager/tecnical-solutions.md)
- [domain-model.md](/home/abdessamad/apps/medical-manager/domain-model.md)
- [api-design.md](/home/abdessamad/apps/medical-manager/api-design.md)
- [database-schema.md](/home/abdessamad/apps/medical-manager/database-schema.md)

The goal is to identify what should be built first, what can wait, and how to sequence work so the application becomes usable early.

## 2. MVP Objective

The MVP should make the application genuinely useful for day-to-day medical workflow management for one family, even if some advanced features remain simplified.

At MVP completion, the application should allow users to:

- sign in securely;
- manage multiple patients;
- share patients with multiple users;
- record specialist instructions;
- create and track tasks with dependencies;
- manage prescriptions and medication renewals;
- manage bookings and facilities;
- upload and retrieve documents;
- view and use a patient timeline;
- receive Telegram reminders for overdue or upcoming items.

## 3. MVP Definition

The MVP is successful when a caregiver can complete this end-to-end workflow:

1. Create a patient.
2. Add one or more chronic conditions.
3. Record a specialist instruction.
4. Convert that instruction into structured tasks.
5. Track prescription request and collection.
6. Book exams or visits.
7. Upload prescription or exam-result documents.
8. Mark events as completed.
9. Review the patient timeline.
10. Receive reminder notifications through Telegram.

## 4. Delivery Principles

- Build vertical slices, not isolated layers only.
- Prioritize workflows over generic admin features.
- Prefer working UI plus minimal backend completeness over speculative extensibility.
- Preserve history and auditability from the start.
- Defer non-essential complexity such as offline support, granular permissions, and structured lab extraction.

## 5. Out Of Scope For MVP

The following should not block MVP delivery:

- mobile app packaging through Capacitor;
- offline support;
- structured blood-test value extraction;
- granular roles and permissions;
- advanced reporting or analytics;
- integrations with external healthcare booking systems;
- OCR or AI parsing of documents;
- calendar sync with external services.

## 6. Recommended Milestones

### Milestone 0: Project Foundation

Goal:

- establish the application skeleton and shared conventions

Scope:

- Bun + ElysiaJS backend project setup
- Quasar frontend project setup
- Better Auth integration baseline
- PostgreSQL connection and migration tooling
- environment configuration
- i18n baseline for Italian and English
- shared coding conventions

Deliverables:

- backend starts locally
- frontend starts locally
- auth flow skeleton exists
- database migrations can run successfully

Acceptance criteria:

- one developer can clone the repo and start backend, frontend, and database locally
- auth and DB connectivity are verified

### Milestone 1: Authentication And User Profile

Goal:

- allow secure access and user identity management

Scope:

- email/password sign-up and sign-in
- session handling
- current-user endpoint
- preferred language setting
- protected route middleware

Deliverables:

- login screen
- user profile screen
- authenticated frontend shell

Acceptance criteria:

- unauthenticated users cannot access patient routes
- authenticated users can view and update their profile and language

### Milestone 2: Patients And Sharing

Goal:

- make the application usable for multi-patient family workflows

Scope:

- create, edit, archive, and restore patients
- list patients
- share patients with additional users
- patient overview base screen

Deliverables:

- patient list page
- patient create/edit forms
- patient sharing management UI

Acceptance criteria:

- a user can create multiple patients
- a patient can be shared with another user
- only authorized users can access patient data

### Milestone 3: Conditions And Medical Instructions

Goal:

- capture the clinical plan in a structured way

Scope:

- create and manage conditions
- create medical instructions
- preserve original doctor notes
- optionally create initial tasks during instruction creation

Deliverables:

- condition management UI
- instruction list and detail UI
- instruction create/edit form

Acceptance criteria:

- a user can record a specialist instruction with original notes
- the instruction is visible on the patient page
- tasks can be generated from the instruction

### Milestone 4: Tasks And Dependencies

Goal:

- support actionable workflow tracking

Scope:

- create, edit, archive, and restore tasks
- task list with overdue, upcoming, and completed states
- dependency creation and validation
- task status transitions
- recurrence settings with auto recurrence disabled by default

Deliverables:

- patient task list UI
- task detail or side panel
- dependency UI
- backend transition validation

Acceptance criteria:

- users can see blocked vs actionable tasks
- users can complete tasks and see status changes
- invalid dependency links are rejected

### Milestone 5: Prescriptions And Medications

Goal:

- cover the GP-driven part of the healthcare workflow

Scope:

- create and manage prescriptions
- distinguish requested, available, and collected states
- medication CRUD
- next GP contact date tracking
- renewal-related task support

Deliverables:

- prescription tracker UI
- medication tracker UI
- prescription status workflow controls

Acceptance criteria:

- a caregiver can track both prescription request and collection
- medication renewals can be planned and monitored
- prescription and medication data appear correctly in patient context

### Milestone 6: Facilities And Bookings

Goal:

- handle appointments and provider context

Scope:

- facility CRUD
- booking CRUD
- booking status transitions
- appointment date/time management
- optional prescription linkage for bookings

Deliverables:

- facility registry UI
- booking form
- appointment list or calendar-style section

Acceptance criteria:

- users can create bookings linked to a task and optionally a prescription
- users can see upcoming appointments clearly
- booking transitions are validated server-side

### Milestone 7: Documents

Goal:

- make the application useful for actual medical paperwork

Scope:

- document upload
- filesystem storage
- metadata persistence
- safe file type validation
- document download
- linking documents to tasks, prescriptions, bookings, care events, or instructions

Deliverables:

- document upload UI
- document library UI
- file download endpoint

Acceptance criteria:

- common safe file types can be uploaded and downloaded
- dangerous file types are blocked
- users can find documents in patient context

### Milestone 8: Care Events And History

Goal:

- represent completed medical actions and preserve history

Scope:

- care event creation and editing
- link care events to bookings, tasks, and facilities
- attach result notes and documents
- history display

Deliverables:

- care event entry form
- completed visits/exams section

Acceptance criteria:

- users can mark real-world medical events as completed history
- exam or visit outcomes can be documented with notes and files

### Milestone 9: Timeline

Goal:

- provide the visual chronological view that ties the workflow together

Scope:

- patient timeline API
- timeline UI
- filters by event type and period
- quick-add and edit entry points from timeline context
- timeline rendering for instructions, tasks, prescriptions, bookings, care events, documents, and medication renewal events

Deliverables:

- patient timeline page or tab
- backend timeline query or projection logic
- timeline item action handling

Acceptance criteria:

- users can view a chronological patient history
- users can open and edit linked items from the timeline
- users can create supported items from the timeline on a selected date

### Milestone 10: Notifications

Goal:

- reduce missed or late actions

Scope:

- notification rules per patient
- Telegram chat ID configuration
- cron-based reminder jobs
- overdue task reminders
- upcoming booking reminders
- notification log storage

Deliverables:

- notification settings UI
- Telegram integration service
- scheduled reminder job

Acceptance criteria:

- users can configure Telegram settings per patient
- overdue and upcoming reminders are sent once according to rule logic
- sent or failed messages are visible in logs

### Milestone 11: Audit Trail

Goal:

- preserve operational accountability

Scope:

- audit logs for task changes
- audit logs for prescription changes
- audit logs for booking changes
- audit log viewer

Deliverables:

- audit write logic in services
- audit list endpoint
- audit section in patient UI

Acceptance criteria:

- changes record who changed what and when
- before/after payloads are persisted for key entities

## 7. Suggested Release Strategy

A practical release strategy is:

### Release A: Internal Usable Core

Includes:

- Milestones 0 to 5

Outcome:

- usable for patient, instruction, task, prescription, and medication tracking

### Release B: Operational Workflow Completion

Includes:

- Milestones 6 to 8

Outcome:

- usable for bookings, facilities, completed events, and documents

### Release C: Visibility And Automation

Includes:

- Milestones 9 to 11

Outcome:

- usable with timeline, Telegram reminders, and auditability

## 8. Frontend Priority Screens

The highest-value frontend screens for MVP are:

1. sign-in
2. patient list
3. patient overview
4. instruction create/view
5. task list and task editor
6. prescription tracker
7. medication tracker
8. booking manager
9. document library
10. timeline
11. notification settings

## 9. Backend Priority Modules

The highest-value backend modules for MVP are:

1. auth and session integration
2. patients and patient-user access
3. instructions
4. tasks and dependencies
5. prescriptions
6. medications
7. facilities
8. bookings
9. documents
10. care events
11. timeline
12. notifications
13. audit

## 10. Testing Priorities

The minimum high-value test areas are:

### 10.1 Authorization

- patient access is denied without `PatientUser` membership
- shared patients are visible only to allowed users

### 10.2 Task Logic

- invalid status transitions are rejected
- dependency rules are enforced
- auto recurrence is disabled by default

### 10.3 Prescription Logic

- requested, available, and collected states remain distinct
- invalid transitions are rejected

### 10.4 Booking Logic

- booking cannot reference cross-patient entities
- appointment data persists correctly

### 10.5 Document Logic

- blocked file types are rejected
- authorized users can download only their patient documents

### 10.6 Timeline Logic

- timeline returns mixed events in correct chronological order
- timeline actions resolve to the correct underlying entity changes

### 10.7 Notification Logic

- overdue and upcoming reminders are generated correctly
- duplicate notification spam is prevented

## 11. Risks And Mitigations

### 11.1 Auth Integration Ambiguity

Risk:

- Better Auth ownership of the user table may complicate early schema design

Mitigation:

- decide user/auth table strategy before first migration is finalized

### 11.2 Timeline Complexity

Risk:

- timeline can become expensive or inconsistent if modeled too late

Mitigation:

- keep timeline as a projection from the start and reuse API/domain definitions already written

### 11.3 Over-Building Early

Risk:

- too much infrastructure before usable workflow exists

Mitigation:

- stop each milestone with a working vertical slice

### 11.4 Notification Noise

Risk:

- Telegram reminders can become spammy and get ignored

Mitigation:

- store notification logs and keep rules simple in v1

## 12. Definition Of MVP Done

The MVP should be considered done when:

1. At least two authorized users can collaborate on the same patient.
2. A full care workflow can be tracked from instruction to prescription to booking to completion.
3. Documents can be uploaded, stored, and retrieved safely.
4. The patient timeline is usable for both viewing and initiating edits.
5. Telegram reminders work reliably for overdue tasks and upcoming events.
6. Core operational changes are auditable.
7. The app is stable enough for real daily use by the target family workflow.

## 13. Open Delivery Questions

The roadmap is ready to execute, but these planning choices may still be refined:

1. Should Release A already include basic documents, or should documents remain in Release B?
2. Should timeline arrive before care events if a minimal event feed is enough initially?
3. Should audit logs be implemented together with each milestone, or as a dedicated later milestone as currently planned?
