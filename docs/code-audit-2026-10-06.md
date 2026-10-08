# Code audit — 6 October 2026

Reviewed checkout: `main` at `30bb87b`, plus the local fixes described below. This is a source and local-behavior audit, not a claim that every workflow is defect-free. Production data, deployed functions, GHL calendars, and the work pending on the other PC were not inspected or changed.

**8 October release follow-up:** The implementation-tab update is integrated at `02f839c`, and the account-transfer release is deployed at `f422e86`. The subsequent stabilization release includes the booking/member filtering, partnership authorization, and KPI A1/A2 fixes described here. These fixes require no database migration. A read-only live check confirmed A3's deployed entitlement mismatch (authenticated RLS policy wiring remains unverified); The remaining findings are addressed by the follow-up audit repair release; A12 was already fixed with merged accounts. See [the repair record](audit-fixes-2026-10-08.md) for implementation and deployment status. See [the stabilization record](stabilization-2026-10-08.md) for compatibility notes, live-check limits, and release validation.

## Changes made in this review

### Booking Follow Up: exclude former members

The report previously treated an active coach assignment as proof of current membership. It also expanded active partnerships without checking whether each partner was still eligible.

`src/lib/bookingFollowUp.ts` now intersects report assignments and partnership members with the existing coaching-workspace eligibility helper. This covers both admin and coach reports, and excludes former partners before loading profiles, related coach assignments, or scanning their calendars. Active programme participants and current partners remain eligible. Paused members remain visible with reminders suppressed.

`src/lib/currentMembers.ts` also excludes `past_member` accounts from the active 90-day enrollment branch. Removing access does not necessarily end an enrollment, so the old union could restore a revoked member to coaching lists. The existing current-member RPC remains the source of ordinary membership eligibility. Revoked programme membership lookups are batched and lookup failures stop the operation rather than returning unfiltered data.

Regression evidence: nine of the ten new booking tests failed before the fix; all ten pass afterward. Coverage includes direct assignments, partnerships, coach scope, active/ended programme enrollment, revoked programme members, pauses, empty eligible rosters, membership lookup failures, and multiple lookup batches.

### Partnership APIs: enforce failed admin checks

Both partnership route files called `requireAdmin()` but ignored its returned failure. A signed-in non-admin could reach privileged listing and mutation queries. All four handlers now return guard failures immediately and create the service client only after authorization. They pass the request to the guard for cookie authentication.

Files: `src/app/api/admin/partnerships/route.ts`, `src/app/api/admin/partnerships/[partnershipId]/route.ts`, and `tests/partnershipAuthorization.test.mjs`.

Four regression tests cover every method under 401, 403, and 500 guard failures, plus authorized success. Denied operations construct no privileged client, query no data, and invalidate no cache. The corresponding stale warnings in `AGENT_GUIDE.md` and `WEBSITE.md` have been updated.

These changes are included in the 8 October stabilization release. No database migration is needed for them. The original audit left the five pre-existing account-transfer files untouched; the later transfer release is documented separately.

## Findings and resolution history

P1 means prioritize promptly because data or access boundaries are at risk. P2 means a reproducible functional or integrity defect. P3 means a latent defect with no current affected caller established. The original findings and reproduction notes are retained below; A1/A2 are fixed in the stabilization release, A12 in the merged-account release, and the remaining ten findings in the audit repair release. The repair record distinguishes validation from production rollout.

| ID | Priority | Finding | Evidence |
|---|---|---|---|
| A1 | P1, fixed | Failed KPI history loads can lead to deletion of existing values | 8 October regression coverage |
| A2 | P1, fixed | KPI autosave responses erase newer typing | 8 October regression coverage in both editors |
| A3 | P1, fixed | Database content rules omit revoked/programme membership restrictions | Deployed entitlement functions checked 8 October; RLS policy wiring unverified |
| A4 | P2, fixed | Unpublished library content is returned to members | Executed library-loader reproduction |
| A5 | P2, fixed | Smart Doc submission can succeed before required answers are saved | Executed API reproduction + client lifecycle trace |
| A6 | P2, fixed | Failed partnership edits partially commit | API write sequence + database constraints |
| A7 | P2, fixed | Partnership reactivation/sharing changes bypass overlap validation | API + checked-in triggers |
| A8 | P2, fixed | Legends-only resource downloads fail access checks | TypeScript paths + checked-in migration chain |
| A9 | P2, fixed | Required draft content can block published course progress | Course rendering + checked-in progress functions |
| A10 | P2, fixed | Smart Doc loading can display another person's answers to staff | Client query + checked-in response policies |
| A11 | P2, fixed | A 90-day programme can omit its final KPI month | Executed date-function reproduction |
| A12 | P3, fixed | Bearer authentication returns an anonymous database client | Installed SDK with mocked transport |
| A13 | P1, fixed | New accounts share a bootstrap password | Current provisioning/reset code |

