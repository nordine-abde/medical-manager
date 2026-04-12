# Technical Solutions

## 1. Purpose

This document defines the draft technical solution for implementing the medical care management application described in [functional-requirements.md](/home/abdessamad/apps/medical-manager/functional-requirements.md).

It is intended to evolve iteratively as functional requirements, constraints, and implementation choices become clearer.

## 2. Technical Goals

The technical solution must support:

- multiple patients;
- multiple collaborating users with equal permissions in the first version;
- structured medical workflows with dependencies;
- recurring tasks with optional automatic regeneration;
- document upload and storage inside the application;
- patient history visualization through a chronological timeline;
- Telegram bot notifications configurable per patient;
- support for prescriptions, medications, bookings, visits, and facilities;
- a simple architecture that is maintainable by a small team or a single developer.

## 3. Proposed High-Level Architecture

The application should be built as a standard web application with:

- a frontend for caregivers and family members;
- a backend API that manages business rules and workflows;
- a relational database for structured medical workflow data;
- a file storage layer for uploaded documents;
- a background job mechanism for reminders and recurring task generation;
- a Telegram bot integration for notifications.

Recommended architecture:

1. Web frontend
2. Backend API
3. Relational database
4. File storage
5. Background scheduler / worker
6. Telegram notification service

## 4. Suggested Technology Direction

The chosen technical direction for the first version is:

- frontend: Quasar with Vue.js, targeting web first and later mobile app delivery from a shared frontend codebase through Capacitor;
- backend: Bun with ElysiaJS as a modular monolith exposing an API;
- authentication: Better Auth with email and password only;
- database: PostgreSQL;
- file storage: filesystem storage for uploaded files, with file metadata stored in the database;
- background jobs: cron-style scheduled jobs inside the application deployment;
- notifications: Telegram Bot API.

A modular monolith is the preferred starting point over microservices because:

- the domain is complex enough to require solid business logic;
- the deployment should remain simple;
- one deployable unit is easier to maintain initially;
- future extraction is possible if a subsystem becomes heavy.

## 5. Core Technical Modules

The backend should be split into clear modules:

### 5.1 Authentication and Users

Responsibilities:

- user registration and login through Better Auth;
- email and password authentication only in the first version;
- user-session management;
- association of users to patients;
- shared access enforcement;
- language preference management for Italian and English UI support.

### 5.2 Patient Management

Responsibilities:

- patient profile storage;
- condition tracking;
- association of patients to multiple users.

### 5.3 Medical Instructions and Care Plans

Responsibilities:

- storing doctor instructions;
- preserving original free-text notes;
- creating structured follow-up actions;
- linking instructions to downstream tasks.

### 5.4 Patient History and Timeline

Responsibilities:

- aggregating patient events into a chronological feed;
- combining data from instructions, tasks, prescriptions, bookings, care events, medications, and documents;
- supporting filtered timeline queries by event type and date range;
- supporting timeline-driven create and edit flows for relevant entities.

### 5.5 Tasks and Dependencies

Responsibilities:

- task lifecycle management;
- due date tracking;
- recurring task definitions;
- dependency graph between tasks;
- blocked/unblocked state evaluation.

### 5.6 Prescriptions and Medications

Responsibilities:

- prescription tracking;
- distinction between requested, received, and collected states;
- medication catalog per patient;
- renewal reminders;
- GP contact scheduling.

### 5.7 Bookings and Facilities

Responsibilities:

- exam and visit booking tracking;
- facility and hospital registry;
- appointment date and time tracking;
- linkage between bookings, tasks, prescriptions, and providers.

### 5.8 Documents

Responsibilities:

- upload;
- metadata storage;
- secure retrieval;
- linking documents to patients and care entities;
- file type validation and dangerous file blocking.

### 5.9 Notifications

Responsibilities:

- reminder scheduling;
- overdue detection;
- upcoming event notifications;
- Telegram message delivery;
- patient-specific Telegram chat configuration.

### 5.10 Audit Trail

Responsibilities:

- recording who changed tasks;
- recording who changed prescriptions;
- recording who changed bookings;
- preserving before-and-after change visibility where appropriate.

## 6. Recommended Data Model

The initial relational model should include at least the following entities:

### 6.1 User

Fields should include:

- id;
- full_name;
- email;
- Better Auth managed authentication fields;
- preferred_language;
- created_at;
- updated_at.

### 6.2 Patient

Fields should include:

- id;
- full_name;
- date_of_birth if desired;
- notes;
- deleted_at nullable;
- created_at;
- updated_at.

