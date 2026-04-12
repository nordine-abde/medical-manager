# UI Flows

## 1. Purpose

This document defines the main user flows and screen behavior for the MVP user interface.

It is based on:

- [functional-requirements.md](/home/abdessamad/apps/medical-manager/functional-requirements.md)
- [mvp-roadmap.md](/home/abdessamad/apps/medical-manager/mvp-roadmap.md)
- [api-design.md](/home/abdessamad/apps/medical-manager/api-design.md)

The goal is to make the main user journeys explicit before building the frontend.

## 2. UX Principles

- The UI should favor clarity over density.
- The most important information is what is overdue, upcoming, blocked, or newly added.
- The user should always know which patient they are currently managing.
- Timeline and task list should complement each other rather than compete.
- Actions should be available close to the data they affect.
- Mobile-first layout is preferred because many actions will happen on phone.

## 3. Main Navigation

Recommended primary navigation for authenticated users:

- Patients
- Current patient overview
- Tasks
- Timeline
- Documents
- Settings

Inside a patient context, recommended secondary navigation:

- Overview
- Instructions
- Tasks
- Prescriptions
- Medications
- Bookings
- Documents
- Timeline
- Audit

## 4. Authentication Flow

### 4.1 Sign In

Entry:

- unauthenticated user opens app

Screen contents:

- email field
- password field
- sign-in button
- sign-up link if self-registration is enabled
- language switcher if simple to expose pre-login

Primary actions:

- sign in
- navigate to sign up

Success outcome:

- user is redirected to patient list or the last opened patient

### 4.2 Sign Up

Screen contents:

- full name
- email
- password
- confirm password
- submit button

Success outcome:

- session is created
- user enters authenticated app shell

## 5. Patient Management Flow

### 5.1 Patient List

Purpose:

- show all patients accessible to the current user

Screen contents:

- patient search
- active and archived toggle
- patient cards or list rows
- create patient button

Each patient row should show:

- patient name
- optional summary of overdue tasks
- optional next upcoming event

Primary actions:

- open patient
- create patient
- archive patient

### 5.2 Create Patient

Entry points:

- patient list

Form fields:

- full name
- date of birth
- notes

Success outcome:

- patient is created
- user is redirected to patient overview

### 5.3 Patient Sharing

Entry points:

- patient overview or patient settings

Screen contents:

- list of currently linked users
- add user by email or identifier
- remove access action

Success outcome:

- new user can access the patient immediately

## 6. Patient Overview Flow

### 6.1 Overview Screen

Purpose:

- provide a quick operational summary for one patient

Recommended sections:

- overdue tasks
- upcoming appointments
- pending prescriptions
- active medications
- recent timeline items
- quick actions

Quick actions:

- add instruction
- add task
- add prescription
- add booking
- upload document

Success criteria:

- a caregiver can understand the current state in a few seconds

## 7. Condition Flow

### 7.1 Condition List And Add

Entry points:

- patient overview
- patient conditions section

Screen contents:

- active conditions list
- archived or inactive conditions toggle
- add condition button

Condition card contents:

- condition name
- notes
- active state

Primary actions:

- add condition
- edit condition
- deactivate condition

## 8. Medical Instruction Flow

### 8.1 Instruction List

Purpose:

- show doctor-originated plans and follow-up instructions

Screen contents:

- filter by status
- filter by date range
- instruction cards or rows
- create instruction button

Each instruction item should show:

- doctor or specialty
- instruction date
- short summary
- status

### 8.2 Create Instruction

Form fields:

- doctor name
- specialty
- instruction date
- original notes
- target timing text

Optional embedded task creation:

- add one or more structured follow-up tasks

Success outcome:

- instruction appears in list
- tasks appear in task list and timeline

### 8.3 Instruction Detail

Screen contents:

- original doctor notes
- linked tasks
- linked documents
- status
- related timeline items

Primary actions:

- edit instruction
- change instruction status
- add linked task
- upload document

## 9. Task Flow

### 9.1 Task List

Purpose:

- show actionable work clearly

Recommended segments:

- overdue
- due soon
- blocked
- scheduled
- completed

Filters:

- status
- task type
- condition
- due date range

Task row contents:

- title
- due date
- status
- condition or instruction link
- blocked indicator

Primary actions:

- create task
- edit task
- change task status
- manage dependencies

### 9.2 Create Or Edit Task

Form fields:

- title
- description
- task type
- due date
- scheduled datetime
- linked instruction
- linked condition
- auto recurrence toggle
- recurrence rule

Behavior:

- auto recurrence toggle defaults to off

### 9.3 Dependency Management

Entry points:

- task detail

Screen contents:

- prerequisites list
- add dependency action
- blocked explanation

Success outcome:

- user can understand why a task is blocked

## 10. Prescription Flow