### A1 — Failed KPI history loads can lead to deletion of existing values

**Where:** `src/components/home/TrackerPanel.tsx:129`, `:160`, `:207`; `supabase/migrations/20260826000000_remote_schema.sql:6994`.

The programme tracker replaces failed history results with an empty array, then enables editing. A save submits every metric, with null for fields whose existing values were never loaded. The database upsert deletes stored metric values when given null.

**Reproduction:** Execute the actual component with a failed history RPC and successful identity/metric reads. The form remains editable. Editing only `closed_deals` sends `{closed_deals: 5, repeat_referral: null}`. An existing referral value would be deleted by the checked-in RPC. Two reviewers independently verified the component behavior with local mocks; no live figures were changed.

**Fix and verification:** Prevent editing and saving until the selected period's history loaded successfully; expose a retry. Test complete and partial year-load failures, particularly a programme spanning New Year. Assert that failed reads produce no save requests and preserve existing metrics.

### A2 — KPI autosave responses erase newer typing

**Where:** `src/components/KpiTracker.tsx:338`, `:406`; `src/components/home/TrackerPanel.tsx:151`, `:182`.

When an earlier save completes, it updates local history. The history hydration effect then replaces all current form values, including edits made while that request was pending.

**Reproduction:** Blur field A to start a save, type into field B before A resolves, then resolve A. The newly typed B value disappears. This was reproduced against both actual transpiled components with controlled asynchronous responses.

**Fix and verification:** Track edit revisions/dirty fields and avoid rehydrating active input from older save acknowledgements. Coordinate saves so older snapshots cannot overwrite newer ones. Test delayed responses, rapid tabbing, multiple in-flight saves, and switching periods while a save is pending.

### A3 — Database content rules omit membership restrictions

**Where:** `supabase/migrations/20260831020000_discovery_context.sql:25`, `:60`, `:101`.

`discovery_node_paths` admits main-library content for any non-null user, without checking `past_member` or the programme-only content allowlist. Content-node and resource RLS use these functions. No later checked-in migration adds those membership restrictions.

**Trigger and impact:** Against that schema, a revoked member retaining a valid Supabase token can read published library content directly through Supabase despite website access removal. A programme-only member can read main-library content outside their assigned systems. Website middleware cannot enforce direct database reads.

**Evidence limit:** Confirmed from the complete checked-in definitions and grants. The live database may contain additional changes; inspect deployed function bodies and policies before claiming production exposure. No direct production access was attempted.

**Fix and verification:** Share a database entitlement predicate across content access functions and RLS. Verify revoked, active programme, ended programme, dual, assistant, coach, and admin identities in local authenticated SQL tests. Preserve the deliberately allowed ambassador APIs.

### A4 — Unpublished library content is returned to members

**Where:** `src/lib/libraryAccess.ts:231`, `:369`, `:413`, `:444`, `:512`; related course endpoint `src/app/api/nodes/[nodeId]/blocks/route.ts:20`.

Library loaders use a service client and check ancestry, but do not enforce publication for the target or its ancestors. Listing queries also include draft nodes.

**Reproduction:** An ordinary member fixture received a draft guide in collection results, its text from the detail loader, and a published chapter below that draft guide. This used the actual transpiled library module and a mocked database. Admin Library editing exposes Draft/Published controls, so this is not an intentional preview path. Course rendering hides drafts, but the node-block endpoint's checked-in course-access RPC likewise does not validate publication of the requested node/ancestors.

**Fix and verification:** Require at least one accessible, fully published path in member loaders and block endpoints. Test draft/archived targets, draft ancestors, shared nodes with multiple placements, published paths, and explicit admin preview behavior.

