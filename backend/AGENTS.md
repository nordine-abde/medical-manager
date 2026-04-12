# Backend Guidelines

## Structure

Follow the backend shape defined in `docs/tecnical/implementation-plan.md`.

- `src/app.ts` owns global plugins, top-level error handling, and API route mounting
- `src/server.ts` is the executable entrypoint only
- `src/modules/<domain>/` should keep route definitions close to that domain
- `src/shared/` is the home for cross-module middleware, errors, types, and utilities
- `src/db/` is reserved for migrations, schema definitions, and repository implementations

## Module Pattern

Prefer a Spring Boot style split inside each domain module:

- route layer for Elysia handlers and request mapping
- validation schema layer for transport validation
- service layer for business rules
- repository layer for persistence

Keep route handlers thin and move reusable domain logic into services or shared utilities.
- For patient-owned child resources, keep list and create routes nested under `/patients/:patientId/...`, keep child mutation routes on the resource ID when the UI only has that child ID, and enforce authorization through a `patient_users` join that returns `404` for inaccessible patient or child records.
- Patient sharing stays in the patients module too: list collaborators at `/patients/:patientId/users`, accept add requests with a single `identifier` field that may be either user ID or email, return `409` for duplicate membership, and treat missing patient access as the same `404 patient_not_found` boundary used by other patient-scoped routes.
- Patient dashboard or overview endpoints should stay in the patients module and aggregate existing patient-scoped tables read-only in the patients repository, so summary payloads reuse the source-of-truth child records instead of duplicating workflow state in a separate module.
- When the patient overview needs child-resource highlights, keep the aggregate payload lightweight and actionable, for example the next medication renewal signal, while the full CRUD detail remains in that child module's own routes.
- Patient timeline aggregation also belongs in the patients module: expose it as `/patients/:patientId/timeline`, aggregate existing child-resource tables in one repository query, and return a normalized `relatedEntity { type, id }` payload so frontend timeline pages can navigate without module-specific response shapes.
- When a patient-owned child record stores optional links to other patient-owned records, validate those foreign keys against the same `patient_id` in the repository before insert or update; plain UUID foreign keys alone do not prevent cross-patient linking mistakes.
- Facilities are shared reference data across patients, so keep facility routes authenticated but top-level under `/facilities`; bookings stay patient-scoped and should validate same-patient task and prescription links plus facility existence in the repository layer.
- For task dependencies, validate same-patient ownership and circular references in the repository layer, and derive the API-facing blocked state from incomplete prerequisite tasks instead of trusting the stored task status alone.
- Keep cross-patient caregiver task workspaces in the tasks module as a top-level authenticated `/tasks` query with a high-level `state` filter (`pending`, `blocked`, `overdue`, `upcoming`, `completed`); return nested patient summary data with each task so the frontend can navigate without a second lookup.
- For doctor-authored narrative fields such as medical instruction `original_notes`, preserve the submitted text exactly; only trim optional label-style fields like doctor name, specialty, or target timing text.

## Commands

Run these from `backend/` after backend edits:

- `bun run typecheck`
- `bun run lint`
- `bun test`
- `bun run db:migrate`

## Database Pattern

