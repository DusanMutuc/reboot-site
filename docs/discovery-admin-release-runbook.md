# Discovery admin release runbook

This release exposes the admin curation tools while keeping the member discovery redesign off.
It is deliberately a two-stage launch:

1. deploy the database infrastructure and admin UI;
2. populate and verify the catalogue, then separately enable member discovery.

No command in this document should be run against production from an unreviewed working tree.

## Release invariants

- `MEMBER_DISCOVERY_ENABLED=false` (or absent) in production for the admin-only release.
- Admin discovery routes and coach resource selection remain available.
- Members retain the legacy home catalogue and search behavior.
- `/discover`, member discovery analytics, recommendation feedback and the new catalogue endpoint
  return no member surface while the flag is off.
- The flag becomes `true` only in the later member launch.

## Current migration-history problem

The linked production project currently reports none of this repository's 31 migration versions in
its migration history. The first file, `20260826000000_remote_schema.sql`, is a schema snapshot of an
already-existing database, not a migration that can safely be replayed over production. A direct
`supabase db push` would therefore try to apply the snapshot and every later migration. **Do not run
it yet.**

The safe solution is to establish an honest baseline only after comparing the snapshot with the
current production schema. Marking a migration as applied changes history; it does not prove the
schemas match.

## 1. Freeze and identify the release

- Review `git status` and create a release commit containing only the intended admin, database and
  default-off boundary changes.
- Record the commit SHA in the release notes.
- Confirm the linked Supabase project is `zmkmgxrnhdnbpiblkkkk`.
- In Vercel, set `MEMBER_DISCOVERY_ENABLED=false` before deploying the code.

Hard stop: do not continue from a dirty or ambiguous release diff.

## 2. Back up production

Create a timestamped directory outside the repository, then take both schema and data backups:

```powershell
npx.cmd supabase db dump --linked --file <backup-dir>\schema.sql
npx.cmd supabase db dump --linked --data-only --use-copy --file <backup-dir>\data.sql
```

Also export the rows targeted by the two orphan-cleanup migrations before they are applied. Keep the
backup path and row counts in the release notes.

Hard stop: no schema change without a readable backup and recorded counts.

## 3. Prove the baseline

1. Dump the current production `public` schema.
2. Compare it with the objects represented by `20260826000000_remote_schema.sql`.
3. Resolve every material difference. A difference may mean production was changed manually, the
   snapshot is stale, or a later repository migration already exists in production without history.
4. Only when the baseline is proven, mark that version as applied:

```powershell
npx.cmd supabase migration repair 20260826000000 --status applied --linked
```

This command must be peer-reviewed immediately before execution. Never mark later versions applied
merely to make the CLI quiet; each one must either be demonstrably present or actually applied.

## 4. Resolve migration scope

The discovery migrations are interleaved with two 90-day-programme migrations:

- `20260901001000_ninety_day_user_lifecycle.sql`
- `20260901002000_ninety_day_cycles.sql`

Before pushing, determine whether those changes already exist in production and whether they belong
in this release. If they do not, split/resequence the release migrations rather than applying
unrelated work accidentally.

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
npx.cmd supabase db push --linked --dry-run
```

The dry run must list only the migrations intentionally included in this release. Review every
listed filename and the SQL for destructive statements, grants, RLS changes and function
replacement.

Hard stop: if the snapshot appears, an unexpected 90-day migration appears, or a supposedly
applied migration appears, do not push.

## 6. Apply during a quiet window

Run the reviewed push once:

```powershell
npx.cmd supabase db push --linked
```

Capture the complete output. Do not retry blindly after a partial failure; inspect migration history
and database state first.

## 7. Deploy admin code with member discovery off

- Confirm the deployment contains `MEMBER_DISCOVERY_ENABLED=false`.
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
- Sign in as a normal member and confirm legacy home search/browse still works, `/discover` is not
  available, and no new recommendation/feedback UI appears.

## 8. Post-release checks

- Run migration list again and save the result.
- Check application and Supabase logs for authorization, RPC and constraint errors.
- Confirm admins can write topics, decisions and browse approvals.
- Confirm members cannot call the disabled discovery catalogue, event or preference endpoints.
- Keep the backup until the later member launch has been stable for an agreed period.

## Rollback expectations

- UI/runtime regression: redeploy the prior application commit; keep
  `MEMBER_DISCOVERY_ENABLED=false`.
- Database regression: stop writes to the affected admin surface and make a reviewed forward repair.
  Do not attempt to reverse the migration chain ad hoc.
- Deleted orphan rows: restore only from the targeted pre-release export after determining which
  references must be restored with them.

The member launch is a separate release with its own acceptance pass. Its first step is catalogue
quality—not changing the flag: category coverage, guide/course topics, browse curation, search
goldens, recommendation quality and coach-suggestion behavior must be reviewed before setting
`MEMBER_DISCOVERY_ENABLED=true`.