### A5 — Smart Doc submission can succeed before answers are saved

**Where:** `src/components/course/BlockRenderer.tsx:310`, `:361`; `src/app/api/smartdoc/submit/route.ts:35`, `:78`; `src/components/course/LessonContent.tsx:450`, `:611`.

Answers save after a 400 ms debounce. Unmount clears pending timers, and save requests do not check unsuccessful HTTP responses. Submit neither flushes nor awaits these saves. The API directly sets `submitted` rather than using the existing `submit_smart_doc` RPC's required-field validation.

**Reproduction:** The actual submit handler returned HTTP 200 and created a submitted response with three required fields and zero saved answers. In the UI, typing the last answer, immediately submitting, and navigating before the debounce fires can complete the lesson without persisting that answer.

The same endpoint treats the table-returning `get_smart_doc_progress` result as an object. The reproduction returned totals of `0/0` despite the RPC returning `3/0`.

**Fix and verification:** Track pending saves, flush and await them before submit/navigation, surface failures, and use an atomic validated submission operation. Normalize the progress row. Test rapid submit/navigation, failed saves, out-of-order saves, missing required fields, and progress totals.

### A6 — Failed partnership edits partially commit

**Where:** `src/app/api/admin/partnerships/[partnershipId]/route.ts:178`, `:217`; `src/app/api/admin/partnerships/route.ts:182`.

PATCH saves settings, deletes removed members, then inserts additions in separate requests. If the addition fails an overlap constraint, the API returns an error after earlier changes have committed. POST similarly creates the partnership before inserting memberships and can leave an empty record.

**Trigger:** Replace a partner with someone who already belongs to an incompatible active partnership. The new membership is rejected after the original partner has been removed.

**Fix and verification:** Move each logical operation into a transaction-backed RPC. Test rejection after a proposed removal/settings change and assert that all original rows survive unchanged; failed creation must leave no orphan partnership.

### A7 — Reactivation/sharing changes bypass partnership overlap validation

**Where:** `src/app/api/admin/partnerships/[partnershipId]/route.ts:178`; baseline schema overlap function at `:2372`, membership trigger at `:9850`, and `canonical_owner_for` at `:1611`.

The overlap trigger validates `partnership_users` inserts/updates. Updating a partnership's `is_active` or sharing flags with unchanged memberships does not run it. Reactivating an inactive partnership, or enabling another shared domain, can therefore create conflicting active ownership. The canonical-owner function then chooses one matching partnership with an unordered `LIMIT 1`.

**Fix and verification:** Validate affected members when parent settings change, with concurrency protection. Test reactivation, enabling each sharing domain, and concurrent overlapping edits. This finding is based on checked-in triggers, not an inspection of live database drift.

### A8 — Legends-only resource downloads fail access checks

**Where:** `supabase/migrations/20260831020000_discovery_context.sql:11`, `:60`; `src/app/r/[id]/route.ts:87`; `src/app/api/coach-resource-suggestions/route.ts:62`.

The TypeScript library supports `legends-library`, but `discovery_node_paths` recognizes only courses, the main library, and the assistant library. Its resource policy rejects published assets placed exclusively in Legends Library, including when requested by a legend member. A second Main Library placement or staff access can mask this.

**Fix and verification:** Add a legend-gated root and correct `/legends-library` paths. Test a resource with exactly one Legends placement under legend, ordinary-member, assistant, and admin identities. Confirm the deployed migration/function state before rollout.

### A9 — Required drafts can block published course progress

**Where:** `supabase/migrations/20260826000000_remote_schema.sql:2695`, `:4021`; `src/app/api/courses/[courseSlug]/route.ts:15`, `:94`.

Course rendering removes unpublished nodes, while unlock and completion calculations still count required unpublished siblings/children. The unlock query uses an admin client, so ordinary member RLS does not remove them from the calculation. New child creation defaults to draft and required.

**Trigger:** Insert a required draft lesson before a published lesson in a sequential course. The published lesson is locked behind invisible content. A required draft chapter can similarly prevent its parent lesson from completing.

**Fix and verification:** Align publication rules across unlock dependencies, cascading completion, and progress denominators. Add database regression cases for draft/archived required siblings and children. Runtime verification against the deployed schema remains outstanding.

