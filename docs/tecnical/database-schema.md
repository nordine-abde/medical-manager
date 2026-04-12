# Database Schema

## 1. Purpose

This document defines the initial PostgreSQL schema for the medical care management application.

It is derived from [domain-model.md](/home/abdessamad/apps/medical-manager/domain-model.md) and [api-design.md](/home/abdessamad/apps/medical-manager/api-design.md).

The goal is to make table structure, relationships, constraints, and indexing explicit before implementation.

## 2. Database Strategy

Recommended database:

- PostgreSQL

Schema design principles:

- use UUID primary keys;
- store operational data in normalized tables;
- use soft deletion where required by product rules;
- use explicit foreign keys for patient-scoped integrity;
- use timestamps consistently;
- optimize for patient-scoped queries, timeline reads, and overdue/upcoming task lookups.

Recommended application schema name:

- `app`

Better Auth tables may live in the same schema or a separate auth schema, depending on implementation preference.

## 3. PostgreSQL Extensions

Recommended extensions:

- `pgcrypto` for `gen_random_uuid()`
- `citext` for case-insensitive email values if desired

## 4. Enum Types

The following PostgreSQL enum types are recommended.

### 4.1 preferred_language

Values:

- `it`
- `en`

### 4.2 instruction_status

Values:

- `active`
- `fulfilled`
- `superseded`
- `cancelled`

### 4.3 task_type

Values:

- `instruction_follow_up`
- `prescription_request`
- `prescription_collection`
- `exam_booking`
- `exam_execution`
- `visit_booking`
- `visit_execution`
- `medication_renewal`
- `general_reminder`

### 4.4 task_status

Values:

- `pending`
- `blocked`
- `scheduled`
- `completed`
- `cancelled`
- `deferred`

### 4.5 prescription_type

Values:

- `exam`
- `specialist_visit`
- `medication`

### 4.6 prescription_status

Values:

- `needed`
- `requested`
- `available`
- `collected`
- `used`
- `expired`
- `cancelled`

### 4.7 booking_status

Values:

- `not_booked`
- `booking_in_progress`
- `booked`
- `completed`
- `cancelled`

### 4.8 care_event_type

Values:

- `exam`
- `specialist_visit`
- `treatment`
- `surgery_follow_up`

### 4.9 document_type

Values:

- `prescription`
- `exam_result`
- `visit_report`
- `discharge_letter`
- `general_attachment`

### 4.10 notification_channel

Values:

- `telegram`

### 4.11 notification_status

Values:

- `pending`
- `sent`
- `failed`

### 4.12 audit_action_type

Values:

- `created`
- `updated`
- `deleted`
- `restored`
- `status_changed`

### 4.13 related_entity_type

Values:

- `medical_instruction`
- `task`
- `prescription`
- `booking`
- `care_event`
- `medication`
- `patient`

### 4.14 timeline_event_type

Values:

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

## 5. Auth Tables

Better Auth should own authentication-specific tables such as:

- users or account table
- sessions
- verification tokens
- any provider-specific tables

If Better Auth manages the canonical user table directly, the application should extend that table or create a profile table for:

- full name
- preferred language

If the application owns the user table, it should remain compatible with Better Auth requirements.

## 6. Core Tables

### 6.1 users

Purpose:

- store application user profile data

Columns:

- `id uuid primary key default gen_random_uuid()`
- `email citext not null unique`
- `full_name text not null`
- `preferred_language preferred_language not null default 'it'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Notes:

- if Better Auth owns `users`, this definition becomes conceptual rather than authoritative.

### 6.2 patients

Columns:

- `id uuid primary key default gen_random_uuid()`
- `full_name text not null`
- `date_of_birth date null`
- `notes text null`
- `deleted_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### 6.3 patient_users

Columns:

- `id uuid primary key default gen_random_uuid()`
- `patient_id uuid not null references app.patients(id)`
- `user_id uuid not null references app.users(id)`
- `created_at timestamptz not null default now()`

