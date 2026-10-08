# Member account transfers

The admin **User Data Transfer** screen defaults to **Merge accounts**: copy the member's supported history to an existing destination, update the destination's GHL identity, and preserve the source as a read-only **Merged** archive. Merged is an account state separate from Past Member. It does not change either Auth email or move appointments between GHL contacts.

Two explicit alternatives remain available: **Copy history** leaves both accounts active; **Archive previously transferred account** requires a recorded successful transfer for that exact pair, then archives the source without copying history again. The latter preserves work already added to the destination since an earlier transfer.

## Install the update

Apply `supabase/migrations/20261008000000_complete_account_transfers.sql` after the implementation workspace, coaching history, member pauses, and 90-day membership migrations. This is a new migration; do not rerun or edit the already-applied `20260916000000_transfer_business_reviews.sql`.

For a SQL Editor release, run the entire [account-transfer release script](../sql/2026-10-08_account_transfers_release.sql) as `postgres` in the intended project. It checks prerequisites, applies only this migration, verifies privileges and triggers, and registers its exact canonical SQL in migration history in one transaction. It rejects an already registered or partially applied release. Preserve the previous transfer-function definitions and privileges before applying it. Regenerate the script with `node tools/build-account-transfer-release.mjs` after changing the canonical migration.

Then install `supabase/migrations/20261008010000_archive_merged_accounts.sql`, or its generated [merged-account release script](../sql/2026-10-08_merged_accounts_release.sql). Save the existing roster/attention function definitions, table privileges, RLS flags, policies and authenticator settings first. The script installs and verifies the archive schema, immutable ledger, subject guards and API request hook in one transaction, then records the exact canonical migration. Regenerate with `node tools/build-account-merge-release.mjs` after any canonical migration edit. An existing request hook is preserved; an ambiguous dynamic pre-config setup requires deliberate integration.

Deploy the matching application **after** the archive migration. The API uses `transfer_user_data_admin_v3`; it refuses operations if that function is unavailable. Missing operation mode from an old browser tab continues to mean copy, honoring that tab's original confirmation. No existing member account is automatically archived by either migration.

The migration updates the transfer functions, protects replay audit records, adds the retry index, and preserves Smart Doc history during trusted copies. It does not run a member transfer.

## Run a transfer

1. Choose the operation, source and destination in the admin screen. The destination must already exist in Supabase Auth with its intended email.
2. Run the default dry test. It resolves the destination email in GHL, checks supported conflicts, and reports counts. Dry tests write an audit entry but do not change member data.
3. Review the counts, GHL contact, and advanced options. The default KPI option **replaces all destination KPI data** with the source's values; choose **Leave KPI data unchanged** when appropriate.
4. Turn off dry run, review the operation-specific confirmation and apply the same users/options.
5. Verify the destination's coaching history, implementation workspace, assignments and schedule. For merge/archive, verify the old profile appears under **Profiles → Merged** and links to the current profile. Do not delete the old account: it preserves the audit trail.

The browser retains an exact operation receipt for retries in the same tab, including reloads. **Finish a previous operation** works even after the archived source disappears from normal selectors. If a response is lost, retry the saved attempt without making another copy. Completed results are checked before Auth/GHL lookup and remain recoverable during those services' outages. Changing users, mode or copy options requires a new dry test. A completed transfer is not incremental synchronization.

## Archived profiles and access

The old profile, roles and historical data remain available to administrators. Active coach/assistant assignments and programme enrolments are ended; their previous state is retained in the private immutable merge ledger alongside old email, GHL IDs, destination, date and operator. The destination profile shows its merged-account history. Searching an old email or GHL ID finds the current profile; the explicit Merged filter opens the archive itself.

Archived accounts are excluded from current-member rosters, booking follow-up, GHL appointment matching and normal admin action selectors. Admin edit, reset, promotion and deletion actions reject them. Database write guards also protect archived source history against stale service jobs. Login/app guards, a PostgREST request hook and restrictive RLS policies deny archived JWT subjects, including already-issued tokens. The API also bans the old Supabase Auth account after the database transaction. If Auth is temporarily unavailable, the database remains archived and the saved attempt can finish that last step without copying again.

Interactive merges record the authenticated admin. Explicit trusted service maintenance can record a system actor; that option is not accepted from browser API requests. There is no unmerge button or automatic restoration of access.

## GHL identity

The server reads the destination's current **Auth email**, searches for one exact primary-email match in the configured GHL location, and updates both `profiles.ghl_contact_id` and the member contact stored in `profiles.ghl_user_id`. Existing member scheduling and ambassador links still use the latter field.

The source contact ID is not copied. The lookup does not create or change GHL contacts or move appointments between contacts. Existing GHL appointments remain attached to their current contact; the destination schedule reads the new contact's appointments. Missing contacts, duplicate exact matches, configuration errors, incomplete responses, and timeouts stop the transfer before any member writes. Resolve the GHL issue and retry. The database checks the destination email again while holding its Auth row lock, so an email change during lookup cannot attach the wrong contact.

