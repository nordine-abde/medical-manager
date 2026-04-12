# Domain Model

## 1. Purpose

This document defines the domain model for the medical care management application.

It translates the functional requirements in [functional-requirements.md](/home/abdessamad/apps/medical-manager/functional-requirements.md) and the architecture choices in [tecnical-solutions.md](/home/abdessamad/apps/medical-manager/tecnical-solutions.md) into implementation-oriented domain concepts.

The goal is to make entity boundaries, workflows, state transitions, and timeline behavior explicit before coding.

## 2. Core Domain Principles

- `Patient` is the central aggregate for care history and ongoing workflows.
- Every operational item must belong to exactly one patient.
- The system models both planned work and completed history.
- A timeline is a projection of patient-related domain events, not a separate source of truth for all data.
- Timeline items may open create and edit flows, but the underlying entities remain the source of truth.
- Dependencies between tasks must be explicit.
- Auditability matters for operational changes.

## 3. Core Entities

### 3.1 User

Represents an authenticated application user.

Key attributes:

- id
- full_name
- email
- preferred_language
- auth-managed fields from Better Auth
- created_at
- updated_at

Rules:

- all users have the same permissions in v1;
- user access to patient data is controlled through the `PatientUser` relationship;
- users may create, update, and soft-delete domain items when authorized for the related patient.

### 3.2 Patient

Represents one person whose care workflow is being tracked.

Key attributes:

- id
- full_name
- date_of_birth nullable
- notes
- deleted_at nullable
- created_at
- updated_at

Rules:

- a patient may be linked to multiple users;
- all care data must be scoped to a patient;
- soft deletion must hide the patient from active views without destroying history.

### 3.3 PatientUser

Represents access between a user and a patient.

Key attributes:

- id
- user_id
- patient_id
- created_at

Rules:

- this is the authorization boundary for patient-linked data;
- Telegram configuration and timeline visibility are still constrained by this association.

### 3.4 Condition

Represents a chronic condition or clinical area relevant to the patient.

Examples:

- diabetes
- pituitary post-surgery follow-up

Key attributes:

- id
- patient_id
- name
- notes
- active
- created_at
- updated_at

Rules:

- a condition may be linked to tasks, medications, and instructions;
- conditions are organizational and do not replace doctor-authored instructions.

### 3.5 MedicalInstruction

Represents an instruction received from a doctor visit or consultation.

Key attributes:

- id
- patient_id
- doctor_name nullable
- specialty nullable
- instruction_date
- original_notes
- target_timing_text nullable
- status
- created_by_user_id
- created_at
- updated_at

Rules:

- original doctor wording should be preserved;
- a medical instruction may generate one or more tasks;
- a medical instruction may later lead to new care events and follow-up instructions.

Suggested statuses:

- `active`
- `fulfilled`
- `superseded`
- `cancelled`

### 3.6 Task

Represents a unit of work that the caregiver or family must track.

Examples:

- request GP prescription
- book MRI
- complete blood test
- schedule endocrinologist visit

Key attributes:

- id
- patient_id
- medical_instruction_id nullable
- condition_id nullable
- title
- description nullable
- task_type
- status
- due_date nullable
- scheduled_at nullable
- auto_recurrence_enabled
- recurrence_rule nullable
- created_by_user_id
- completed_at nullable
- deleted_at nullable
- created_at
- updated_at

Rules:

- tasks are actionable items;
- tasks may depend on other tasks;
- tasks may optionally have a specific scheduled datetime;
- automatic recurrence is optional and disabled by default;
- the next recurring instance is generated only when auto recurrence is enabled.

Suggested task types:

- `instruction_follow_up`
- `prescription_request`
- `prescription_collection`
- `exam_booking`
- `exam_execution`
- `visit_booking`
- `visit_execution`
- `medication_renewal`
- `general_reminder`

Suggested statuses:

- `pending`
- `blocked`
- `scheduled`
- `completed`
- `cancelled`
- `deferred`

### 3.7 TaskDependency

Represents a prerequisite relationship between two tasks.

Key attributes:

- id
- task_id
- depends_on_task_id
- created_at

Rules:

- a task is blocked while any required dependency is incomplete;
- circular dependencies must be rejected;
- dependency relationships must remain within the same patient.

### 3.8 Prescription

Represents a prescription document or prescription workflow for exams, visits, or medications.

Key attributes:

- id
- patient_id
- task_id nullable
- medication_id nullable
- prescription_type
- requested_at nullable
- received_at nullable
- collected_at nullable
- issue_date nullable
- expiration_date nullable
- status
- notes nullable
- deleted_at nullable
- created_at
- updated_at

Rules:

- the system must distinguish requested from collected;
- `received_at` should represent the date the prescription became available in the system context;
- a prescription may be linked to a medication or a task;
- prescriptions used for booking should remain historically visible.

Suggested prescription types:

- `exam`
- `specialist_visit`
- `medication`

Suggested statuses:

- `needed`
- `requested`
- `available`
- `collected`
- `used`
- `expired`
- `cancelled`

State interpretation:

- `requested`: the GP has been asked but the prescription is not yet available;
- `available`: the prescription exists or has been issued, but may not yet be physically collected;
- `collected`: the physical or final usable prescription is in hand;
- `used`: it has been consumed for booking or care workflow completion.

### 3.9 Medication

Represents a recurring medication to be monitored over time.

Key attributes:

- id
- patient_id
- condition_id nullable
- name
- dosage
- quantity
- prescribing_doctor nullable
- renewal_cadence nullable
- next_gp_contact_date nullable
- notes nullable
- created_at
- updated_at

Rules:

- medications are long-lived records;
- medication renewals may create tasks and prescriptions;
- medications may appear in the timeline as renewal-related events.

### 3.10 Facility

Represents a provider, clinic, hospital, or diagnostic center.

Key attributes:

- id
- name
- facility_type nullable
- address nullable
- city nullable
- notes nullable
- created_at
- updated_at

Rules:

- facilities may be linked to bookings and completed care events;
- facility data should be reusable across multiple patients.

### 3.11 Booking

Represents an appointment booking for an exam or specialist visit.

Key attributes:

- id
- patient_id
- task_id
- prescription_id nullable
- facility_id nullable
- booking_status
- booked_at nullable
- appointment_at nullable
- notes nullable
- deleted_at nullable
- created_at
- updated_at

Rules:

- bookings should usually be tied to a task;
- a booking may require a prescription;
- appointment time may exist before completion;
- soft deletion must preserve auditability.

Suggested statuses:

- `not_booked`
- `booking_in_progress`
- `booked`
- `completed`
- `cancelled`

### 3.12 CareEvent

Represents a completed real-world medical event.

Examples:

- blood test completed
- MRI completed
- endocrinologist visit completed

Key attributes:

- id
- patient_id
- task_id nullable
- booking_id nullable
- facility_id nullable
- event_type
- completed_at
- outcome_notes nullable
- created_at
- updated_at

Rules:

- a care event is history, not a future plan;
- a completed booking may lead to a care event;
- documents such as reports and results may be attached to it;
- a care event may generate new medical instructions.

Suggested event types:

- `exam`
- `specialist_visit`
- `treatment`
- `surgery_follow_up`

### 3.13 Document

Represents a stored medical file.

Key attributes:

- id
- patient_id
- related_entity_type
- related_entity_id
- original_filename
- storage_path
- mime_type
- document_type
- uploaded_by_user_id
- uploaded_at
- notes nullable

Rules:

- only common safe document and image formats should be accepted;
- dangerous executable file types must be blocked;
- a document may belong to a task, prescription, booking, care event, or instruction;
- documents are stored inside the application domain, with metadata in the database and file content on the filesystem.

Suggested document types:

- `prescription`
- `exam_result`
- `visit_report`
- `discharge_letter`
- `general_attachment`

### 3.14 NotificationRule

Represents reminder behavior for a patient.

Key attributes:

- id
- patient_id
- rule_type
- enabled
- days_before_due nullable
- telegram_enabled
- telegram_chat_id nullable
- created_at
- updated_at

Rules:

- configuration is patient-specific;
- Telegram chat IDs are set per patient;
- rules should drive cron-based reminder generation.