Constraints:

- unique `(patient_id, user_id)`

### 6.4 conditions

Columns:

- `id uuid primary key default gen_random_uuid()`
- `patient_id uuid not null references app.patients(id)`
- `name text not null`
- `notes text null`
- `active boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### 6.5 medical_instructions

Columns:

- `id uuid primary key default gen_random_uuid()`
- `patient_id uuid not null references app.patients(id)`
- `doctor_name text null`
- `specialty text null`
- `instruction_date date not null`
- `original_notes text not null`
- `target_timing_text text null`
- `status instruction_status not null default 'active'`
- `created_by_user_id uuid not null references app.users(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### 6.6 tasks

Columns:

- `id uuid primary key default gen_random_uuid()`
- `patient_id uuid not null references app.patients(id)`
- `medical_instruction_id uuid null references app.medical_instructions(id)`
- `condition_id uuid null references app.conditions(id)`
- `title text not null`
- `description text null`
- `task_type task_type not null`
- `status task_status not null default 'pending'`
- `due_date date null`
- `scheduled_at timestamptz null`
- `auto_recurrence_enabled boolean not null default false`
- `recurrence_rule text null`
- `created_by_user_id uuid not null references app.users(id)`
- `completed_at timestamptz null`
- `deleted_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Check constraints:

- `completed_at is null or status = 'completed'`

### 6.7 task_dependencies

Columns:

- `id uuid primary key default gen_random_uuid()`
- `task_id uuid not null references app.tasks(id)`
- `depends_on_task_id uuid not null references app.tasks(id)`
- `created_at timestamptz not null default now()`

Constraints:

- unique `(task_id, depends_on_task_id)`
- check `(task_id <> depends_on_task_id)`

Implementation note:

- cross-patient validation should be enforced at application level or trigger level because it spans referenced rows.

### 6.8 prescriptions

Columns:

- `id uuid primary key default gen_random_uuid()`
- `patient_id uuid not null references app.patients(id)`
- `task_id uuid null references app.tasks(id)`
- `medication_id uuid null references app.medications(id)`
- `prescription_type prescription_type not null`
- `requested_at timestamptz null`
- `received_at timestamptz null`
- `collected_at timestamptz null`
- `issue_date date null`
- `expiration_date date null`
- `status prescription_status not null default 'needed'`
- `notes text null`
- `deleted_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Check constraints:

- `expiration_date is null or issue_date is null or expiration_date >= issue_date`

### 6.9 medications

Columns:

- `id uuid primary key default gen_random_uuid()`
- `patient_id uuid not null references app.patients(id)`
- `condition_id uuid null references app.conditions(id)`
- `name text not null`
- `dosage text not null`
- `quantity text not null`
- `prescribing_doctor text null`
- `renewal_cadence text null`
- `next_gp_contact_date date null`
- `notes text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### 6.10 facilities

Columns:

- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `facility_type text null`
- `address text null`
- `city text null`
- `notes text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### 6.11 bookings

Columns:

- `id uuid primary key default gen_random_uuid()`
- `patient_id uuid not null references app.patients(id)`
- `task_id uuid not null references app.tasks(id)`
- `prescription_id uuid null references app.prescriptions(id)`
- `facility_id uuid null references app.facilities(id)`
- `booking_status booking_status not null default 'not_booked'`
- `booked_at timestamptz null`
- `appointment_at timestamptz null`
- `notes text null`
- `deleted_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### 6.12 care_events

Columns:

- `id uuid primary key default gen_random_uuid()`
- `patient_id uuid not null references app.patients(id)`
- `task_id uuid null references app.tasks(id)`
- `booking_id uuid null references app.bookings(id)`
- `facility_id uuid null references app.facilities(id)`
- `event_type care_event_type not null`
- `completed_at timestamptz not null`
- `outcome_notes text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### 6.13 documents

Columns:

- `id uuid primary key default gen_random_uuid()`
- `patient_id uuid not null references app.patients(id)`
- `related_entity_type related_entity_type not null`
- `related_entity_id uuid not null`
- `original_filename text not null`
- `storage_path text not null unique`
- `mime_type text not null`
- `file_size_bytes bigint not null`
- `document_type document_type not null`
- `uploaded_by_user_id uuid not null references app.users(id)`
- `uploaded_at timestamptz not null default now()`
- `notes text null`

Check constraints:

- `file_size_bytes > 0`

Implementation note:

- polymorphic references on `related_entity_id` cannot be enforced with a standard FK and must be validated in application code.

### 6.14 notification_rules

Columns:

- `id uuid primary key default gen_random_uuid()`
- `patient_id uuid not null references app.patients(id)`
- `rule_type text not null`
- `enabled boolean not null default true`
- `days_before_due integer null`
- `telegram_enabled boolean not null default true`
- `telegram_chat_id text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints:

- unique `(patient_id, rule_type)`

### 6.15 notification_logs

Columns:

- `id uuid primary key default gen_random_uuid()`
- `patient_id uuid null references app.patients(id)`
- `task_id uuid null references app.tasks(id)`
- `booking_id uuid null references app.bookings(id)`
- `channel notification_channel not null default 'telegram'`
- `destination text not null`
- `message_body text not null`
- `sent_at timestamptz not null default now()`
- `status notification_status not null`
- `error_message text null`

### 6.16 audit_logs

Columns:

- `id uuid primary key default gen_random_uuid()`
- `patient_id uuid null references app.patients(id)`
- `entity_type related_entity_type not null`
- `entity_id uuid not null`
- `action_type audit_action_type not null`
- `changed_by_user_id uuid not null references app.users(id)`
- `before_json jsonb null`
- `after_json jsonb null`
- `created_at timestamptz not null default now()`

### 6.17 timeline_events

This table is optional.

It should exist only if the timeline is implemented as a materialized projection rather than computed on read.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `patient_id uuid not null references app.patients(id)`
- `source_entity_type related_entity_type not null`
- `source_entity_id uuid not null`
- `event_type timeline_event_type not null`
- `event_at timestamptz not null`
- `title text not null`
- `summary text null`
- `status text null`
- `metadata_json jsonb null`
- `created_at timestamptz not null default now()`

## 7. Foreign Key Delete Behavior

Recommended delete behavior:

- prefer `on delete restrict` for core workflow entities;
- do not cascade-delete patient-scoped medical history unintentionally;
- use soft deletion in application logic instead of DB cascade for patient, task, prescription, and booking records.

Recommended exceptions:

- `patient_users.patient_id` may use `on delete cascade` only if patient hard deletion is ever supported internally;
- auth/session tables may follow Better Auth defaults.

## 8. Index Strategy

The following indexes are recommended in addition to PK and unique indexes.

### 8.1 patients

- index on `(deleted_at)`
- index on `(full_name)`

### 8.2 patient_users

- index on `(user_id)`
- unique index on `(patient_id, user_id)`

### 8.3 conditions

- index on `(patient_id, active)`

### 8.4 medical_instructions

- index on `(patient_id, instruction_date desc)`
- index on `(patient_id, status)`

### 8.5 tasks

- index on `(patient_id, status, due_date)`
- index on `(patient_id, scheduled_at)`
- index on `(patient_id, deleted_at)`
- index on `(medical_instruction_id)`
- index on `(condition_id)`
- partial index on `(patient_id, due_date)` where `deleted_at is null and status in ('pending', 'blocked', 'scheduled', 'deferred')`

### 8.6 task_dependencies

- index on `(depends_on_task_id)`

### 8.7 prescriptions

- index on `(patient_id, status)`
- index on `(patient_id, prescription_type)`
- index on `(task_id)`
- index on `(medication_id)`
- index on `(patient_id, deleted_at)`

### 8.8 medications

- index on `(patient_id, next_gp_contact_date)`
- index on `(condition_id)`

### 8.9 facilities

- index on `(name)`
- index on `(city)`

### 8.10 bookings

- index on `(patient_id, booking_status, appointment_at)`
- index on `(patient_id, deleted_at)`
- index on `(task_id)`
- index on `(facility_id)`
- partial index on `(patient_id, appointment_at)` where `deleted_at is null and booking_status in ('booked', 'booking_in_progress')`

### 8.11 care_events

- index on `(patient_id, completed_at desc)`
- index on `(booking_id)`

### 8.12 documents

- index on `(patient_id, uploaded_at desc)`
- index on `(related_entity_type, related_entity_id)`
- index on `(document_type)`

### 8.13 notification_rules

- unique index on `(patient_id, rule_type)`

### 8.14 notification_logs

- index on `(patient_id, sent_at desc)`
- index on `(task_id)`
- index on `(booking_id)`
- index on `(status)`

### 8.15 audit_logs

- index on `(patient_id, created_at desc)`
- index on `(entity_type, entity_id)`
- index on `(changed_by_user_id)`

### 8.16 timeline_events

- index on `(patient_id, event_at desc)`
- index on `(source_entity_type, source_entity_id)`
- index on `(event_type)`

## 9. Soft Deletion Rules

The following tables should support soft deletion:

- `patients`
- `tasks`
- `prescriptions`
- `bookings`

Optional later:

- `conditions`
- `medical_instructions`
- `medications`

Soft deletion behavior:

- use `deleted_at timestamptz null`
- exclude deleted rows from default application queries
- preserve rows for audit trail and historical integrity

## 10. Audit Logging Strategy

Changes to the following tables should create audit log entries:

- `tasks`
- `prescriptions`
- `bookings`

Recommended later expansion:

- `medical_instructions`
- `documents`
- `patients`

Minimum audit payload:

- entity type
- entity id
- action type
- acting user
- before snapshot
- after snapshot
- timestamp

## 11. Timeline Storage Strategy

Two valid implementations exist.

### Option A: Query-Based Timeline

Use no `timeline_events` table.

Instead:

- query core tables;
- normalize results in backend code;
- merge and sort by effective event datetime.

Advantages:

- simpler writes
- no projection sync concerns

Disadvantages:

- more complex reads
- harder to paginate consistently across mixed sources

### Option B: Projection Table

Use `app.timeline_events`.

Populate it on:

- instruction creation
- task creation and completion
- prescription status changes
- booking creation and completion
- care event creation
- document upload
- medication reminder generation

Advantages:

- fast timeline reads
- simpler frontend consumption

Disadvantages:

- projection maintenance logic required

For MVP, query-based timeline is acceptable unless performance becomes a problem.

## 12. Trigger and Application Logic Notes

Recommended application-level behaviors:

- update `updated_at` automatically on every update;
- validate cross-patient ownership for foreign-linked entities;
- prevent circular task dependencies;
- generate audit log rows from service-layer writes;
- optionally use triggers only for generic `updated_at` maintenance if desired.

Recommended database triggers only if needed:

- `set_updated_at()` for mutable tables

## 13. Example Table Creation Order

Recommended migration order:

1. extensions
2. enums
3. auth or users table
4. patients
5. patient_users
6. conditions
7. medical_instructions
8. tasks
9. task_dependencies
10. medications
11. prescriptions
12. facilities
13. bookings
14. care_events
15. documents
16. notification_rules
17. notification_logs
18. audit_logs
19. timeline_events if used

## 14. Open Schema Questions

The schema is close to implementation-ready, but these points may still be adjusted:

1. Should Better Auth own the canonical `users` table directly, or should the app keep a separate user profile table linked one-to-one?
2. Should `received_at` on prescriptions be renamed to `available_at` for schema clarity?
3. Should `documents` support soft deletion in v1?
4. Should `timeline_events` be created in the first migration, or only if the query-based timeline proves too slow?