Coach and implementation-coach accounts use `ghl_user_id` as a staff calendar ID. This member-transfer operation rejects those accounts; migrating staff accounts requires handling their calendars and student rosters separately.

## Data covered

| Data | Copy / conflict behavior |
|---|---|
| Coaching cycles, action steps, comments, wins | New destination rows; original timestamps and attribution retained |
| Business Reviews | Copies preparation answers, Focus Finder values, ratings, priorities, additional scorecards and scorecard migration history; remaps note/action links |
| Implementation workspaces | Copies pinned checklist versions, progress, sessions, captured actions, per-step notes/events, meeting notes, commitments and booking flags; remaps action IDs in snapshots and session/action foreign keys |
| Standalone and private coaching notes | New destination note IDs; original author/body/time retained, including legacy missing attribution |
| Assigned training | Remaps the coaching-cycle reference; preserves course, assignment metadata and ended history |
| Member support | Coach/assistant assignment history, programme enrolments, pauses and default home preference; only currently active matching support assignments merge |
| Member history and access | Attendance, achievements, roles, course visibility, course progress, resource/search analytics and attention history |
| Smart Docs | Keeps the selected winning response and all its field values together; supports keeping destination, source, or latest submitted response |
| Profile context | Preserves earlier introduction date; fills a missing manual attention override; recomputes automatic attention after copying |
| Content authorship | Reassigns authorship only when the existing advanced option is enabled; this changes the source's authorship references |

Meeting records and guide definitions remain shared references. Copy-only leaves a Business Review's unique meeting ownership on the original. Merge/archive moves the operational meeting link to the matching destination review and preserves the source link as `archived_meeting_id`, so scheduled activity continues on the current account. An ambiguous legacy review match stops archival. Implementation sessions retain their meeting IDs under the destination and remain editable. Historical Business Review audit JSON retains its original IDs as evidence; implementation action snapshots point to copied actions.

Auth credentials, email, account name, staff rosters, and old request tokens are not copied. Device/session state and resource-discovery personalization are outside this history-copy operation.

Expired assistant assignments with a stale active flag are copied as inactive while retaining their dates and notes. Existing ended coach-assignment intervals remain separate history records.

## Conflicts and atomicity

All database member writes, the GHL profile update, source archival and completed audit record happen in one transaction. An error rolls them back together. Auth banning is a separate retryable step after that commit. Successful request IDs are recorded durably, and reuse with different accounts, modes or copy options is rejected.

The dry test rejects existing destination implementation history for the same meeting, incompatible programme enrolments, conflicting open pauses or active assistants, membership status conflicts, and shared partnership ownership that would hide data or redirect writes to a third member. It also rejects training history whose referenced course fails current validation. Archived or staff accounts cannot be selected for a new operation. A current destination that already has merged source accounts requires separate consolidation before merging it onward. Resolve reported conflicts before applying; the operation does not guess which history to discard.

The SQL entry points are service-role-only. Interactive callers use `/api/admin/transfer-user-data`, which checks admin access, validates options, resolves GHL identity, and invalidates the cached admin directory after a successful live operation.

## Local regression checks

The SQL tests use an isolated PGlite database with the checked-in schema and migrations, plus synthetic accounts. They never connect to the configured production project. Set `PGLITE_PACKAGE_DIR` to a local `@electric-sql/pglite` package directory, then run:

```powershell
node --experimental-strip-types --test tests/transferAccountData.test.mjs tests/accountTransferRelease.test.mjs tests/mergedAccounts.test.mjs tests/accountMergeRelease.test.mjs
node --experimental-strip-types --test tests/accountTransferApi.test.mjs tests/accountTransferUi.test.mjs tests/ghlContactLookup.test.mjs tests/accountLifecycleAuth.test.mjs tests/adminMergedDirectory.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

GHL tests use mocked responses; a live GHL lookup and an actual member transfer require the deployed update and a specific source/destination pair.

The earlier copy-transfer release passed its full local suite, production build, TypeScript, targeted ESLint and whitespace checks. Archive behavior adds real PostgreSQL scenarios, API/UI retry tests, access checks and directory/history regressions.

The copy-transfer database release was applied to Reboot production on 8 October 2026 after a local schema backup; migration `20261008000000` is registered. The earlier September migration was not rerun. Archive deployment is a separate migration and does not infer or archive previously copied pairs automatically.

Archive release validation on 8 October 2026: the complete suite passed 458 tests with two opt-in HTTP integration tests skipped; the subsequent system-actor display regression also passed. The production build, TypeScript, changed-file ESLint and whitespace checks passed. Synthetic rendered admin drawers were visually checked. Migration `20261008010000` passed a transaction/rollback rehearsal against the live schema, then was installed and verified in migration history with 86 subject-restricted tables. The original eight affected/prerequisite function definitions, table access settings, policies and authenticator configuration were backed up locally before release.
