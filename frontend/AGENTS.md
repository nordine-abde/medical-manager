# Frontend Guidelines

## Structure

Follow the frontend shape defined in `docs/tecnical/implementation-plan.md`.

- keep route bootstrapping in `src/main.ts`
- keep one-off startup logic in `src/boot/`
- keep route definitions and guards in `src/router/`
- keep shared shell components in `src/layouts/` and `src/components/`
- keep domain-specific pages, stores, and components inside `src/modules/<domain>/`
- keep translatable labels in `src/i18n/` from the start

## Routing Pattern

- public auth routes live under `/auth`
- protected application routes live under `/app`
- enforce access through route meta plus `src/router/guards.ts`, not ad hoc checks inside pages

## State Pattern

- prefer small Pinia stores scoped by domain, starting with `src/modules/auth/store.ts`
- keep backend auth cookie state behind `src/modules/auth/store.ts` actions; pages should call store methods instead of talking to `/api/v1/auth` directly
- use relative `/api/v1/auth/*` requests with `credentials: "include"` and rely on the Vite `/api` proxy for local frontend-to-backend auth flows
- Keep authenticated profile hydration inside `src/modules/auth/store.ts`: restore the auth session first via `/api/v1/auth/session`, then load `/api/v1/users/me` for app-specific user fields like `preferredLanguage`.
- Keep authenticated profile writes in `src/modules/auth/store.ts` as well: pages like `/app/settings` should call a store action that patches `/api/v1/users/me` so full name, preferred language, and the shared i18n locale stay in sync after save and on later restores.
- Treat the shell language selector as profile state, not local-only UI state: update the i18n locale immediately in the shell component and persist the change through the auth store.
- Keep patient CRUD fetches behind `src/modules/patients/store.ts` and `src/modules/patients/api.ts`; patient pages should coordinate dialogs, filters, and navigation without calling `/api/v1/patients` directly.
- Keep patient sharing behind `src/modules/patients/store.ts` too: patient overview pages should load/add/remove collaborators through store actions wired to `/api/v1/patients/:patientId/users`, and the UI should not offer self-removal for the currently authenticated account.
- Keep the patient overview summary behind the patients store as well: load `/api/v1/patients/:patientId/overview` through `src/modules/patients/store.ts`, and refresh that snapshot after patient child-resource writes so the care-summary cards stay aligned with backend aggregates.
- When patient overview needs a child-resource teaser such as medications, render a lightweight aggregate from the overview payload and use an in-page jump into the full workspace section instead of introducing a second management route or duplicating the full child-store state.
- Patient-context frontend routes should live under `/app/patients/:patientId/...`; when the shell needs an overview link, derive it from `route.params.patientId` instead of hardcoding a patientless path.
- For patient-context deep links that target async overview sections, do not rely only on router `scrollBehavior`; keep the hash in the URL, but scroll again from `PatientOverviewPage.vue` after `loadPage()` finishes so anchors to task or booking cards still resolve once the data-driven DOM is mounted.
- Keep patient-owned child resources in their own frontend domain modules such as `src/modules/conditions/`; let patient overview pages compose those stores and dialogs instead of expanding `src/modules/patients/store.ts` into a catch-all patient workspace store.
- Keep medication CRUD inside `src/modules/medications/`; patient overview should load/create/update/archive through the medications store, reuse active condition options from the conditions store, and render linked prescriptions as read-only context from `medication.linkedPrescriptions` rather than editing prescription linkage in the medication form.
- Keep patient documents inside `src/modules/documents/`; the documents page should load patient-owned related-entity options by composing the existing instructions, prescriptions, bookings, and medications stores, and it should trust the backend-provided `downloadUrl` instead of rebuilding download paths in the UI.
- When a `script setup` page uses helper functions inside top-level computed state or `watch(..., { immediate: true })`, define those helpers before the computed/watch or use function declarations; later `const` helpers can still be in the temporal dead zone during initial evaluation.
- For patient-owned child resources that need both a filtered list and a deeper read view, keep list state in a domain store, compose the list into `PatientOverviewPage.vue`, and use a dedicated detail route under `/app/patients/:patientId/<resource>/:resourceId` for preserved narrative content and future linked workflows.
- For task editing, keep general field updates on `/api/v1/tasks/:taskId` and task workflow state changes on `/api/v1/tasks/:taskId/status`; the backend keeps `completedAt` aligned through the dedicated status endpoint.
- For patient child-resource action rows that mix conditional `q-btn` components, give each button a stable `:key`; otherwise Vue may reuse a sibling button instance across workflow-state changes and keep the wrong click handler attached.
- For prescription editing, keep general field updates on `/api/v1/prescriptions/:prescriptionId` and workflow state changes on `/api/v1/prescriptions/:prescriptionId/status`; the backend derives requested, available, and collected timestamps through the dedicated status endpoint.
- For booking management, load shared facilities alongside patient bookings inside the bookings store and create new facilities through that same store before saving the booking so the facility picker stays current without a separate page refresh.
- For clearable Quasar text filters, treat the bound model as `string | null` or normalize with `?? ""` before calling string helpers like `.trim()`: clearing a `q-input clearable` can emit `null` and trigger runtime errors in computed filters.
- Keep the global caregiver task workspace inside `src/modules/tasks/`: load `/api/v1/tasks` through the tasks store, let the page layer apply local patient-name filtering and grouping, and navigate back into patient overview or instruction detail routes instead of duplicating task detail pages.
- Keep patient timeline reads in `src/modules/patients/`: load `/api/v1/patients/:patientId/timeline` through the patients store, keep the timeline page as a thin patient-context route under `/app/patients/:patientId/timeline`, and map each normalized `relatedEntity` back into existing overview anchors or instruction detail routes instead of creating duplicate detail pages.
- Keep the global `/app/timeline` workspace in `src/modules/patients/` as well: load the top-level `/api/v1/timeline` feed through the patients store, apply patient-name and date filtering in the page layer, and reuse the same related-entity navigation mapping as patient timeline pages so cross-patient history never invents duplicate detail routes.
- Keep patient notification settings in `src/modules/notifications/` under `/app/patients/:patientId/notifications`; load and save the whole Telegram reminder form through the notifications store so pages stay thin and all three reminder-rule toggles keep sharing one patient-scoped chat ID.
- Keep notification delivery actions in `src/modules/notifications/store.ts` too: page-level buttons such as processing pending Telegram reminders should call store methods that hit `/api/v1/notifications/deliveries/process`, then derive any patient-scoped success state from the returned logs instead of issuing ad hoc fetches from the page.
- Keep shell-page copy centralized in `src/i18n/`: when a page already uses translation keys, move any remaining field labels, helper hints, and summary row labels into the locale files too so English and Italian stay aligned and browser verification can spot untranslated fragments quickly.
- Vue i18n treats raw `@` characters inside message strings as linked-message syntax, so placeholder or helper copy that needs an email example should avoid literal `@` characters or escape them deliberately.

## Commands

Run these from `frontend/` after frontend edits:

- `bun run typecheck`
- `bun run lint`
- `bun run test`