### 3.15 NotificationLog

Represents an attempted or completed outgoing notification.

Key attributes:

- id
- patient_id nullable
- task_id nullable
- booking_id nullable
- channel
- destination
- message_body
- sent_at
- status
- error_message nullable

Rules:

- used to avoid duplicate reminders;
- useful for troubleshooting Telegram delivery issues.

### 3.16 AuditLog

Represents a tracked domain change.

Key attributes:

- id
- patient_id nullable
- entity_type
- entity_id
- action_type
- changed_by_user_id
- before_json nullable
- after_json nullable
- created_at

Rules:

- required at least for task, prescription, and booking changes;
- should also be usable for high-value edits to instructions and documents;
- must preserve enough information to understand who changed what.

## 4. Entity Relationships

Key relationships:

- one `User` to many `PatientUser`
- one `Patient` to many `PatientUser`
- one `Patient` to many `Condition`
- one `Patient` to many `MedicalInstruction`
- one `MedicalInstruction` to many `Task`
- one `Patient` to many `Task`
- one `Task` to many `TaskDependency` as child
- one `Task` to many `TaskDependency` as prerequisite
- one `Patient` to many `Prescription`
- one `Medication` to many `Prescription`
- one `Patient` to many `Medication`
- one `Patient` to many `Booking`
- one `Facility` to many `Booking`
- one `Patient` to many `CareEvent`
- one `Facility` to many `CareEvent`
- one `Patient` to many `Document`
- one patient-scoped entity to many `Document`
- one `Patient` to many `NotificationRule`
- one `Patient` to many `NotificationLog`
- one `Patient` to many `AuditLog`

## 5. Aggregate Boundaries

Recommended aggregates:

### 5.1 Patient Aggregate

Owns:

- patient profile
- patient-user access links
- conditions
- patient-scoped settings such as notification rules

### 5.2 Instruction Aggregate

Owns:

- medical instruction
- initial structured follow-up actions derived from it

### 5.3 Task Aggregate

Owns:

- task
- dependencies
- recurrence behavior
- linked status transitions

### 5.4 Prescription Aggregate

Owns:

- prescription state
- important timestamps
- links to related task or medication

### 5.5 Booking Aggregate

Owns:

- booking state
- appointment metadata
- links to facility and prescription

### 5.6 Care Event Aggregate

Owns:

- completed medical event data
- result notes
- links to booking and documents

## 6. State Machines

### 6.1 Task State Machine

Primary states:

- `pending`
- `blocked`
- `scheduled`
- `completed`
- `cancelled`
- `deferred`

Suggested transitions:

- `pending -> blocked`
- `blocked -> pending`
- `pending -> scheduled`
- `scheduled -> completed`
- `pending -> completed`
- `scheduled -> deferred`
- `deferred -> pending`
- `pending -> cancelled`
- `scheduled -> cancelled`

Rules:

- a task should not be marked `completed` if required dependencies remain incomplete, unless the user explicitly overrides this behavior;
- blocked state may be derived dynamically, even if also stored for performance;
- completing an auto-recurring task may generate the next task instance.

### 6.2 Prescription State Machine

Primary states:

- `needed`
- `requested`
- `available`
- `collected`
- `used`
- `expired`
- `cancelled`

Suggested transitions:

- `needed -> requested`
- `requested -> available`
- `available -> collected`
- `collected -> used`
- `available -> used`
- `needed -> cancelled`
- `requested -> cancelled`
- `available -> expired`
- `collected -> expired`

Rules:

- `available` and `collected` should remain distinct;
- in some workflows the prescription may be usable without an explicit collection step, depending on how the caregiver tracks it;
- `used` should not erase historical timestamps.

### 6.3 Booking State Machine

Primary states:

- `not_booked`
- `booking_in_progress`
- `booked`
- `completed`
- `cancelled`

Suggested transitions:

- `not_booked -> booking_in_progress`
- `booking_in_progress -> booked`
- `booked -> completed`
- `booking_in_progress -> cancelled`
- `booked -> cancelled`

Rules:

- a booking should not move to `booked` without required appointment details when those are known;
- a completed booking may trigger creation of a care event.

