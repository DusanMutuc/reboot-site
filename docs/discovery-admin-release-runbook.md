# Discovery admin release runbook

This release exposes the admin curation tools while keeping the member discovery redesign off.
It is deliberately a two-stage launch:

1. deploy the database infrastructure and admin UI;
2. populate and verify the catalogue, then separately enable member discovery.

No command in this document should be run against production from an unreviewed working tree.

## Release invariants

- The release diff contains no changes to the member homepage, member search endpoint, member
  discovery routes or member discovery client code.
- Admin discovery routes and coach resource selection are available.
- Members retain the exact legacy home, catalogue and search behavior from the production branch.
- The new `/discover` surface, recommendation UI and recommendation-feedback controls are not part
  of this release. They are added only in the later member launch.

## Current migration-history problem

Before the release preflight, the linked production project reported none of this repository's
migration versions in its history. The first file, `20260826000000_remote_schema.sql`, is a schema
snapshot of an already-existing database, not a migration that can safely be replayed over
production.

The safe solution is to establish an honest baseline only after comparing the snapshot with the
current production schema. Marking a migration as applied changes history; it does not prove the
schemas match.

## 1. Freeze and identify the release

- Review `git status` and create a release commit containing only the intended admin, database and
  default-off boundary changes.
- Record the commit SHA in the release notes.
- Confirm the linked Supabase project is `zmkmgxrnhdnbpiblkkkk`.
- Confirm the diff against `origin/main` contains no member discovery or homepage files.

Hard stop: do not continue from a dirty or ambiguous release diff.

## 2. Back up production

Prefer Supabase physical backup/PITR. If that is unavailable, create a timestamped directory outside
the repository and take both schema and data backups:

```powershell
npx.cmd supabase db dump --linked --file <backup-dir>\schema.sql
npx.cmd supabase db dump --linked --data-only --use-copy --file <backup-dir>\data.sql
```

Also export the rows targeted by the two orphan-cleanup migrations before they are applied. Keep the
backup path and row counts in the release notes.

For this release, the fallback is a gzip-compressed PostgREST export of every service-readable
`public` table and view, including the OpenAPI schema, relation row counts and error manifest. It
does not contain Auth records or Storage object bytes; neither is changed by the migration chain.

Hard stop: no schema change without a readable backup, zero export errors and recorded counts.

## 3. Prove the baseline

1. Dump the current production `public` schema.
2. Compare it with the objects represented by `20260826000000_remote_schema.sql`.
3. Resolve every material difference. A difference may mean production was changed manually, the
   snapshot is stale, or a later repository migration already exists in production without history.
4. Only when the baseline is proven, mark that version as applied. The preflight also verified the
   existing 90-day role, tables and RPCs before marking their two versions applied:

```powershell
npx.cmd supabase migration repair 20260826000000 20260901001000 20260901002000 --status applied --linked
```

This command must be peer-reviewed immediately before execution. Never mark later versions applied
merely to make the CLI quiet; each one must either be demonstrably present or actually applied.

## 4. Resolve migration scope

The discovery migrations are interleaved with two already-live 90-day-programme migrations:

- `20260901001000_ninety_day_user_lifecycle.sql`
- `20260901002000_ninety_day_cycles.sql`

Those versions are baselined, not replayed. The separate role-permissions migration is deliberately
omitted from this release because discovery administration does not depend on it and its production
policy audit belongs in a dedicated security change.

Re-audit the guarded destructive migrations against current production:

- `20260901041000_remove_abandoned_learning_nodes.sql`
- `20260902010000_remove_remaining_orphan_learning_nodes.sql`

The local cleanup decision does not substitute for checking today's production rows. Record the
exact IDs, titles, parent relationships and referencing-row counts. Abort if the guard queries do
not match the reviewed list.

## 5. Dry-run and review

After migration history and scope are correct:

```powershell
npx.cmd supabase migration list --linked
npx.cmd supabase db push --linked --dry-run --include-all
```

The dry run must list only the migrations intentionally included in this release. Review every
listed filename and the SQL for destructive statements, grants, RLS changes and function
replacement.

Hard stop: if the snapshot appears, an unexpected 90-day migration appears, or a supposedly
applied migration appears, do not push.

## 6. Apply during a quiet window

Run the reviewed push once:

```powershell
npx.cmd supabase db push --linked --include-all
```

Capture the complete output. Do not retry blindly after a partial failure; inspect migration history
and database state first.

## 7. Deploy the admin-only code

- Deploy the reviewed release commit.
- Sign in as an admin and smoke-test:
  - Assign topics (single and bulk paths)
  - Check standalone use and builder links
  - Not in search yet
  - Homepage browse
  - Find content
  - Fix a search, including member-specific diagnosis
  - Topics & synonyms
  - Resource Library, Library Editor and Course Builder discovery fields
  - Coach resource selection in coaching notes and business review
  - Help drawer and authenticated admin guide
- Sign in as a normal member and confirm legacy home search/browse still works and no new
  recommendation/feedback UI appears.

## 8. Post-release checks

- Run migration list again and save the result.
- Check application and Supabase logs for authorization, RPC and constraint errors.
- Confirm admins can write topics, decisions and browse approvals.
- Keep the backup until the later member launch has been stable for an agreed period.

## Rollback expectations

- UI/runtime regression: redeploy the prior application commit.
- Database regression: stop writes to the affected admin surface and make a reviewed forward repair.
  Do not attempt to reverse the migration chain ad hoc.
- Deleted orphan rows: restore only from the targeted pre-release export after determining which
  references must be restored with them.

The member launch is a separate release with its own acceptance pass. Its first step is catalogue
quality—not changing the flag: category coverage, guide/course topics, browse curation, search
goldens, recommendation quality and coach-suggestion behavior must be reviewed before setting
`MEMBER_DISCOVERY_ENABLED=true`.