### 6.3 PatientUser

This join table should link users and patients for shared access.

Fields should include:

- id;
- user_id;
- patient_id;
- created_at.

This table defines which users are allowed to access a given patient.

### 6.4 Condition

Fields should include:

- id;
- patient_id;
- name;
- notes;
- active flag;
- created_at;
- updated_at.

### 6.5 MedicalInstruction

Fields should include:

- id;
- patient_id;
- doctor_name or specialty;
- instruction_date;
- original_notes;
- target_timing_text;
- status;
- created_by_user_id;
- created_at;
- updated_at.

### 6.6 Task

Fields should include:

- id;
- patient_id;
- medical_instruction_id;
- condition_id nullable;
- title;
- description;
- task_type;
- status;
- due_date;
- scheduled_at nullable;
- auto_recurrence_enabled;
- recurrence_rule nullable;
- created_by_user_id;
- completed_at nullable;
- deleted_at nullable;
- created_at;
- updated_at.

### 6.7 TaskDependency

Fields should include:

- id;
- task_id;
- depends_on_task_id;
- created_at.

### 6.8 Prescription

Fields should include:

- id;
- patient_id;
- task_id nullable;
- medication_id nullable;
- prescription_type;
- requested_at nullable;
- received_at nullable;
- collected_at nullable;
- issue_date nullable;
- expiration_date nullable;
- status;
- notes;
- deleted_at nullable;
- created_at;
- updated_at.

### 6.9 Medication

Fields should include:

- id;
- patient_id;
- condition_id nullable;
- name;
- dosage;
- quantity;
- prescribing_doctor nullable;
- renewal_cadence nullable;
- next_gp_contact_date nullable;
- notes;
- created_at;
- updated_at.

### 6.10 Facility

Fields should include:

- id;
- name;
- facility_type nullable;
- address nullable;
- city nullable;
- notes;
- created_at;
- updated_at.

### 6.11 Booking

Fields should include:

- id;
- patient_id;
- task_id;
- prescription_id nullable;
- facility_id nullable;
- booking_status;
- booked_at nullable;
- appointment_at nullable;
- notes;
- deleted_at nullable;
- created_at;
- updated_at.

### 6.12 CareEvent

This entity should represent completed exams, visits, and treatments.

Fields should include:

- id;
- patient_id;
- task_id nullable;
- booking_id nullable;
- facility_id nullable;
- event_type;
- completed_at;
- outcome_notes;
- created_at;
- updated_at.

### 6.13 TimelineEvent

This entity may be implemented either as a materialized table or as a backend projection layer built from other entities.

Its purpose is to power a unified patient timeline.

Fields should include:

- id;
- patient_id;
- source_entity_type;
- source_entity_id;
- event_type;
- event_at;
- title;
- summary nullable;
- status nullable;
- metadata_json nullable;
- created_at.

### 6.14 Document

Fields should include:

- id;
- patient_id;
- related_entity_type;
- related_entity_id;
- original_filename;
- storage_path or object_key;
- mime_type;
- document_type;
- uploaded_by_user_id;
- uploaded_at;
- notes.

### 6.15 NotificationRule

Fields should include:

- id;
- patient_id;
- rule_type;
- enabled;
- days_before_due nullable;
- telegram_enabled;
- telegram_chat_id nullable;
- created_at;
- updated_at.

### 6.16 NotificationLog

Fields should include:

- id;
- patient_id nullable;
- task_id nullable;
- booking_id nullable;
- channel;
- destination;
- message_body;
- sent_at;
- status;
- error_message nullable.

### 6.17 AuditLog

Fields should include:

- id;
- patient_id nullable;
- entity_type;
- entity_id;
- action_type;
- changed_by_user_id;
- before_json nullable;
- after_json nullable;
- created_at.

## 7. Document Storage Approach

The application must store files inside the application domain, not as external links only.

Recommended approach:

- store file metadata in PostgreSQL;
- store binary files on the application filesystem in a dedicated storage directory;
- generate unique internal file identifiers;
- never rely on user-supplied filenames for storage;
- validate file type and size on upload;
- allow common document and image formats only;
- block dangerous executable or script-like file types.

The first production version may use the same filesystem-based approach, provided backups and storage path management are defined.

## 8. Telegram Notification Solution

Telegram notifications should be implemented through a dedicated bot.

Recommended design:

1. Create a Telegram bot through BotFather.
2. Add the bot to one or more family or patient-related group chats.
3. Store the target chat ID per patient in database configuration.
4. Use scheduled cron-style jobs to scan for:
   - overdue tasks;
   - upcoming exams or visits;
   - GP contact reminders.
