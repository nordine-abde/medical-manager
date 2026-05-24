# UX and Usability QA Report

Date: 2026-05-24

## Executive Summary

The application is usable enough to create a patient and basic care records, but several interaction details are not yet safe or clear enough for real care coordination. The highest-risk issue is ambiguous record selection: the booking creation form shows two different prescriptions with the same label, so users cannot know which prescription they are linking. This is especially problematic in a medical workflow where linking the wrong prescription can mislead scheduling, document attachment, and follow-up work.

The next most serious issues are booking save failures that produce no visible form-level error, partial side effects when creating a facility during a failed booking save, broken linked-document panels, and responsive layout problems that clip important headings and make pages difficult to read on narrow screens.

Areas needing immediate improvement:

- Distinguishing labels for prescription, booking, and document record selectors.
- Visible error handling and recovery in booking creation.
- Atomic booking/facility creation or safer rollback behavior.
- Responsive shell/header fixes.
- Missing `RelatedDocumentsPanel` imports in booking and prescription pages.

## Test Setup

The full stack was started with:

```bash
./full_run.sh
```

The first run failed during `bun run db:check` because PostgreSQL was still starting:

```text
PostgresError: the database system is starting up
code: 57P03
```

Retrying `./full_run.sh` succeeded.

Running services:

```text
Frontend: http://localhost:9000
Backend:  http://localhost:3000
Database: PostgreSQL container from backend/compose.yaml
```

Browser and tooling:

- Playwright MCP with Chromium headless.
- Browser viewports tested: 1440 x 900, 800 x 935, and 390 x 844.
- Console and network requests were inspected during the flows.

Test account created through the UI:

```text
Name: QA Reviewer
Email: qa.reviewer.20260524@example.com
Password: TestPassword123!
```

Test patient:

```text
Name: Maria Rossi
Date of birth: 1957-04-12
Notes: Cardiology follow-up and recurring prescription test case.
```

Test prescriptions:

```text
Visit / Cardiology
Issue date: 2026-05-20
Expiration date: 2026-08-20
Notes: First cardiology visit prescription.

Visit / Neurology
Issue date: 2026-05-21
Expiration date: 2026-08-21
Notes: Second visit prescription with same type but different subtype.
```

Evidence screenshots:

- [Prescription list with two distinct records](./evidence/evidence-prescriptions-two-records.png)
- [Ambiguous booking prescription dropdown](./evidence/evidence-booking-prescription-dropdown-ambiguous.png)
- [Booking save failure with no visible error](./evidence/evidence-booking-save-401-no-visible-error.png)
- [Document linked-record dropdown](./evidence/evidence-documents-linked-record-dropdown.png)
- [Mobile header and heading clipping](./evidence/evidence-mobile-header-heading-clipping.png)
- [800px overview layout compression](./evidence/evidence-overview-800.png)

## Tested Workflows

### Authentication and Patient Setup

Steps:

1. Opened `http://localhost:9000`.
2. Confirmed redirect to `/auth/sign-in`.
3. Navigated to sign up.
4. Created the QA account.
5. Created patient `Maria Rossi`.

Expected behavior:

- User can sign up and land in the protected workspace.
- Patient creation validates required fields.
- New patient opens in patient context.

Actual behavior:

- Sign-up and patient creation worked.
- Required full-name validation appeared when submitting an empty patient form.
- Patient overview opened after creation.
- Browser title stayed `Medical Manager`, with no route or patient context.

### Prescription Creation

Steps:

1. Opened patient prescriptions.
2. Created `Visit / Cardiology`.
3. Created `Visit / Neurology`.
4. Reviewed prescription list cards.

Expected behavior:

- The prescription list should distinguish records.
- Downstream selectors should expose the same distinguishing details.

Actual behavior:

- The list cards were clear: `Visit · Neurology` and `Visit · Cardiology`.
- Issue and expiration dates were visible on the cards.
- This clarity was not carried into booking or document selectors.

Evidence:

- [Prescription list with two distinct records](./evidence/evidence-prescriptions-two-records.png)

### Booking Creation and Prescription Linking

Steps:

