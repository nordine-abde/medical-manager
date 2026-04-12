# Implementation Plan

## 1. Purpose

This document defines the practical implementation plan for building the MVP.

It turns the roadmap into coding workstreams, repository structure, and execution order.

It is based on:

- [mvp-roadmap.md](/home/abdessamad/apps/medical-manager/mvp-roadmap.md)
- [api-design.md](/home/abdessamad/apps/medical-manager/api-design.md)
- [database-schema.md](/home/abdessamad/apps/medical-manager/database-schema.md)
- [domain-model.md](/home/abdessamad/apps/medical-manager/domain-model.md)

## 2. Implementation Goal

The implementation should prioritize getting a real end-to-end workflow running quickly, then layering in timeline, notifications, and auditability without destabilizing the core.

The first fully usable slice should be:

1. sign in
2. create patient
3. add condition
4. add instruction
5. create tasks
6. manage prescription states
7. create booking
8. mark completion

## 3. Recommended Repository Structure

Recommended top-level structure:

```text
/
  backend/
  frontend/
  docs/
```

If you prefer a flatter repository, the documentation files can stay at root, but code should still be split clearly between frontend and backend.

Recommended backend structure:

```text
backend/
  src/
    app.ts
    server.ts
    config/
    db/
      migrations/
      schema/
      repositories/
    auth/
    modules/
      users/
      patients/
      conditions/
      instructions/
      tasks/
      prescriptions/
      medications/
      facilities/
      bookings/
      care-events/
      documents/
      timeline/
      notifications/
      audit/
    shared/
      types/
      errors/
      utils/
      middleware/
```

Recommended frontend structure:

```text
frontend/
  src/
    boot/
    router/
    layouts/
    pages/
    components/
    stores/
    modules/
      auth/
      patients/
      conditions/
      instructions/
      tasks/
      prescriptions/
      medications/
      bookings/
      facilities/
      documents/
      timeline/
      notifications/
      audit/
    i18n/
    utils/
```

## 4. Technical Decisions To Lock First

These should be finalized before major implementation begins:

1. Better Auth user-table ownership model
2. migration tool choice
3. ORM or query-builder choice
4. local development database strategy
5. file upload directory strategy

Recommended default direction:

- PostgreSQL migrations with a clear SQL-first or schema-first tool
- one canonical backend service per domain module
- filesystem storage rooted outside compiled build output

## 5. Execution Order

### Phase 0: Workspace Setup

Tasks:

- create `backend/`
- create `frontend/`
- move or copy docs into `docs/` later if desired
- initialize Bun backend project
- initialize Quasar frontend project
- configure shared `.env` conventions
- add formatting and linting

Done when:

- backend and frontend both start locally
- environment variables are documented

### Phase 1: Backend Foundation

Tasks:

- install ElysiaJS
- integrate Better Auth
- set up PostgreSQL connection
- add migration tooling
- add base Elysia app and route registration
- add auth guard middleware
- add centralized error handling

Done when:

- auth session route works
- protected route middleware works
- migrations can create initial tables

### Phase 2: Database And Core Models

Tasks:

- implement initial schema migrations
- create base repositories for:
  - users
  - patients
  - patient_users
  - conditions
  - medical_instructions
  - tasks
- add `updated_at` handling
- add soft-delete query conventions

Done when:

- core CRUD works for patients, conditions, instructions, and tasks

### Phase 3: Frontend Foundation

Tasks:

- configure Quasar router
- configure auth boot logic
- create main authenticated layout
- create navigation shell
- add Pinia or equivalent state management if desired
- add i18n support for Italian and English

Done when:

- authenticated shell loads
- language switching works
- navigation is in place for major modules

### Phase 4: Vertical Slice 1

Goal:

- patient, condition, instruction, and task workflow

Backend tasks:

- implement patient routes
- implement condition routes
- implement instruction routes
- implement task routes
- implement task dependency routes
- implement validation for task transitions

Frontend tasks:

- patient list page
- patient create/edit dialog or page
- condition management section
- instruction create/edit page
- task list page
- task create/edit form

Done when:

- a user can go from sign-in to a patient with real tasks

### Phase 5: Vertical Slice 2

Goal:

- prescriptions and medications

Backend tasks:

- implement prescription routes
- implement medication routes
- implement prescription state transition validation
- implement GP contact date handling

Frontend tasks:

- prescription tracker
- medication tracker
- quick status update actions

Done when:

- medication and prescription workflows are practically usable

### Phase 6: Vertical Slice 3

Goal:

- facilities, bookings, and care events

Backend tasks:

- implement facility routes
- implement booking routes
- implement booking transitions
- implement care-event routes

Frontend tasks:

- facility list and form
- booking create/edit flow
- appointment list section
- care-event create/edit flow

