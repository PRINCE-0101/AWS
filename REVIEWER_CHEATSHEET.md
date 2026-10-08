# CampusForge reviewer cheatsheet

Use these talking points during the technical review.

## Why PostgreSQL?

The challenge explicitly asks for transactions/row-level locking. PostgreSQL gives us reliable transactions, foreign keys, check constraints and `SELECT ... FOR UPDATE`.

## Why are Users, Workshops and Registrations separate tables?

They represent different entities and the registration is a many-to-many relationship between users and workshops. Foreign keys keep the relationship valid and `UNIQUE (workshop_id, user_id)` prevents duplicate registrations.

## Why isn't a normal capacity check enough?

A plain `if (seats_held < capacity)` is vulnerable to a race condition because two requests can read the same old value before either writes. The registration service locks the workshop row first and performs the capacity check, registration insert/update and counter increment in one transaction.

## What does FOR UPDATE do here?

It takes a row-level lock on the workshop inside the transaction. Other registration transactions for the same workshop wait until the first one commits or rolls back, then continue using the newest seat count.

## Why use short-lived access tokens + refresh tokens?

Access tokens are exposed more often, so a short lifetime limits their usefulness if leaked. Refresh tokens handle session continuity and are revocable/rotated server-side.

## Why store a refresh-token hash?

The database stores only a SHA-256 hash. A database leak therefore does not directly expose reusable refresh-token strings.

## What is idempotency doing?

A client may retry the same registration request because of a timeout. Reusing the same `Idempotency-Key` returns the original registration instead of creating another one.

## How is SQL injection avoided in sorting?

Sort fields are mapped through an allow-list (`created_at`, `starts_at`, `title`, `capacity`). User input is never inserted directly into the SQL except through that fixed mapping.

## What tests prove the requirements?

The test suite covers health, RBAC, organizer workflow, filtering/pagination, duplicate registration and a real concurrent-registration race test.