### 10.1 Prescription Tracker

Purpose:

- manage GP-issued prescriptions

Recommended segments:

- needed
- requested
- available or received
- collected
- used
- expired

Each prescription row should show:

- type
- related task or medication
- issue date
- expiration date
- status

Primary actions:

- create prescription
- update status
- attach prescription document

### 10.2 Prescription Status Update

Preferred interaction:

- quick action buttons or status dropdown

Common actions:

- mark requested
- mark available
- mark collected
- mark used

## 11. Medication Flow

### 11.1 Medication List

Purpose:

- track ongoing medications and GP renewal needs

Each medication item should show:

- medication name
- dosage
- quantity
- next GP contact date
- related condition

Primary actions:

- add medication
- edit medication
- create linked prescription

### 11.2 Medication Form

Form fields:

- name
- dosage
- quantity
- prescribing doctor
- renewal cadence
- next GP contact date
- notes

## 12. Booking Flow

### 12.1 Booking List

Purpose:

- track scheduled exams and visits

Recommended segments:

- upcoming
- booking in progress
- completed
- cancelled

Each booking row should show:

- appointment datetime
- facility
- linked task
- prescription linkage if any
- booking status

Primary actions:

- create booking
- edit booking
- change booking status
- open facility

### 12.2 Create Booking

Form fields:

- linked task
- linked prescription
- facility
- booked at
- appointment datetime
- notes

Behavior:

- form should clearly show if prescription is missing

## 13. Facility Flow

### 13.1 Facility Registry

Purpose:

- keep reusable provider and hospital records

Screen contents:

- search
- facility list
- create facility button

Facility item should show:

- name
- type
- city

## 14. Document Flow

### 14.1 Document Library

Purpose:

- centralize uploaded medical files

Filters:

- document type
- related entity type
- upload date

Each document item should show:

- filename
- type
- upload date
- linked entity

Primary actions:

- upload
- download
- edit notes

### 14.2 Upload Document

Entry points:

- patient overview
- instruction detail
- task detail
- prescription detail
- booking detail
- care-event detail
- timeline quick action

Form fields:

- file
- document type
- related entity
- notes

Behavior:

- unsupported or dangerous file types must be rejected with a clear message

## 15. Care Event Flow

### 15.1 Care Event Creation

Purpose:

- mark real-world medical actions as completed history

Form fields:

- event type
- linked booking
- linked task
- facility
- completion datetime
- outcome notes

Primary actions:

- create care event
- attach result documents

## 16. Timeline Flow

### 16.1 Timeline View

Purpose:

- show patient history and future scheduled events in chronological order

Recommended layout:

- reverse chronological list by default
- date separators
- color or badge differentiation by event type and status

Filters:

- event type
- date range
- condition

Each timeline item should show:

- event title
- date and time
- compact summary
- source type
- status

### 16.2 Timeline Actions

Allowed actions from timeline:

- open linked entity
- edit linked entity
- change task status
- change prescription status
- change booking status
- attach document
- create new item on selected date

Recommended quick-add menu:

- new instruction
- new task
- new booking
- upload document

### 16.3 Timeline Edit Rule

The timeline should not become a heavy editing surface for every field inline.

Preferred behavior:

- quick actions in timeline
- open dedicated full forms for deeper edits

## 17. Notification Settings Flow

### 17.1 Patient Notification Settings

Purpose:

- configure Telegram reminders per patient

Form fields:

- Telegram enabled
- Telegram chat ID
- overdue reminder enabled
- upcoming event reminder enabled
- days before due

Primary actions:

- save settings
- test notification later if implemented

## 18. Audit Flow

### 18.1 Audit Log View

Purpose:

- show who changed operational records

Filters:

- entity type
- date range

Each audit entry should show:

- timestamp
- user
- entity type
- action

Expanded view should show:

- before state
- after state

## 19. Mobile Considerations

The MVP is web-first, but UI flows should remain compatible with later mobile packaging.

Design implications:

- avoid overly wide tables as primary interaction
- use drawers, cards, and expandable panels
- keep the main patient context and quick actions easily reachable
- prefer forms that work well on narrow screens

## 20. Empty States

Important empty states should be explicit:

- no patients yet
- no tasks yet
- no instructions yet
- no prescriptions yet
- no bookings yet
- no timeline events yet
- no documents yet

Each empty state should include a direct primary action.

## 21. Error States

The UI should clearly handle:

- authorization failures
- network failures
- validation errors
- invalid workflow transitions
- blocked file uploads

Messages should explain what happened and what the user can do next.

## 22. Open UI Questions

These details can be refined during design and implementation:

1. Should patient overview and task list live on separate tabs or one long dashboard page?
2. Should bookings have a list-only MVP UI or also a calendar-style view?
3. Should the timeline default to newest-first or group by month sections more explicitly?