Done when:

- exam and visit workflows can be tracked end to end

### Phase 7: Vertical Slice 4

Goal:

- documents

Backend tasks:

- multipart upload handling
- file type validation
- file storage service
- document routes
- secure download handling

Frontend tasks:

- document upload widget
- document library
- entity-linked document sections

Done when:

- users can upload and retrieve prescriptions and reports safely

### Phase 8: Vertical Slice 5

Goal:

- timeline

Backend tasks:

- implement timeline query service
- expose timeline endpoint
- implement timeline create-action support if retained

Frontend tasks:

- timeline screen
- timeline filters
- timeline quick actions
- timeline item edit navigation

Done when:

- patient history is visually navigable and actionable

### Phase 9: Vertical Slice 6

Goal:

- notifications and audit

Backend tasks:

- notification rules routes
- Telegram client integration
- cron-based reminder job
- notification log storage
- audit log generation in service layer
- audit log routes

Frontend tasks:

- notification settings UI
- audit log viewer

Done when:

- reminders send correctly and operational changes are traceable

## 6. Backend Build Order By Module

Recommended backend module order:

1. auth
2. users
3. patients
4. patient_users
5. conditions
6. instructions
7. tasks
8. task_dependencies
9. prescriptions
10. medications
11. facilities
12. bookings
13. care_events
14. documents
15. timeline
16. notifications
17. audit

## 7. Frontend Build Order By Screen

Recommended frontend screen order:

1. sign-in
2. authenticated layout
3. patient list
4. patient overview
5. condition section
6. instruction form and list
7. task list and task editor
8. prescription tracker
9. medication tracker
10. booking manager
11. document library
12. timeline
13. notification settings
14. audit viewer

## 8. Suggested Service Layer Pattern

Each backend module should have:

- route layer
- validation schema layer
- service layer
- repository layer

Recommended service naming examples:

- `PatientService`
- `InstructionService`
- `TaskService`
- `TaskDependencyService`
- `PrescriptionService`
- `BookingService`
- `TimelineService`
- `NotificationService`
- `AuditService`

Service responsibilities:

- enforce domain rules
- coordinate repositories
- emit audit entries where needed
- avoid business logic in route handlers

## 9. Suggested Frontend Module Pattern

Each frontend domain module should contain:

- API client methods
- state store
- reusable components
- page-level containers
- form schemas if used

Recommended examples:

- `modules/patients/api.ts`
- `modules/patients/store.ts`
- `modules/patients/components/PatientForm.vue`
- `modules/patients/pages/PatientListPage.vue`

## 10. First Sprint Candidate

A good first sprint is:

1. initialize backend and frontend projects
2. set up Better Auth
3. set up PostgreSQL and migrations
4. implement patients CRUD
5. implement patient list and patient form
6. implement authenticated layout

This gives a real vertical slice quickly and reduces setup ambiguity.

## 11. Second Sprint Candidate

A good second sprint is:

1. conditions CRUD
2. medical instructions CRUD
3. task CRUD
4. task list UI
5. task status transitions
6. patient overview summary

This makes the app minimally useful for the real medical workflow.

## 12. Cross-Cutting Concerns

These should be addressed from early implementation, not postponed too far:

### 12.1 Authorization

- always scope queries by patient membership

### 12.2 Soft Delete Handling

- define repository helpers so archived entities are consistently filtered

### 12.3 Audit Hooks

- add service-layer hooks early for tasks, prescriptions, and bookings

### 12.4 Internationalization

- keep all frontend labels in i18n files from the beginning

### 12.5 File Safety

- centralize MIME type and extension allowlists

## 13. Suggested Definition Of Done Per Feature

A feature should be considered done only when:

1. schema or migration changes are added if needed
2. backend route exists
3. backend validation exists
4. authorization is enforced
5. frontend UI exists
6. error states are handled
7. at least basic tests exist
8. docs are updated if behavior changed

## 14. Testing Strategy

Recommended test layers:

- unit tests for domain services
- integration tests for route handlers and DB logic
- minimal frontend component tests for critical forms
- end-to-end tests for main workflow slices

First end-to-end workflow to automate:

1. sign in
2. create patient
3. add instruction
4. create task
5. create prescription
6. create booking

## 15. Deployment Preparation

Before first non-local deployment, add:

- production environment config
- persistent upload directory strategy
- DB backup strategy
- cron job deployment strategy
- Telegram bot secret handling
- basic logging and health endpoints

## 16. Open Implementation Questions

These are the remaining tactical decisions worth locking before coding heavily:

1. Which migration and DB access library do you want with Bun?
2. Should the timeline be query-based first or start with a projection table?
3. Should audit logging be implemented from the first service modules or added after the core workflows land?