- Keep database connection parsing in `src/config/env.ts`, use the lazy client in `src/db/client.ts`, and add SQL migrations under `src/db/migrations/` so tests do not require a running PostgreSQL instance.
- The migration runner now sets PostgreSQL `search_path` to `DATABASE_SCHEMA` inside each transaction, so unqualified `CREATE TABLE` statements in migration files land in the configured schema.
- Better Auth currently owns the `"user"` table with a `text` primary key, so any app table that references authenticated users should use `text` foreign keys to `"user"(id)` unless the auth schema changes first.
- When a repository needs database-backed integration tests, accept the schema name as a constructor parameter and use schema-qualified table names instead of relying on the process default `search_path`; this keeps temporary test schemas isolated from local development data.
- When repository SQL needs casts to custom PostgreSQL enum types, schema-qualify the enum type name too; temporary test schemas will not resolve bare enum names outside the active `search_path`.
- Backend `bun test` mixes memory-only auth tests with PostgreSQL integration tests that create temporary schemas under `DATABASE_URL`; before relying on the full suite locally, start the backend Postgres service and run `bun run db:migrate` against that same database so shared baseline tables exist for the tests that reuse the app connection.
- When a patient-owned table must prevent cross-patient links at the database layer, prefer a composite foreign key that includes `patient_id` on both sides, such as `(patient_id, medication_id) -> medications(patient_id, id)`, instead of relying on a bare UUID reference.
- If a later migration needs a composite foreign key back to an existing patient-owned table that only has a primary key on `id`, add a matching `unique (patient_id, id)` constraint on the referenced table in that migration before creating the new foreign key.
- For medication APIs, keep linked prescription context read-only and derive it from `prescriptions.medication_id` within the medications module; do not duplicate prescription linkage state onto the medication row just to satisfy API responses.
- For medication renewal work, link tasks through `tasks.medication_id` and keep renewal due-date defaults derived from `medications.next_gp_contact_date`; renewal tasks should not copy medication scheduling rules into a second workflow-specific table.
- For document metadata, keep patient ownership as a normal foreign key but model workflow attachment as `related_entity_type` plus `related_entity_id`; this allows document rows to support future care-event links before the `care_events` table exists, so concrete entity existence and same-patient checks must live in the documents module.
- For document binaries, keep filesystem storage rooted in a configurable directory outside the backend build output, derive the stored extension from an allowlisted MIME-type map, and never reuse user-supplied filenames for on-disk paths.
- For document APIs, validate patient access plus same-patient related-entity ownership before writing the file, keep list and upload routes nested under `/patients/:patientId/documents`, and expose metadata plus binary download as separate `/documents/:documentId` and `/documents/:documentId/download` routes.
- For care events, use the same patient-child route split as bookings and tasks: list/create under `/patients/:patientId/care-events`, get/update under `/care-events/:careEventId`, and validate optional task or booking links against the same `patient_id` in the repository while treating facilities as shared reference data.
- For notification persistence, keep patient-specific reminder preferences in `notification_rules` with a unique `(patient_id, rule_type)` key, and track outbound delivery attempts separately in `notification_logs` with nullable workflow links plus a status-driven `sent_at` check so pending rows stay unsent while sent or failed rows always capture their delivery timestamp.
- Keep reminder generation in the notifications module as a top-level authenticated job-style route, derive overdue and upcoming candidates directly from existing task, booking, and medication tables, and make generation idempotent by skipping any workflow item that already has a `pending`, `sent`, or `failed` notification log for the same trigger.
- Keep Telegram delivery processing in the notifications module too: read pending `notification_logs`, send them through an injected Telegram client, and persist delivery outcomes back onto the same row using `status`, `sent_at`, `error_message`, and `external_message_id` rather than creating a second delivery-tracking table.
- Keep scheduled reminder or recurrence entrypoints in the notifications module as authenticated job-style routes; when they need to create recurring tasks, insert the next `tasks` row from completed source tasks with `auto_recurrence_enabled = true`, preserve the source recurrence settings on the new row, and rely on same-window duplicate checks against patient, task identity fields, and next due date instead of adding a separate recurrence ledger.
- Keep patient notification settings in the notifications module as `/patients/:patientId/notifications/settings`; the service should fan the UI payload out to one `notification_rules` row per rule type while treating `telegram_chat_id` as a shared patient-scoped destination reused across overdue, upcoming-booking, and medication-renewal reminders.

## Auth Pattern

- Keep the Better Auth server instance in `src/auth/`, expose backend-facing routes from `src/modules/auth/`, and prefer injecting custom auth instances into `createApp()` for tests so auth flows can run against the memory adapter without PostgreSQL.
- Prefer thin wrapper routes for Better Auth mutations used by the frontend (`sign-in`, `sign-up`, `sign-out`) so local dev can stay on the app origin without depending on Better Auth handler origin checks.
- When adding app-owned user profile fields, define them in `src/auth/index.ts` as Better Auth `user.additionalFields` and mirror the backing database column in a numbered SQL migration so session payloads and auth storage stay aligned.
- Keep profile reads and writes behind `/api/v1/users/me`; for writes, proxy Better Auth's `/api/v1/auth/update-user` handler and then read the refreshed session instead of duplicating user-update logic in a separate repository.
- When proxying `/api/v1/users/me` updates into Better Auth, require the session before forwarding and map app-facing `fullName` to Better Auth's `name` field; `preferredLanguage` can pass through unchanged.
- When proxying Better Auth mutations through an internal `authInstance.handler()` request, set the forwarded `origin` header to `betterAuthConfig.baseUrl`; otherwise local frontend dev requests proxied from `http://127.0.0.1:9000` can fail Better Auth's origin check even though the backend wrapper route is same-origin to the browser.
