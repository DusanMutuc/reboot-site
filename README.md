# Reboot website

Reboot is a Next.js 15 portal backed by Supabase Auth, Postgres, PostgREST RPCs, and Supabase Storage. It contains member dashboards, KPI and attendance tracking, coaching workspaces, course and library content, smart documents, partnerships, achievements, admin tools, and external integrations.

## Documentation

- [Agent database guide](docs/AGENT_GUIDE.md) — start here when writing maintenance or migration scripts.
- [Database architecture](docs/DATABASE.md) — identity model, domain relationships, lookups, storage, and mutation rules.
- [Generated public schema](docs/generated/supabase-public-schema.md) — live public relations, columns, keys, and RPC signatures.
- [Website architecture and API](docs/WEBSITE.md) — routes, authentication, authorization, handlers, and integrations.

The generated schema is a snapshot, not a migration history. Refresh it after database changes:

```powershell
npm.cmd run docs:db
```

The generator reads PostgREST schema metadata only. It does not export table rows.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Fill the values using the project’s approved secret-sharing process.
3. Install and run:

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:3000`.

## Local Supabase testing on Windows

Install Node.js/npm and run Docker Desktop with Linux containers. From this checkout:

```powershell
npm.cmd ci
npm.cmd run db:start
powershell -NoProfile -File .\tools\start-local.ps1
```

The launcher reads this project's running local Supabase stack, requires the API at
`http://127.0.0.1:54321`, and uses its local keys for the app process without changing
`.env.local`. The app opens at `http://127.0.0.1:3015` and writes generated files to
`.next-local`, separate from the normal `.next` dev/build output. The launcher selects
the local database; other integration settings still come from your environment, so use
development credentials for any external services you exercise.

Useful commands:

- `npm.cmd run db:status` checks the local stack (its output includes local API keys).
- `npm.cmd run db:stop` stops the local stack.
- `npm.cmd run db:reset` explicitly resets the **local** database and reapplies the checked-in
  Supabase migrations. It erases local data; save anything you need before using it.

These commands do not download production data or apply migrations to the remote database.
The initial migration is a schema snapshot, not an export of users, roles, courses, or resources.
There is no checked-in `supabase/seed.sql`; a useful test catalogue needs separate local fixtures
or an approved local data restore. Later changes in `sql/` are not automatically replayed by the
Supabase migration commands, so a fresh reset is not a complete replica of current production.
Compare the relevant schema and fixtures before relying on local integration-test results.

`supabase/config.toml` uses the project ID `reboot-site` and fixed local ports. Worktrees on the
same machine share that local stack; they are not separate database copies. Stop the app before
resetting it. Production migration procedures remain in the release runbooks.

## Important security boundary

`SUPABASE_SERVICE_ROLE_KEY` bypasses row-level security. It is server-only and must never be committed, logged, embedded in client code, or sent to a browser. Browser and user-session code uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Database structure is documented by the live schema reference, the snapshot and migrations in
`supabase/migrations/`, and later scripts in `sql/`. These files do not include a production data
export or replace the release-specific migration checks.
