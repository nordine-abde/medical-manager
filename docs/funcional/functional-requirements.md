# Functional Requirements

## 1. Problem Statement

The application must support the management of a chronically ill patient's medical care workflow within the Italian healthcare system.

The current process is manual and fragmented. Medical instructions given by specialists, prescriptions issued by the general practitioner (`medico di base`), and the subsequent booking of exams and visits are tracked informally and can easily be forgotten, delayed, or lost.

The application must provide a centralized system to:

- record medical instructions and follow-up plans;
- track deadlines and recurring care activities;
- manage dependencies between specialist instructions, GP prescriptions, bookings, exams, and follow-up visits;
- reduce the risk of missed care steps.

## 2. Scope

The initial scope focuses on supporting multiple patients with chronic conditions and long-term follow-up needs within the same application, including:

- diabetes-related monitoring;
- post-surgery pituitary (`ipofisi`) follow-up;
- blood tests;
- radiology exams;
- specialist visits;
- GP-issued prescriptions required to complete those activities;
- recurring medication prescriptions and renewals.

The system must support multiple family members or caregivers collaborating in the same application across one or more patients.

## 3. Primary User Roles

### 3.1 Caregiver / Family Coordinator

The caregiver is a primary user of the system.

The caregiver must be able to:

- record medical instructions received from doctors;
- monitor what actions are required and when;
- track whether prescriptions have been requested and received;
- track recurring medication needs and when the GP must be contacted for renewals;
- track bookings for exams and visits;
- track completed activities and pending follow-ups.

### 3.2 Patient

The patient is the subject of care being managed in the system.

The system must store patient-specific care information and timelines.

The system must support multiple patients, each with an independent medical history, task list, prescriptions, documents, bookings, and follow-up workflows.

### 3.3 Family Member / Collaborating User

The application must support multiple users collaborating on the same patient or family care workflow.

A collaborating user must be able to:

- view shared patient information based on access granted;
- receive notifications;
- help track prescriptions, bookings, and completed activities;
- review documents and care history.

### 3.4 General Practitioner (`Medico di Base`)

The GP is an external actor in the workflow.

The GP must be represented in the system as the source of:

- medication prescriptions;
- prescriptions for exams;
- prescriptions for specialist visits;
- referrals when needed.

### 3.5 Specialist Doctors

Specialists are external actors who define follow-up instructions.

Examples include:

- surgeon;
- endocrinologist;
- other specialists that may be added later.

The system must allow specialist instructions to be recorded and linked to future actions.

## 4. Core Functional Requirements

### 4.1 Patient Profile Management

The system must allow authorized users to create and maintain patient profiles.

The patient profile must support:

- basic identity information for the patient;
- a list of chronic conditions;
- a list of ongoing follow-up areas;
- association of care activities with the patient;
- association of one or more collaborating users with the patient.

### 4.2 User and Access Management

The system must support multiple users collaborating on patient care management.

The system must allow:

- creation of multiple user accounts;
- association of users to one or more patients;
- shared visibility of tasks, prescriptions, bookings, and documents for authorized users;
- delivery of notifications to one or more users.

In the first version, all users must have the same permissions.

### 4.3 Medical Instruction Tracking

The system must allow the user to record instructions received from a doctor visit or consultation.

Each instruction record should support:

- source doctor or specialty;
- date of instruction;
- original free-text notes from the visit;
- one or more structured follow-up actions;
- target timing, if specified (for example, "in 1 year");
- status tracking.

Examples of follow-up actions include:

- blood tests;
- radiology exams;
- specialist follow-up visits;
- medication-related actions.

The system must preserve the original medical instruction text while also converting it into structured tasks.

### 4.4 Care Task and Timeline Management

The system must transform medical instructions into trackable tasks.

The system must allow the user to:

- view pending, upcoming, overdue, and completed tasks;
- assign due dates to tasks;
- assign date and time when relevant;
- mark tasks as completed, canceled, or deferred;
- add notes to tasks;
- track recurring tasks over time.

Recurring task generation must support an optional automatic mode.

Automatic recurring task generation must not be enabled by default and must be configurable per recurring workflow or task.

Examples:

- repeat blood tests every year;
- perform diabetes bloodwork periodically;
- schedule a specialist visit only after tests are completed.

### 4.5 Dependency Management

The system must support dependencies between care activities.

Examples of dependencies include:

- a prescription must be obtained before an exam can be booked;
- an exam must be completed before a follow-up specialist visit;
- multiple exams may need to be completed before a specialist review.

The system should allow the user to see:

- prerequisite steps;
- blocked tasks;
- the next actionable step in a care workflow.

### 4.6 Prescription Tracking

The system must allow the user to track prescriptions required to complete exams, visits, or treatments.

For each prescription, the system should support:

- prescription type;
- related doctor or specialty;
- related task or instruction;
- request status;
- collection status;
- issue date;
- expiration date when applicable;
- notes.

Prescription workflow states should support at least:

- needed;
- requested from GP;
- collected;
- received;
- used for booking;
- expired or no longer valid.

The system must distinguish between a prescription being requested and a prescription being physically collected.

The system must support prescriptions for:

- exams;
- specialist visits;
- medications.

The system must allow the user to track when the GP should be contacted to request a prescription, especially for recurring diabetes-related prescriptions.

### 4.7 Medication Management

The system must allow the user to manage recurring medications and related prescription renewals.

For each medication, the system should support:

