# Repository Guidelines

## Project Structure & Module Organization

This repository now contains the initial backend and frontend scaffolds for the medical care management app. The main source of truth still lives in `docs/`, and executable code now lives in both `backend/` and `frontend/`:

- `backend/`: Bun + ElysiaJS backend scaffold aligned with `docs/tecnical/implementation-plan.md`
- `frontend/`: Quasar + Vue frontend scaffold with protected shell routing and auth boot placeholders
- `docs/funcional/functional-requirements.md`: product scope and user workflows
- `docs/tecnical/`: architecture, schema, API, roadmap, and UI planning
- `scripts/ralph.sh`: helper loop for the Ralph agent workflow
- `skills-lock.json`: pinned skill metadata for local agent tooling

## Build, Test, and Development Commands

Current useful commands are:

- `bash scripts/ralph/ralph.sh --tool codex 5`: run the local Ralph loop for up to 5 iterations
- `git status`: verify the working tree before and after edits
- `rg "<term>" docs scripts`: search requirements or technical notes quickly
- `cd backend && bun install`: install backend dependencies
- `cd backend && bun run dev`: start the backend locally with file watching
- `cd backend && bun run typecheck`: run the backend TypeScript checks
- `cd backend && bun run lint`: run Biome linting for backend source and tests
- `cd backend && bun test`: run the backend test suite
- `cd frontend && bun install`: install frontend dependencies
- `cd frontend && bun run dev`: start the Quasar/Vite frontend locally
- `cd frontend && bun run typecheck`: run frontend Vue TypeScript checks
- `cd frontend && bun run lint`: run frontend Biome checks for TypeScript/config files
- `cd frontend && bun run test`: run frontend guard and utility tests

## Coding Style & Naming Conventions

Keep Markdown edits concise, structured, and task-oriented. Use ATX headings (`#`, `##`) and short paragraphs or flat bullet lists. Prefer lowercase, hyphenated file names like `implementation-plan.md`.

For shell scripts, keep Bash portable, use `set -e` or stricter guards where appropriate, and favor descriptive uppercase variable names for configuration values.

For frontend code, prefer small, focused components that encapsulate their own custom logic cleanly. Limit prop drilling and event emitting when possible, and prefer centralized Pinia stores to keep shared state and business logic in one place.

For backend code, even when using Bun and ElysiaJS, prefer a Spring Boot style architecture with clear separation between controller or router logic, business logic, and the data access layer.

Keep controllers and routers thin. They should handle request parsing, validation, authentication or authorization checks, and response mapping, but should not contain core business rules or direct data access logic.

In general, prefer small files with very specific responsibilities over large, multi-purpose files.

Apply the same principle to stores: prefer small, domain-focused Pinia stores instead of large global stores that accumulate unrelated responsibilities.

Do not place generic utility methods inside the business logic or service layer. Centralize reusable utility logic, such as string parsing, in dedicated utility files to avoid duplication. Before adding new helper code, first check whether a suitable utility file and method already exist; if they do, reuse them, otherwise extend the existing utility area instead of reimplementing the logic in multiple places.

Prefer clear, explicit names over short or ambiguous ones for files, functions, classes, stores, services, and variables.

Validate and normalize data at the boundaries of the system. Keep parsing, input validation, and transport-specific concerns out of the core business logic whenever possible.

Prefer pure, reusable functions for shared transformation logic when practical, and isolate side effects so behavior stays easier to understand and test.

Keep mapping logic explicit and centralized. Use dedicated mappers or transformation helpers for request-to-domain, domain-to-response, and persistence-to-domain conversions when needed.

Avoid duplicating business rules across services, stores, or controllers. If the same rule appears in more than one place, extract it into a shared and appropriately named abstraction.

## Testing Guidelines

The backend and frontend now have automated checks. Current expectations are:

- validate documentation changes by checking links, file paths, and terminology consistency
- dry-run shell changes where possible and keep usage examples executable
- document any new manual verification steps in the modified file or PR
- run `cd backend && bun run typecheck && bun run lint && bun test` for backend changes
- run `cd frontend && bun run typecheck && bun run lint && bun test` for frontend changes

If you add executable code in a new area, add a matching test command and note its location.

## Commit & Pull Request Guidelines

Current history uses very short subjects such as `docs`. Prefer concise, imperative commit messages with scope when useful, for example `docs: refine database schema`.

Pull requests should include:

- a brief summary of what changed
- linked issue or requirement document when relevant
- screenshots only for UI/mockup changes
- notes on follow-up work or gaps, especially when adding planned-but-not-yet-implemented structure

## Security & Configuration Tips

Do not commit real patient data, credentials, Telegram tokens, or `.env` files. Keep examples anonymized and use the docs to describe configuration until runtime services are added.