### 6.4 Medical Instruction State Machine

Primary states:

- `active`
- `fulfilled`
- `superseded`
- `cancelled`

Suggested transitions:

- `active -> fulfilled`
- `active -> superseded`
- `active -> cancelled`

Rules:

- an instruction becomes `fulfilled` when all relevant follow-up work is complete;
- an instruction may become `superseded` when a new specialist instruction replaces the old plan.

## 7. Timeline Domain Model

The timeline is a projection, not a master entity for business logic.

The timeline should unify the following domain sources:

- medical instructions
- task creation
- task completion
- prescription request
- prescription availability
- prescription collection
- booking creation
- appointment date
- booking completion
- care event completion
- document upload
- medication renewal reminder

## 8. Timeline Event Types

Suggested timeline event types:

- `instruction_recorded`
- `task_created`
- `task_due`
- `task_completed`
- `task_overdue`
- `prescription_requested`
- `prescription_available`
- `prescription_collected`
- `booking_created`
- `appointment_scheduled`
- `booking_completed`
- `care_event_completed`
- `document_uploaded`
- `medication_renewal_due`
- `medication_prescription_requested`

Each timeline event should contain:

- patient reference
- source entity type
- source entity id
- event type
- effective datetime
- display title
- compact summary
- visual status
- optional metadata for UI rendering

## 9. Timeline Editing Rules

The timeline must support actions, but edits must apply to underlying entities.

Allowed timeline-driven actions:

- create a medical instruction on a selected date
- create a task on a selected date
- create a booking linked to an existing task
- attach a document to a relevant entity
- mark a task completed
- update prescription status
- update booking status
- open full edit forms for instructions, tasks, prescriptions, bookings, medications, and care events

Rules:

- the timeline should not edit projected event rows directly;
- every action must resolve to a domain entity change;
- all such changes should generate audit logs where required;
- timeline actions must respect patient authorization.

## 10. Domain Invariants

The following invariants should hold:

1. Every task, prescription, booking, care event, medication, instruction, and document must belong to exactly one patient.
2. A dependency cannot link tasks from different patients.
3. A booking cannot reference a prescription from another patient.
4. A document cannot be attached to an entity from another patient.
5. Soft-deleted records must not appear in default active views.
6. Audit logs must preserve change history even if the source entity is later soft deleted.
7. Timeline queries must exclude unauthorized patient data.
8. Automatic recurrence must never be enabled implicitly.
9. Dangerous file types must be rejected before storage.

## 11. Domain Services

Recommended domain services:

### 11.1 InstructionToTaskService

Responsibilities:

- convert doctor instructions into structured tasks
- create task dependencies where needed

### 11.2 TaskDependencyService

Responsibilities:

- compute blocked state
- validate dependencies
- prevent invalid dependency graphs

### 11.3 RecurrenceService

Responsibilities:

- parse recurrence settings
- generate next recurring task
- ensure recurrence only fires when enabled

### 11.4 TimelineProjectionService

Responsibilities:

- build patient timeline entries
- merge events from multiple entity types
- support filters and paging

### 11.5 NotificationService

Responsibilities:

- evaluate reminder conditions
- send Telegram notifications
- log outcomes

### 11.6 AuditService

Responsibilities:

- capture before and after snapshots
- persist audit logs for relevant entities

## 12. MVP Domain Scope

The MVP should fully support:

- users and patient sharing
- conditions
- medical instructions
- tasks and dependencies
- prescriptions
- medications
- bookings
- facilities
- care events
- documents
- per-patient Telegram rules
- audit logs for key operational entities
- patient timeline with create and edit entry points

The MVP does not need:

- structured lab result extraction
- granular user roles
- offline-first behavior
- advanced analytics

## 13. Open Modeling Questions

The domain model is stable enough for implementation, but these choices may still be refined later:

1. Should `received_at` on prescriptions remain distinct from `available_at`, or should the field be renamed for clarity?
2. Should completed visits always create a `CareEvent`, or can some workflows treat a completed booking as sufficient history?
3. Should timeline projection be query-based first, or materialized into a dedicated table for performance from the start?
