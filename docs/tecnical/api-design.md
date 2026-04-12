# API Design

## 1. Purpose

This document defines the first API design for the medical care management application.

It is based on [functional-requirements.md](/home/abdessamad/apps/medical-manager/functional-requirements.md), [tecnical-solutions.md](/home/abdessamad/apps/medical-manager/tecnical-solutions.md), and [domain-model.md](/home/abdessamad/apps/medical-manager/domain-model.md).

The API is designed for a Bun + ElysiaJS backend used by a Quasar frontend.

## 2. API Style

The API should be:

- REST-oriented;
- JSON-based;
- patient-scoped for all medical workflow data;
- session-authenticated through Better Auth;
- explicit about status transitions for workflow entities.

Base path:

- `/api/v1`

## 3. Common Conventions

### 3.1 Authentication

Authentication should be handled through Better Auth routes and session handling.

Protected domain routes must require an authenticated user.

### 3.2 Authorization

A user may access patient-linked resources only if a `PatientUser` relationship exists for that patient.

Authorization rules must be enforced server-side for every patient-scoped route.

### 3.3 Identifiers

All entity identifiers should use stable opaque IDs, preferably UUIDs.

### 3.4 Timestamps

All timestamps returned by the API should use ISO 8601 format.

### 3.5 Soft Deletion

Entities that support soft deletion should be excluded from default list responses.

Optional query parameters may expose archived records when needed.

### 3.6 Error Response Shape