5. Send formatted messages to the configured chat for each patient.

The system should avoid duplicate notification spam by recording sent messages in `NotificationLog`.

Telegram notification scope should be determined by patient access rules:

- each patient may have its own Telegram chat configuration;
- users allowed on the same patient share the same relevant notification context;
- patient visibility must still be enforced by backend authorization rules.

## 9. Recurring Task Strategy

Recurring task support should be modeled explicitly rather than inferred from completed tasks alone.

Recommended behavior:

- a task may optionally include a recurrence rule;
- automatic regeneration must be disabled by default;
- when enabled, the next task is generated after completion of the current one;
- generated tasks should preserve links to patient, condition, and workflow type;
- users should still be allowed to edit generated due dates.

## 10. Dependency Handling Strategy

Dependencies should be stored explicitly using task-to-task relationships.

Recommended behavior:

- a task is blocked if one or more prerequisite tasks are incomplete;
- the UI should show why a task is blocked;
- prescriptions can be represented as tasks, linked records, or both;
- booking actions should only be marked available when prerequisite prescription steps are complete;
- follow-up visits should depend on completion of required exams where applicable.

## 11. Timeline Strategy

The patient timeline should be treated as a read-optimized history view.

Recommended behavior:

- normalize operational data in core tables such as tasks, prescriptions, bookings, and care events;
- expose the timeline through either:
  - a backend query that merges events at read time; or
  - a projected `TimelineEvent` table updated on writes;
- sort all timeline entries by their effective event date;
- allow filtering by event type, condition, and date range;
- visually distinguish completed history from future scheduled items;
- allow timeline items to open domain-specific edit forms;
- allow creation actions from timeline context, such as adding a task, instruction, booking, or document on a selected date.

## 12. API Design Direction

The backend should expose an API structured by domain modules.

Suggested resource groups:

- `/auth`
- `/users`
- `/patients`
- `/conditions`
- `/instructions`
- `/tasks`
- `/task-dependencies`
- `/prescriptions`
- `/medications`
- `/facilities`
- `/bookings`
- `/care-events`
- `/documents`
- `/timeline`
- `/notifications`
- `/settings`

REST is a reasonable first choice because the domain is CRUD-heavy and workflow-oriented.

The API should be implemented as ElysiaJS route groups aligned with domain modules.

The timeline API should support both:

- read endpoints for chronological event retrieval;
- action endpoints or linked resource routes that allow editing the underlying entities from the timeline UI.

## 13. Frontend Design Direction

The frontend should prioritize operational clarity over clinical complexity.

Quasar is the preferred frontend framework because it allows a shared Vue.js codebase for:

- web application delivery;
- future mobile app packaging with Capacitor and minimal frontend rewrite.

Key screens should include:

- login and onboarding;
- patient list;
- patient overview dashboard;
- patient timeline view;
- task list with overdue and upcoming sections;
- instruction detail page;
- prescription tracker;
- medication tracker;
- bookings calendar or list;
- document library;
- facility registry;
- notification settings.

The UI should be designed mobile-first where possible because many workflow actions will likely happen from a phone.

The frontend should support Italian and English with a user-switchable language setting when feasible in the first version.

The patient timeline view should support:

- chronological scrolling;
- filters by event type and period;
- quick-add actions from a selected date;
- inline status changes where safe;
- opening full edit forms for underlying entities.

## 14. Security and Privacy Baseline

Because the application handles sensitive health information, the technical design should include:

- authenticated access for every user;
- encrypted transport with HTTPS;
- password hashing using a modern password hashing algorithm;
- authorization checks on every patient-linked resource;
- soft deletion for patient, task, prescription, and booking records where deletion must remain reversible;
- audit logging for sensitive operational changes;
- audit fields for created and updated records;
- restricted file access through authenticated endpoints;
- backups for database and uploaded files.

This document does not yet define full compliance or legal requirements, but the architecture should assume medical data sensitivity from the start.

## 15. MVP Implementation Strategy

The recommended MVP order is:

1. Authentication and shared users
2. Patients and conditions
3. Medical instructions
4. Tasks and dependencies
5. Prescriptions and medications
6. Facilities and bookings
7. Document upload
8. Patient timeline
9. Telegram reminders

This order prioritizes getting the core workflow usable before adding secondary refinements.

## 16. Open Technical Questions

No major technical stack decisions are currently pending from the information gathered so far.

Future iterations may refine deployment topology, backup strategy, mobile packaging details, and operational monitoring.
