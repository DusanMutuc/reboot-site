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

## Important security boundary

`SUPABASE_SERVICE_ROLE_KEY` bypasses row-level security. It is server-only and must never be committed, logged, embedded in client code, or sent to a browser. Browser and user-session code uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Database structure is split between the live Supabase project and the small migration tail in `sql/`. The three checked-in SQL files are not a complete reconstruction of the database.