### A10 — Smart Doc answer loading is not scoped to the viewer

**Where:** `src/components/course/BlockRenderer.tsx:260`; baseline response policies at `supabase/migrations/20260826000000_remote_schema.sql:11168`.

The response query filters only by block ID, then calls `maybeSingle()`. Admins and coaches can legitimately read other members' responses. Multiple visible responses cause an ignored query error and blank answers; one visible student response can be loaded as the staff viewer's draft, while subsequent writes use the viewer's own ID.

**Fix and verification:** Include the intended response owner in the query. Test member, coach, and admin viewers with zero, one, and multiple other visible responses. Do not rely on own-row RLS when staff have broader read access.

### A11 — A 90-day programme can omit its final KPI month

**Where:** `src/lib/ninetyDayProgramme.ts:118`; `supabase/migrations/20260901002000_ninety_day_cycles.sql:17`.

`cycleMonths()` always emits three calendar months, but arbitrary start dates and a 90-day duration can span four.

**Executed reproduction:** A cycle from 22 September through 20 December 2026 produced September, October, and November only. December cannot be selected in the programme KPI tracker.

**Fix and verification:** Enumerate every calendar month intersecting `starts_on..ends_on`. Test mid-month starts, year boundaries, February, and leap years. The default selected month was not classified as a bug because its intended UX is unclear.

### A12 — Bearer authentication returns an anonymous database client

**Where:** `src/lib/requireUser.ts:35`, `:49`, `:79`.

The bearer branch validates the token with `auth.getUser(accessToken)` but does not attach that token to subsequent database requests on the returned client.

**Executed reproduction:** The installed Supabase SDK with mocked transport sent the user bearer to the identity endpoint, then the anonymous key to an RPC. Current mobile routes use the validated identity with a service client, so this is a latent contract defect, not a demonstrated current mobile failure.

**Fix and verification:** Bind the validated bearer to the returned client and assert that subsequent RPCs use it; retain cookie-flow and revoked-member tests.

### A13 — Existing shared bootstrap-password debt remains

**Where:** `src/app/api/admin/create-user/route.ts:86`; `src/app/api/ghl/create-assistant/route.ts:7`; `src/app/reset-password/ResetPasswordClient.tsx:87`.

Both provisioning paths create accounts with the same source-defined password and mark them for reset. Requiring a reset after login does not establish that the person logging in owns the email address. A person who knows the common credential and account email could log in before the intended owner and set a new password. This was already documented in the agent guide; it is not a newly introduced regression.

**Remediation:** Replace the shared credential with an owner-verified invite/reset flow and plan migration for accounts that have not completed onboarding. Test provisioning, existing-user webhook retries, invitation expiry, and password reset ownership. No account credentials or onboarding behavior were changed during this audit.

## Verification and limits

- Existing baseline: 68 passing Node tests, 3 opt-in tests skipped.
- After fixes: 82 passing Node tests, 3 opt-in tests skipped (85 total). The added suites cover booking eligibility and partnership authorization.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false` passed.
- Direct ESLint on the four changed TypeScript files and two new test files passed.
- `git diff --check` passed.
- Reproduction harnesses used local fixtures/mocked transport, including actual transpiled components and handlers. They do not establish that production data has already been affected.
- Local database/HTTP integration tests were not enabled; database findings rely on the checked-in baseline and later migrations. No production schema inspection, database mutation, deployment, or real calendar synchronization occurred.
- Review covered membership/90-day access, admin routes, booking/coaching, business-review preparation and scorecards, meeting synchronization, partnerships, KPI editors, library/discovery access, course progress, and Smart Docs. Completed business reviews are intentionally editable, so that behavior was excluded from findings.

## Suggested repair order

1. Prevent KPI data loss (A1/A2), and verify/remediate database membership access (A3).
2. Plan the existing onboarding credential change (A13) and fix member publication access (A4).
3. Make Smart Doc saving/submission reliable (A5/A10), and make partnership mutations atomic with complete overlap checks (A6/A7).
4. Repair Legends resource access, draft course dependencies, and programme month coverage (A8/A9/A11).
5. Correct the latent bearer-client contract before adding clients that rely on it (A12).