- medication name;
- related condition;
- prescribing doctor when known;
- dosage;
- quantity;
- recurrence or renewal cadence when known;
- next date to contact the GP;
- related prescription records;
- notes.

The system must allow the user to create reminders to contact the GP before medication prescriptions are needed.

### 4.8 Booking Management

The system must allow the user to track bookings for exams and specialist visits.

For each booking, the system should support:

- linked task;
- linked prescription, if required;
- provider, facility, or hospital;
- booking date and time when applicable;
- scheduled appointment date and time;
- status;
- notes.

Booking statuses should support at least:

- not booked;
- booking in progress;
- booked;
- completed;
- canceled.

### 4.9 Facility and Provider Management

The system must allow the user to record facilities and hospitals involved in care workflows.

Each facility record should support:

- facility or hospital name;
- type of facility when relevant;
- location details when known;
- related bookings;
- related exams or visits;
- notes.

### 4.10 Exam, Visit, and Treatment History

The system must allow the user to record completed exams, visits, and other care activities.

The history should support:

- date of completion;
- exam or visit type;
- doctor or facility;
- outcome notes;
- attached or linked documents for results, reports, or prescriptions;
- link to the medical instruction that generated the activity;
- link to any new follow-up instructions generated afterward.

In the first version, exam results must be stored as uploaded files plus free-text notes, without structured extraction of lab values.

### 4.11 Timeline Visualization

The system must provide a visual chronological timeline for each patient.

The timeline must allow users to understand the history and sequence of care events over time.

The timeline must not be read-only.

The timeline must allow authorized users to create new care items and edit existing ones directly from the timeline view when feasible.

The timeline should include, when available:

- medical instructions;
- created and completed tasks;
- prescriptions requested, received, and collected;
- bookings and appointment dates;
- completed exams and visits;
- uploaded documents or reports;
- medication-related renewal events.

The timeline should make it easy to distinguish between:

- past completed events;
- upcoming scheduled events;
- overdue or delayed items.

The timeline should be filterable by event type, condition, or time period when feasible.

The timeline should support direct actions such as:

- creating a new task or instruction on a selected date;
- opening an existing event for editing;
- updating status for tasks, prescriptions, bookings, or visits;
- attaching documents to relevant timeline events.

### 4.12 Document Management

The system must allow users to store and retrieve care-related documents.

Documents must be uploaded and stored directly inside the application.

Supported document types should include at least:

- prescriptions;
- exam results;
- visit reports;
- discharge letters;
- other medical attachments.

Each document should support:

- association with a patient;
- association with a task, prescription, booking, exam, or visit when relevant;
- upload date;
- document type;
- notes.

### 4.13 Reminders and Alerts

The system must notify users about important upcoming or overdue actions.

Reminder support should include:

- approaching deadlines;
- overdue tasks;
- missing prescriptions for upcoming bookings;
- follow-up actions not yet scheduled;
- reminders to contact the GP for medication or exam prescriptions.

Notifications must support Telegram delivery through a bot configured per patient through a target chat ID.

The system should allow one or more collaborating users to receive the same notification stream for shared patients.

Telegram notifications in the first version must focus on:

- tasks that are not fulfilled by their due date;
- incoming exams, visits, or other scheduled dates.

### 4.14 Workflow Visibility

The system must provide a clear overview of the patient's current care plan.

The overview should allow the user to quickly understand:

- what is due now;
- what is coming next;
- what is blocked;
- what has already been completed;
- which condition or specialist each activity relates to.

The system must also provide a cross-patient view for users who manage more than one patient.

The patient overview should complement task-based views with history-based views such as the patient timeline.

## 5. Initial Workflow Examples

### 5.1 Specialist Follow-Up Workflow

The system must support workflows such as:

1. A specialist visit occurs.
2. The specialist instructs the patient to repeat blood tests and radiology after a defined period.
3. The caregiver records the instruction.
4. The system creates future tasks for the required exams.
5. The caregiver requests the necessary prescriptions from the GP.
6. After prescriptions are received, the caregiver books the exams.
7. Once exams are completed, the caregiver books the follow-up specialist visit.
8. The visit is completed and new instructions may be recorded.

### 5.2 Chronic Monitoring Workflow

The system must support recurring monitoring workflows such as:

1. A chronic condition requires periodic blood tests.
2. The caregiver records or confirms the recurring requirement.
3. The system tracks the next due date.
4. The caregiver obtains the required prescription if needed.
5. The exam is booked and completed.
6. A follow-up visit may be scheduled based on the results.

### 5.3 Medication Renewal Workflow

The system must support recurring medication-related workflows such as:

1. A patient has an ongoing medication for a chronic condition such as diabetes.
2. The caregiver records the medication and the need for recurring prescriptions from the GP.
3. The system tracks when the GP should be contacted.
4. The system sends a Telegram reminder to the shared family group chat.
5. The caregiver requests the prescription from the GP.
6. The prescription is received and stored in the system.
7. The medication-related task is marked as completed and the next recurrence is scheduled.

## 6. Draft Functional Areas for Future Expansion

These areas are not yet fully defined but should be considered during future refinement:

- support for multiple caregivers;
- integration with calendars or notifications;
- analytics or care history timelines;
- permissions and role granularity between family members;
- integrations with booking or healthcare systems.

## 7. Open Questions

No open functional questions are currently pending from the information gathered so far.

Future iterations may refine non-functional requirements, interface behavior, and implementation priorities.
