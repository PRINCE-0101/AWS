# CampusForge API

**CampusForge** is a concurrency-safe campus workshop registration API built for the AWS Student Builder Group Web Development challenge.

The project deliberately goes beyond CRUD: it models **Users → Workshops → Registrations**, uses short-lived access tokens plus rotating refresh tokens, enforces role-based access, and protects the most important invariant — **confirmed registrations can never exceed workshop capacity** — with a PostgreSQL transaction and row-level locking.

## Why this design is interesting

A normal `if (seats_held < capacity) INSERT ...` is unsafe under concurrent requests. CampusForge serializes registration attempts for the same workshop with `SELECT ... FOR UPDATE`. The database becomes the authority for the capacity invariant instead of an application-level check-then-write.

It also uses:

- `UNIQUE(workshop_id, user_id)` to prevent duplicate registrations.
- An idempotency key for safe client retries.
- Refresh-token rotation and server-side revocation.
- Explicit `ADMIN`, `ORGANIZER`, and `STUDENT` roles.
- Pagination, filtering, and safe allow-listed sorting.
- Automated tests including a real concurrent-registration test.

## Stack

Node.js 20+, Express, PostgreSQL 16, JWT, bcrypt, Zod, Jest, Supertest.

## Quick start

### 1. Requirements

Install Node.js 20+ and Docker Desktop.

### 2. Configure environment

```bash
copy .env.example .env
```

On macOS/Linux:

```bash
cp .env.example .env
```

Replace both JWT secrets with long random strings.

### 3. Start PostgreSQL

```bash
docker compose up -d
```

### 4. Install dependencies

```bash
npm install
```

### 5. Create tables and demo data

```bash
npm run migrate
npm run seed
```

### 6. Start API

```bash
npm run dev
```

Health check: `GET http://localhost:4000/health`

## Demo accounts

All demo accounts use `Builder@123`.

| Role | Email |
|---|---|
| ADMIN | admin@campusforge.local |
| ORGANIZER | organizer@campusforge.local |
| STUDENT | student@campusforge.local |

Public registration always creates a `STUDENT`; privileged roles are not self-assignable.

## API endpoints

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`

### Workshops

- `GET /api/workshops?page=1&limit=10&search=aws&sort=starts_at&order=asc`
- `GET /api/workshops/:id`
- `POST /api/workshops` — ADMIN/ORGANIZER
- `PATCH /api/workshops/:id` — ADMIN/owner ORGANIZER
- `DELETE /api/workshops/:id` — ADMIN/owner ORGANIZER

### Registrations

- `POST /api/workshops/:id/register` — authenticated user
- `DELETE /api/workshops/:id/register` — authenticated user
- `GET /api/workshops/:id/registrations` — ADMIN/ORGANIZER

For registration, optionally send:

```http
Idempotency-Key: a-client-generated-key-123
```

## Concurrency design

Registration follows this transaction:

```text
BEGIN
  |
  +-- SELECT workshop ... FOR UPDATE
  |
  +-- SELECT existing registration ... FOR UPDATE
  |
  +-- check seats_held < capacity
  |
  +-- INSERT/restore registration
  |
  +-- increment seats_held
  |
COMMIT
```

The row lock means two requests cannot simultaneously read the same available seat count and both write past capacity. A second request waits until the first transaction commits, then observes the new `seats_held` value.

## Tests

Run:

```bash
npm test
```

The suite covers health, RBAC, pagination/filtering, duplicate registration protection, and the core concurrency invariant. The concurrency test creates an event with capacity 3 and fires 8 registration requests concurrently; exactly 3 should succeed.

## Suggested reviewer demo

1. Login as the organizer.
2. Create a workshop with capacity `3`.
3. Login/create several student accounts.
4. Register three students.
5. Attempt a fourth registration and show `409 WORKSHOP_FULL`.
6. Run `npm test` and point out the concurrent registration test.
7. Explain why `SELECT ... FOR UPDATE` is required and why an application-level `if` is not enough.

## Project structure

```text
src/
  config/       environment + PostgreSQL pool
  controllers/  HTTP input/output layer
  middleware/   auth, RBAC, request IDs, errors
  routes/       API route definitions
  services/     business logic and transactions
  utils/        JWT and utility helpers
db/
  schema.sql    relational schema + constraints
  migrate.js
  seed.js
tests/
  api.test.js
```

## Security notes

This is a challenge/demo project. For production deployment, use a managed secret store, HTTPS-only refresh-token cookies or another secure token transport, stricter CORS, rate limiting, audit logging, and a production-grade migration system.