1. Opened patient bookings.
2. Clicked `Add booking`.
3. Opened `Prescription link`.
4. Selected one of two `Visit` options.
5. Selected `Create new facility`.
6. Filled facility and booking fields.
7. Submitted the booking.

Expected behavior:

- Prescription dropdown should clearly identify each prescription.
- Creating a facility and booking should either both succeed or neither leave side effects.
- Any save error should be visible and actionable.

Actual behavior:

- The prescription dropdown showed two identical `Visit` options.
- Facility creation succeeded.
- Booking creation returned `401 Unauthorized`.
- The form stayed open without an inline error or clear recovery guidance.

Network evidence:

```text
POST /api/v1/facilities => 200
POST /api/v1/patients/:patientId/bookings => 401
```

Console evidence:

```text
Authentication required.
```

Evidence:

- [Ambiguous booking prescription dropdown](./evidence/evidence-booking-prescription-dropdown-ambiguous.png)
- [Booking save failure with no visible error](./evidence/evidence-booking-save-401-no-visible-error.png)

### Documents and Linked Records

Steps:

1. Opened patient documents.
2. Opened the `Linked record` dropdown.
3. Reviewed prescription options.

Expected behavior:

- Linked record options should identify the patient, prescription, or booking being linked.
- Prescription options should include type, subtype, and date.

Actual behavior:

- Patient option was clear enough: `Maria Rossi` with caption `General patient file`.
- Prescription options only showed generic label `Prescription` and issue date.
- Same-day prescriptions would still be ambiguous.

Evidence:

- [Document linked-record dropdown](./evidence/evidence-documents-linked-record-dropdown.png)

### Care Events

Steps:

1. Opened patient care events.
2. Opened `Add care event`.
3. Reviewed fields and selector labels.

Expected behavior:

- Form should make it clear that the user is recording a completed clinical event.
- Optional booking/facility links should be distinguishable when records exist.

Actual behavior:

- The page title and form title were reasonably clear.
- No booking record existed because booking creation failed, so booking selector ambiguity could not be fully tested.
- The form uses compact labels and helper text; it should reuse the same record-label format recommended for booking and documents.

### Patient Access

Steps:

1. Opened patient access.
2. Reviewed collaborator form and existing access list.

Expected behavior:

- Current account should be clearly identified.
- Add-collaborator input should describe accepted identifier.

Actual behavior:

- Current account card was clear.
- The input label `User email or ID` is acceptable but could be more human-centered as `Caregiver email or user ID`.

### Settings

Steps:

1. Opened settings.
2. Reviewed profile form and preferred language dropdown.
3. Tested mobile viewport.

Expected behavior:

- Profile form should be readable at desktop and mobile widths.
- Header and headings should not clip.

Actual behavior:

- Desktop settings were understandable.
- Mobile layout clipped the shell title and produced very tall headings in narrow columns.

Evidence:

- [Mobile header and heading clipping](./evidence/evidence-mobile-header-heading-clipping.png)

## Usability Issues Found

### 1. Booking Prescription Dropdown Cannot Distinguish Prescriptions

Severity: High

Location: Patient bookings page, `Add booking` dialog, `Prescription link` dropdown.

Steps to reproduce:

1. Create two prescriptions for the same patient with the same prescription type.
2. Use different subtypes and issue dates.
3. Open `Bookings`.
4. Click `Add booking`.
5. Open `Prescription link`.

Actual behavior:

The dropdown shows:

```text
No linked prescription
Visit
Visit
```

Expected behavior:

Each prescription option should include enough detail to identify the correct record.

Recommended option format:

```text
Visit - Neurology - Issued May 21, 2026 - Expires Aug 21, 2026
Visit - Cardiology - Issued May 20, 2026 - Expires Aug 20, 2026
```

Why this is a problem:

The user cannot know which prescription they are selecting. In a care-management app, linking the wrong prescription can cause incorrect scheduling context, incorrect document associations, and confusion for caregivers.

Evidence:

- [Ambiguous booking prescription dropdown](./evidence/evidence-booking-prescription-dropdown-ambiguous.png)

Source evidence:

- `frontend/src/modules/bookings/pages/PatientBookingsPage.vue` builds `bookingPrescriptionOptions` using only `prescriptionType`.