Recommended error response:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid task status transition",
    "details": {
      "from": "completed",
      "to": "pending"
    }
  }
}
```

### 3.7 Success Response Shape

Recommended success response:

```json
{
  "data": {}
}
```

Pagination response:

```json
{
  "data": [],
  "page": 1,
  "pageSize": 20,
  "total": 132
}
```

## 4. Authentication Routes

Authentication endpoints should primarily come from Better Auth integration.

The application may expose a thin wrapper namespace if needed:

- `POST /api/v1/auth/sign-up`
- `POST /api/v1/auth/sign-in`
- `POST /api/v1/auth/sign-out`
- `GET /api/v1/auth/session`

## 5. User Routes

### 5.1 Get Current User

- `GET /api/v1/users/me`

Response fields should include:

- id
- full_name
- email
- preferred_language

### 5.2 Update Current User

- `PATCH /api/v1/users/me`

Request body:

```json
{
  "fullName": "Mario Rossi",
  "preferredLanguage": "it"
}
```

## 6. Patient Routes

### 6.1 List Patients

- `GET /api/v1/patients`

Query parameters:

- `includeArchived=false|true`
- `search=...`

### 6.2 Create Patient

- `POST /api/v1/patients`

Request body:

```json
{
  "fullName": "Maria Rossi",
  "dateOfBirth": "1958-05-11",
  "notes": "Main chronic follow-up patient"
}
```

### 6.3 Get Patient

- `GET /api/v1/patients/:patientId`

### 6.4 Update Patient

- `PATCH /api/v1/patients/:patientId`

### 6.5 Archive Patient

- `DELETE /api/v1/patients/:patientId`

Behavior:

- perform soft deletion by setting `deleted_at`

### 6.6 Restore Patient

- `POST /api/v1/patients/:patientId/restore`

### 6.7 Patient Overview

- `GET /api/v1/patients/:patientId/overview`

This endpoint should return an aggregated summary for dashboard use, such as:

- overdue task count
- upcoming appointments
- pending prescriptions
- active medications
- recent timeline highlights

## 7. Patient Sharing Routes

### 7.1 List Patient Users

- `GET /api/v1/patients/:patientId/users`

### 7.2 Add User to Patient

- `POST /api/v1/patients/:patientId/users`

Request body:

```json
{
  "userId": "uuid"
}
```

### 7.3 Remove User from Patient

- `DELETE /api/v1/patients/:patientId/users/:userId`

## 8. Condition Routes

### 8.1 List Conditions

- `GET /api/v1/patients/:patientId/conditions`

### 8.2 Create Condition

- `POST /api/v1/patients/:patientId/conditions`

Request body:

```json
{
  "name": "Diabetes",
  "notes": "Type 2 diabetes follow-up",
  "active": true
}
```

### 8.3 Update Condition

- `PATCH /api/v1/conditions/:conditionId`

### 8.4 Archive Condition

- `DELETE /api/v1/conditions/:conditionId`

## 9. Medical Instruction Routes

### 9.1 List Instructions

- `GET /api/v1/patients/:patientId/instructions`

Query parameters:

- `status`
- `conditionId`
- `from`
- `to`

### 9.2 Create Instruction

- `POST /api/v1/patients/:patientId/instructions`

Request body:

```json
{
  "doctorName": "Dr. Bianchi",
  "specialty": "Endocrinology",
  "instructionDate": "2026-03-19",
  "originalNotes": "Repeat blood tests in 6 months and book follow-up visit",
  "targetTimingText": "in 6 months",
  "tasks": [
    {
      "title": "Repeat blood tests",
      "taskType": "exam_execution",
      "dueDate": "2026-09-19"
    },
    {
      "title": "Book endocrinologist follow-up",
      "taskType": "visit_booking",
      "dueDate": "2026-09-26"
    }
  ]
}
```

Behavior:

- may create the instruction and initial tasks in one operation

### 9.3 Get Instruction

- `GET /api/v1/instructions/:instructionId`

### 9.4 Update Instruction

- `PATCH /api/v1/instructions/:instructionId`

### 9.5 Change Instruction Status

- `POST /api/v1/instructions/:instructionId/status`

Request body:

```json
{
  "status": "fulfilled"
}
```

## 10. Task Routes

### 10.1 List Tasks

- `GET /api/v1/patients/:patientId/tasks`

Query parameters:

- `status`
- `taskType`
- `conditionId`
- `dueFrom`
- `dueTo`
- `includeArchived=false|true`

### 10.2 Create Task

- `POST /api/v1/patients/:patientId/tasks`

Request body:

```json
{
  "medicalInstructionId": "uuid",
  "conditionId": "uuid",
  "title": "Request GP prescription for blood tests",
  "description": "Call medico di base",
  "taskType": "prescription_request",
  "dueDate": "2026-04-02",
  "scheduledAt": null,
  "autoRecurrenceEnabled": false,
  "recurrenceRule": null
}
```

### 10.3 Get Task

- `GET /api/v1/tasks/:taskId`

### 10.4 Update Task

- `PATCH /api/v1/tasks/:taskId`

### 10.5 Change Task Status

- `POST /api/v1/tasks/:taskId/status`

Request body:

```json
{
  "status": "completed",
  "completedAt": "2026-04-02T09:30:00Z"
}
```

Behavior:

- validate state transitions
- optionally generate next recurring task if configured

### 10.6 Archive Task

- `DELETE /api/v1/tasks/:taskId`

### 10.7 Restore Task

- `POST /api/v1/tasks/:taskId/restore`

### 10.8 List Task Dependencies

- `GET /api/v1/tasks/:taskId/dependencies`

### 10.9 Add Task Dependency

- `POST /api/v1/tasks/:taskId/dependencies`

Request body:

```json
{
  "dependsOnTaskId": "uuid"
}
```

### 10.10 Remove Task Dependency

- `DELETE /api/v1/tasks/:taskId/dependencies/:dependsOnTaskId`

## 11. Prescription Routes

### 11.1 List Prescriptions

- `GET /api/v1/patients/:patientId/prescriptions`

Query parameters:

- `status`
- `prescriptionType`
- `medicationId`
- `includeArchived=false|true`

### 11.2 Create Prescription

- `POST /api/v1/patients/:patientId/prescriptions`

Request body:

```json
{
  "taskId": "uuid",
  "medicationId": null,
  "prescriptionType": "exam",
  "issueDate": null,
  "expirationDate": null,
  "notes": "Needed for blood tests"
}
```

### 11.3 Get Prescription

- `GET /api/v1/prescriptions/:prescriptionId`

### 11.4 Update Prescription

- `PATCH /api/v1/prescriptions/:prescriptionId`

### 11.5 Change Prescription Status

- `POST /api/v1/prescriptions/:prescriptionId/status`

Request body:

```json
{
  "status": "collected",
  "collectedAt": "2026-04-03T10:00:00Z"
}
```

### 11.6 Archive Prescription

- `DELETE /api/v1/prescriptions/:prescriptionId`

### 11.7 Restore Prescription

- `POST /api/v1/prescriptions/:prescriptionId/restore`

## 12. Medication Routes

### 12.1 List Medications

- `GET /api/v1/patients/:patientId/medications`

### 12.2 Create Medication

- `POST /api/v1/patients/:patientId/medications`

Request body:

```json
{
  "conditionId": "uuid",
  "name": "Metformin",
  "dosage": "500 mg",
  "quantity": "60 tablets",
  "prescribingDoctor": "Medico di base",
  "renewalCadence": "monthly",
  "nextGpContactDate": "2026-04-15",
  "notes": "Usually requested monthly"
}
```

### 12.3 Get Medication

- `GET /api/v1/medications/:medicationId`

### 12.4 Update Medication

- `PATCH /api/v1/medications/:medicationId`

## 13. Facility Routes

### 13.1 List Facilities

- `GET /api/v1/facilities`

Query parameters:

- `search`
- `city`

### 13.2 Create Facility

- `POST /api/v1/facilities`

### 13.3 Get Facility

- `GET /api/v1/facilities/:facilityId`

### 13.4 Update Facility

- `PATCH /api/v1/facilities/:facilityId`

## 14. Booking Routes

### 14.1 List Bookings

- `GET /api/v1/patients/:patientId/bookings`

Query parameters:

- `status`
- `from`
- `to`
- `facilityId`
- `includeArchived=false|true`

### 14.2 Create Booking

- `POST /api/v1/patients/:patientId/bookings`

Request body:

```json
{
  "taskId": "uuid",
  "prescriptionId": "uuid",
  "facilityId": "uuid",
  "bookedAt": "2026-04-10T08:45:00Z",
  "appointmentAt": "2026-04-22T07:30:00Z",
  "notes": "Bring paper prescription"
}
```

### 14.3 Get Booking

- `GET /api/v1/bookings/:bookingId`

### 14.4 Update Booking

- `PATCH /api/v1/bookings/:bookingId`

### 14.5 Change Booking Status

- `POST /api/v1/bookings/:bookingId/status`

Request body:

```json
{
  "status": "booked"
}
```

### 14.6 Archive Booking

- `DELETE /api/v1/bookings/:bookingId`

### 14.7 Restore Booking

- `POST /api/v1/bookings/:bookingId/restore`

## 15. Care Event Routes

### 15.1 List Care Events

- `GET /api/v1/patients/:patientId/care-events`

### 15.2 Create Care Event

- `POST /api/v1/patients/:patientId/care-events`

Request body:

```json
{
  "taskId": "uuid",
  "bookingId": "uuid",
  "facilityId": "uuid",
  "eventType": "exam",
  "completedAt": "2026-04-22T08:20:00Z",
  "outcomeNotes": "Exam completed, waiting for report"
}
```

### 15.3 Get Care Event

- `GET /api/v1/care-events/:careEventId`

### 15.4 Update Care Event

- `PATCH /api/v1/care-events/:careEventId`

## 16. Document Routes

### 16.1 List Documents

- `GET /api/v1/patients/:patientId/documents`

Query parameters:

- `documentType`
- `relatedEntityType`
- `relatedEntityId`

### 16.2 Upload Document

- `POST /api/v1/patients/:patientId/documents`

Content type:

- `multipart/form-data`

Form fields:

- `file`
- `documentType`
- `relatedEntityType`
- `relatedEntityId`
- `notes`

Behavior:

- validate safe file type
- store file on filesystem
- store metadata in database

### 16.3 Get Document Metadata

- `GET /api/v1/documents/:documentId`

### 16.4 Download Document

- `GET /api/v1/documents/:documentId/download`

### 16.5 Update Document Metadata

- `PATCH /api/v1/documents/:documentId`

### 16.6 Delete Document

- `DELETE /api/v1/documents/:documentId`

Behavior:

- may be hard delete or soft delete depending on storage policy, to be finalized later

## 17. Timeline Routes

### 17.1 Get Patient Timeline

- `GET /api/v1/patients/:patientId/timeline`

Query parameters:

- `from`
- `to`
- `eventType`
- `conditionId`
- `page`
- `pageSize`

Response example:

```json
{
  "data": [
    {
      "id": "uuid",
      "eventType": "prescription_requested",
      "eventAt": "2026-04-02T09:00:00Z",
      "title": "Prescription requested from GP",
      "summary": "Blood test prescription requested",
      "status": "requested",
      "sourceEntityType": "prescription",
      "sourceEntityId": "uuid",
      "actions": [
        "open",
        "edit",
        "attach_document",
        "change_status"
      ]
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 40
}
```

### 17.2 Create Item From Timeline

- `POST /api/v1/patients/:patientId/timeline/actions/create`

Request body:

```json
{
  "entityType": "task",
  "contextDate": "2026-04-10",
  "payload": {
    "title": "Call GP for diabetes prescription",
    "taskType": "prescription_request"
  }
}
```

Supported `entityType` values should initially include:

- `instruction`
- `task`
- `booking`
- `document`

Behavior:

- create the underlying entity;
- return the created entity and corresponding timeline event context.

### 17.3 Update Item From Timeline

Timeline edits should normally call the underlying entity routes directly.

The frontend may still use timeline metadata to decide which form or action to open.

## 18. Notification Routes

### 18.1 List Notification Rules

- `GET /api/v1/patients/:patientId/notification-rules`

### 18.2 Upsert Notification Rule

- `PUT /api/v1/patients/:patientId/notification-rules/:ruleType`

Request body:

```json
{
  "enabled": true,
  "daysBeforeDue": 2,
  "telegramEnabled": true,
  "telegramChatId": "-1234567890"
}
```

### 18.3 List Notification Logs

- `GET /api/v1/patients/:patientId/notification-logs`

## 19. Audit Routes

### 19.1 List Audit Logs

- `GET /api/v1/patients/:patientId/audit-logs`

Query parameters:

- `entityType`
- `entityId`
- `from`
- `to`

## 20. Status Transition Rules

The API should validate workflow transitions server-side.

Minimum expected guarded transitions:

- task status transitions;
- prescription status transitions;
- booking status transitions;
- medical instruction status transitions.

When a transition is invalid, the API should return:

- `409 Conflict` for domain-state conflicts;
- `422 Unprocessable Entity` for validation failures.

## 21. Validation Rules

The API should enforce at least the following:

1. `patientId` in route and entity ownership must match.
2. Dependency links must not be cross-patient.
3. Booking-linked prescriptions must belong to the same patient.
4. Uploaded files must be from an allowed safe type list.
5. Timeline action requests must create only supported entity types.
6. Soft-deleted entities must reject status transitions unless restored first.

## 22. Suggested ElysiaJS Module Structure

Suggested route grouping:

- `modules/auth`
- `modules/users`
- `modules/patients`
- `modules/conditions`
- `modules/instructions`
- `modules/tasks`
- `modules/prescriptions`
- `modules/medications`
- `modules/facilities`
- `modules/bookings`
- `modules/care-events`
- `modules/documents`
- `modules/timeline`
- `modules/notifications`
- `modules/audit`

Each module should contain:

- route definitions
- request validation schemas
- service layer
- repository layer

## 23. MVP Endpoint Priorities

Recommended order of implementation:

1. auth session
2. current user
3. patients
4. patient sharing
5. conditions
6. instructions
7. tasks
8. dependencies
9. prescriptions
10. medications
11. facilities
12. bookings
13. care events
14. documents
15. timeline
16. notification rules
17. audit logs

## 24. Open API Questions

The API design is implementation-ready for v1, but these decisions may still be refined:

1. Should Better Auth routes be mounted directly as framework-native routes or wrapped behind `/api/v1/auth`?
2. Should timeline create actions remain generic, or should the frontend call entity-specific create routes directly after pre-filling context?
3. Should document deletion be soft or hard in v1?
