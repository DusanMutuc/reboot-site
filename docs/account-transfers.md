# Member account transfers

The admin **User Data Transfer** screen copies a member's account history into another existing account. It leaves the source account and its history in place. This is a one-time copy, not ongoing synchronization or an Auth email change.

## Install the update

Apply `supabase/migrations/20261008000000_complete_account_transfers.sql` after the implementation workspace, coaching history, member pauses, and 90-day membership migrations. This is a new migration; do not rerun or edit the already-applied `20260916000000_transfer_business_reviews.sql`.

For a SQL Editor release, run the entire [account-transfer release script](../sql/2026-10-08_account_transfers_release.sql) as `postgres` in the intended project. It checks prerequisites, applies only this migration, verifies privileges and triggers, and registers its exact canonical SQL in migration history in one transaction. It rejects an already registered or partially applied release. Preserve the previous transfer-function definitions and privileges before applying it. Regenerate the script with `node tools/build-account-transfer-release.mjs` after changing the canonical migration.

Deploy the matching application changes. The API uses `transfer_user_data_admin_v2`; it refuses transfers if that database function is unavailable, rather than falling back to an older function that cannot copy the new history or update GHL safely.

The migration updates the transfer functions, protects replay audit records, adds the retry index, and preserves Smart Doc history during trusted copies. It does not run a member transfer.

## Run a transfer

1. Choose the source and destination in the admin screen. The destination must already exist in Supabase Auth with its intended email.
2. Run the default dry test. It resolves the destination email in GHL, checks supported conflicts, and reports counts. Dry tests write an audit entry but do not change member data.
3. Review the counts, GHL contact, and advanced options. The default KPI option **replaces all destination KPI data** with the source's values; choose **Leave KPI data unchanged** when appropriate.
4. Turn off dry run and run the live copy with the same users and options.
5. Review the result and verify the destination's coaching history, implementation workspace, assignments, and schedule. Retire or delete the old account separately only after verification; the transfer does not do that.

The browser retains an operation ID for retries in the same tab, including reloads. If a response is lost, retry the saved attempt to retrieve the completed result without making another copy. Completed results are checked before Auth/GHL lookup and remain recoverable after a GHL outage, email change, or source-account deletion. Changing users or copy options changes the operation. A completed transfer is not a way to incrementally copy later source activity.

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

Meeting records and guide definitions remain shared references. A Business Review's unique meeting ownership stays on the original review, while the copied note retains its meeting reference. Implementation sessions retain their meeting IDs under the destination account and remain editable through the normal workspace workflow. Historical Business Review audit JSON retains its original IDs as evidence; implementation action snapshots point to copied actions.

Auth credentials, email, account name, staff rosters, and old request tokens are not copied. Device/session state and resource-discovery personalization are outside this history-copy operation.

Expired assistant assignments with a stale active flag are copied as inactive while retaining their dates and notes. Existing ended coach-assignment intervals remain separate history records.

## Conflicts and atomicity

All database member writes, the GHL profile update, and the completed audit record happen in one transaction. An error rolls them back together. Successful request IDs are recorded durably, and reuse with different parameters is rejected.

The dry test rejects existing destination implementation history for the same meeting, incompatible programme enrolments, conflicting open pauses or active assistants, membership status conflicts, and shared partnership ownership that would hide data or redirect writes to a third member. It also rejects training history whose referenced course fails the current assignment validation. Resolve the reported conflict before copying; the operation does not guess which history to discard or bypass existing validation.

The SQL entry points are service-role-only. Interactive callers use `/api/admin/transfer-user-data`, which checks admin access, validates options, resolves GHL identity, and invalidates the cached admin directory after a successful live operation.

## Local regression checks

The SQL tests use an isolated PGlite database with the checked-in schema and migrations, plus synthetic accounts. They never connect to the configured production project. Set `PGLITE_PACKAGE_DIR` to a local `@electric-sql/pglite` package directory, then run:

```powershell
node --test tests/transferAccountData.test.mjs tests/accountTransferRelease.test.mjs
node --test tests/accountTransferApi.test.mjs tests/accountTransferUi.test.mjs tests/ghlContactLookup.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

GHL tests use mocked responses; a live GHL lookup and an actual member transfer require the deployed update and a specific source/destination pair.

Validation on 8 October 2026: the complete local workspace suite passed **368 of 370 tests**, with the two opt-in HTTP integration tests skipped and no failures. The transfer checks include 35 database scenarios plus their parent test, seven release checks, 34 API tests, 11 UI tests, and 15 GHL lookup tests. The production build, TypeScript, targeted ESLint, and whitespace checks passed. No member transfer or live GHL contact lookup was performed.

The database release was applied to the configured Reboot production project on 8 October 2026 after saving the existing transfer function definitions and audit permissions locally. Migration `20261008000000` is registered; the application release must use the matching v2 endpoint. The earlier September transfer migration was not rerun.