Recommended fix:

- Add a shared `formatPrescriptionDisplayLabel` helper.
- Use it in booking dropdowns, document dropdowns, booking cards, document library rows, and any future task/care-event selectors.
- Include type, subtype, issue date, expiration date when present.
- Prefer two-line select options if long labels become visually dense.

### 2. Booking Save Failure Has No Visible Error

Severity: High

Location: Booking creation dialog.

Steps to reproduce:

1. Open `Add booking`.
2. Select a prescription.
3. Choose `Create new facility`.
4. Fill facility and booking fields.
5. Click `Save booking`.

Actual behavior:

- `POST /api/v1/facilities` succeeded.
- `POST /api/v1/patients/:patientId/bookings` failed with `401 Unauthorized`.
- The dialog remained open.
- No visible error message appeared in the form.

Expected behavior:

The user should see an error near the action area or at the top of the dialog:

```text
Booking was not saved because your session expired. Sign in again and retry.
```

If the error is not session-related:

```text
Booking was not saved. Check the required fields and try again.
```

Why this is a problem:

The user sees no clear confirmation or failure state. They may retry, close the dialog, or assume the booking was saved. The facility side effect makes this more confusing because a related record was created but the booking was not.

Evidence:

- [Booking save failure with no visible error](./evidence/evidence-booking-save-401-no-visible-error.png)

Recommended fix:

- Add `errorMessage` state to booking page or dialog.
- Catch errors in `handleBookingSubmit`.
- Display the error in the dialog using a prominent inline alert.
- Preserve entered form data after failure.
- Treat `401` specially by prompting sign-in or session refresh.

### 3. Facility Creation and Booking Creation Are Not Atomic

Severity: High

Location: Booking creation with `Create new facility`.

Steps to reproduce:

1. Use the booking create flow.
2. Select `Create new facility`.
3. Submit and cause booking creation to fail.

Actual behavior:

The facility is created before the booking request. If the booking request fails, the facility remains created.

Expected behavior:

Either:

- Backend supports a single booking-create request with nested facility creation and transaction boundaries.
- UI creates the facility only after booking can be guaranteed.
- UI clearly warns and recovers from partial creation.

Why this is a problem:

Users can accidentally create orphaned facilities while trying to create bookings. Retrying may create duplicates.

Recommended fix:

- Prefer a backend transactional endpoint such as `POST /patients/:patientId/bookings` with optional `facility` payload.
- If kept client-side, detect failure after facility creation and offer to reuse the created facility on retry.

### 4. Document Linked-Record Selector Omits Prescription Type and Subtype

Severity: Medium

Location: Documents page, `Linked record` dropdown.

Steps to reproduce:

1. Create two prescriptions.
2. Open patient documents.
3. Open `Linked record`.

Actual behavior:

Prescription options show:

```text
Prescription
May 21, 2026

Prescription
May 20, 2026
```

Expected behavior:

Prescription options should include type and subtype:

```text
Prescription - Visit / Neurology
Issued May 21, 2026

Prescription - Visit / Cardiology
Issued May 20, 2026
```

Why this is a problem:

Dates help, but two prescriptions issued on the same day would still be ambiguous. Users need to identify what the record is, not just when it was issued.

Evidence:

- [Document linked-record dropdown](./evidence/evidence-documents-linked-record-dropdown.png)

Recommended fix:

- Reuse the same prescription label formatter as booking.
- Keep two-line select options, but make the first line specific.

### 5. Header and Page Headings Clip or Become Unreadable on Narrow Screens

Severity: High

Location: App shell, patient overview, settings page, mobile viewport.

Steps to reproduce:

1. Resize browser to `390 x 844`.
2. Open settings or patient overview.
3. Inspect top header and hero headings.

Actual behavior:

- `Care coordination workspace` is partly positioned above the viewport.
- On mobile, the header title wraps into a tall clipped block.
- Page headings become oversized in narrow columns.
- At 800px, patient overview compresses the patient name into a narrow column.

Expected behavior:

- Header title should remain visible, truncate, or hide at narrow widths.
- Hero headings should stack vertically and use compact sizes.
- Patient overview should place actions below title on narrow layouts.

