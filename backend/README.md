# Backend

## Environment

Copy `backend/.env.example` to `backend/.env` and adjust values as needed.

Supported variables:

- `APP_NAME`
- `API_PREFIX`
- `HOST`
- `PORT`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET`
- `DATABASE_URL`
- `DATABASE_SCHEMA`
- `DATABASE_SSL`
- `DATABASE_MAX_CONNECTIONS`
- `DOCUMENTS_STORAGE_ROOT`

`DATABASE_URL` is the canonical PostgreSQL connection setting for the backend and migration runner.
`BETTER_AUTH_URL` should point to the backend base URL, and `BETTER_AUTH_SECRET` must be a long random secret.
`DOCUMENTS_STORAGE_ROOT` should point to a writable directory for uploaded files. The default resolves outside the repository to `../../medical-manager-data/documents` from `backend/`.

## Local PostgreSQL

Start a local database from `backend/`:

```bash
docker compose up -d
```

This starts PostgreSQL on `localhost:5432` with credentials that match `.env.example`.

## Container Image

Build the backend image from `backend/`:

```bash
docker build -t medical-manager-backend .
```

The home-server deployment can use the Git context `https://github.com/nordine-abde/medical-manager.git#main:backend`, so the Dockerfile must be pushed to `main` before that remote build context can use it.

## Database Commands

Run these from `backend/`:

```bash
bun run db:check
bun run db:migrate
```

- `db:check` verifies that the configured database is reachable.
- `db:migrate` applies SQL files from `src/db/migrations/` in filename order using `DATABASE_SCHEMA` as the local PostgreSQL `search_path`.

## Supported Test Workflow

The backend test suite has two supported paths:

- `bun test` runs the full suite. Most auth and route tests use in-memory adapters and do not need PostgreSQL.
- Database-backed integration tests use temporary PostgreSQL schemas inside the database pointed to by `DATABASE_URL`, so they require the local database from `docker compose up -d` plus the app migrations applied with `bun run db:migrate`.

Recommended local verification flow from `backend/`:

```bash
docker compose up -d
bun run db:migrate
bun run typecheck
bun run lint
bun test
```

Database-backed tests create isolated schemas, seed only the rows they need, and drop those schemas after each run. Keep `DATABASE_URL` pointed at a disposable local development database when running the suite.

## Authentication Routes

The backend now exposes Better Auth under `/api/v1/auth/*` and adds thin JSON wrappers for:

- `POST /api/v1/auth/sign-up`
- `POST /api/v1/auth/sign-in`
- `GET /api/v1/auth/session`