Evidence:

- [Mobile header and heading clipping](./evidence/evidence-mobile-header-heading-clipping.png)
- [800px overview layout compression](./evidence/evidence-overview-800.png)

Recommended fix:

- Add responsive styles for `AppTopNav`.
- Hide or truncate `.app-top-nav__title` below tablet widths.
- Avoid two-column hero layouts on narrow widths.
- Cap heading sizes inside cards and panels.

### 6. Patient Sidebar Context Says "Current" Instead of the Patient Name

Severity: Medium

Location: Sidebar patient navigation.

Steps to reproduce:

1. Open any patient-scoped route.
2. Inspect the sidebar patient section.

Actual behavior:

Sidebar shows:

```text
Patient
Current
```

Expected behavior:

Sidebar should identify the current patient:

```text
Patient
Maria Rossi
```

or:

```text
Current patient
Maria Rossi
```

Why this is a problem:

Caregivers may switch between patients. The navigation does not confirm which patient context they are in.

Recommended fix:

- Load patient summary in layout for patient-scoped routes.
- Show patient full name in the sidebar badge.
- Use a fallback such as `Current patient` only while loading.

### 7. Related Document Panels Are Not Rendered

Severity: Medium

Location: Prescriptions and bookings pages.

Steps to reproduce:

1. Open prescriptions.
2. Open bookings.
3. Inspect console.

Actual behavior:

Console warning:

```text
Failed to resolve component: RelatedDocumentsPanel
```

Expected behavior:

The component should render or the placeholder should be removed.

Why this is a problem:

The UI appears to intend document visibility in context, but the component is missing from the page registration/import. This reduces trust and hides linked-file affordances.

Recommended fix:

- Import `RelatedDocumentsPanel` in both pages where it is used.
- Add a component smoke test so unresolved components fail CI.

### 8. Browser Page Title Is Not Route-Specific

Severity: Low

Location: All tested routes.

Actual behavior:

Browser title remains:

```text
Medical Manager
```

Expected behavior:

Examples:

```text
Patients - Medical Manager
Maria Rossi - Overview - Medical Manager
Maria Rossi - Prescriptions - Medical Manager
Maria Rossi - Bookings - Medical Manager
Settings - Medical Manager
```

Why this is a problem:

Browser tabs, history entries, and screen-reader context are less useful.

Recommended fix:

- Add route metadata for titles.
- Update `document.title` after navigation.
- Include patient name when available.

### 9. Booking Cards Use Generic Title "Booking"

Severity: Medium

Location: Booking list cards.

Actual behavior:

Every booking card title is rendered as:

```text
Booking
```

Expected behavior:

Use a descriptive card title:

```text
Jun 15, 2026 10:00 - Centro Diagnostico Delta
```

or:

```text
Booked visit - Jun 15, 2026 - Centro Diagnostico Delta
```

Why this is a problem:

Users scanning multiple bookings cannot distinguish them from card titles.

Recommended fix:

- Use appointment date/time and facility name as the primary title.
- Keep status as a badge.
- Move generic type text to an eyebrow if needed.

### 10. Some Accessible Names Are Vague

Severity: Low

Location: Top navigation and select clear buttons.

Actual behavior:

- User dropdown button is exposed as `Expand`.
- Select clear buttons are exposed as `Clear`.

Expected behavior:

Examples:

```text
Open user menu for QA Reviewer
Clear prescription link
Clear facility
```

Why this is a problem:

Keyboard and screen-reader users need field-specific action names.

Recommended fix:

- Add explicit `aria-label` values where Quasar default labels are vague.
- Use field-specific clear labels where possible.

## Specific Review Areas

### Page Titles and Headings

- In-app headings are generally understandable but too large for constrained layouts.
- Browser title is not route-specific.
- The shell title clips in multiple viewports.

### Links and Clickable Labels

- Sidebar links are understandable.
- Patient context label should show the patient name instead of `Current`.
- User menu accessible name should be more descriptive than `Expand`.

### Dropdown Option Labels

- Booking prescription dropdown is unsafe because duplicate prescriptions have identical labels.
- Document linked-record dropdown is better but still incomplete for prescriptions.
- Facility dropdown labels are mostly useful because they include name and city.

### Record Selectors

Record selectors should follow a consistent display pattern:

```text
<Entity type> - <primary distinguishing detail> - <date/status/facility>
```

Recommended formats:

```text
Prescription - Visit / Cardiology - Issued May 20, 2026
Booking - Jun 15, 2026 10:00 - Centro Diagnostico Delta - Booked
Patient - Maria Rossi - General file
Facility - Centro Diagnostico Delta - Rovigo
```

### Booking Creation Flow

- The form contains the needed fields, but the prescription selector is ambiguous.
- Save failure handling is inadequate.
- Creating a new facility inside the booking flow can leave partial side effects.

### Prescription Linking Flow

- Prescription list cards are clear.
- Linking contexts do not reuse the list card clarity.
- Prescription type, subtype, issue date, and expiration date should be visible when linking.

### Forms, Validation, and Error Messages

- Patient required-name validation worked.
- Booking save errors were not shown.
- Booking form should show async failure messages and session-expired handling.

### Navigation and Information Architecture

- Main modules are easy to find.
- Patient-scoped navigation should identify the patient.
- Settings are discoverable through the sidebar and user menu.

### Empty States and Loading States

- Empty states are generally understandable and task-oriented.
- Loading states were not deeply stressed.
- Failed async states need more visible feedback.

### Accessibility Concerns

- Header clipping affects all users and is especially harmful for screen magnification.
- Vague accessible names reduce screen-reader clarity.
- Browser title does not give route context.
- Selector options need unique accessible names, not only unique visual captions.

## Recommended Improvements

### Shared Label Formatters

Create shared formatter utilities for records that appear in selectors.

Prescription label:

```text
Visit - Cardiology - Issued May 20, 2026 - Expires Aug 20, 2026
```

Prescription two-line option:

```text
Visit / Cardiology
Issued May 20, 2026 - Expires Aug 20, 2026
```

Booking label:

```text
Jun 15, 2026 10:00 - Centro Diagnostico Delta - Booked
```

Document linked-record labels:

```text
Patient - Maria Rossi
General patient file

Prescription - Visit / Cardiology
Issued May 20, 2026

Booking - Jun 15, 2026 10:00
Centro Diagnostico Delta - Booked
```

### UI Copy Improvements

Recommended replacements:

- `Prescription link` -> `Linked prescription`
- `No linked prescription` -> `No prescription linked`
- `Facility` -> `Booking facility`
- `Create new facility` -> `Add new facility`
- Sidebar `Current` -> patient full name, for example `Maria Rossi`
- Booking card title `Booking` -> appointment date and facility

### Layout and Interaction Changes

- Collapse patient hero actions under the heading below tablet widths.
- Hide or truncate the top-nav title on mobile.
- Use route-specific document titles.
- Show async form errors inline near submit actions.
- Preserve form values after failed saves.

### Backend/API Changes

Recommended backend support:

- Add an atomic booking creation endpoint that accepts either `facilityId` or nested `facility`.
- Ensure prescription list APIs include all fields needed by selectors: `prescriptionType`, `subtype`, `issueDate`, `expirationDate`, and optionally `notes`.
- Consider server-provided `displayLabel` only if frontend and backend can share formatting rules consistently.

## Priority Action Plan

### Fix Immediately

- Update booking prescription dropdown to include type, subtype, issue date, and expiration date.
- Add visible booking save error handling.
- Make create-facility-with-booking atomic or recoverable.
- Fix mobile/tablet header and hero clipping.
- Import or remove `RelatedDocumentsPanel` in booking and prescription pages.

### Fix Next

- Improve document linked-record labels.
- Show current patient name in sidebar patient context.
- Replace generic booking card title with date/facility/status.
- Add route-specific browser titles.
- Add tests for duplicate prescription selector labels.

### Nice-to-Have Improvements

- Improve accessible names for user menu and clear buttons.
- Add visual regression checks for 390px, 800px, and 1440px.
- Add component smoke tests that catch unresolved Vue components.
- Add standardized record-label utilities for future task, notification, and care-event selectors.
