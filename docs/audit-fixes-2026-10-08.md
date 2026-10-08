# Remaining audit repairs — 8 October 2026

Status: implemented and deployed to production; database and credential remediation verified.

This follows the booking/KPI stabilization, complete account transfers, and merged-account releases. The historical findings and reproductions remain in [the audit](code-audit-2026-10-06.md). A12's bearer binding was already repaired in `d91dc86`.

## Changes

- **A3/A4:** Database entitlements and service-backed library/course loaders now agree on current membership and fully published paths. Past-member and merged status take precedence. Programme-only members need an open enrollment in an active cycle and receive Compass plus their assigned published systems. Dual/full members retain full membership behavior. Explicit admin builder previews still show drafts.
- **A8:** Legends-only resources resolve through the Legends library with its role restriction and correct paths. Private storage signing uses the same resource entitlement.
- **A9/A11:** Draft/archived requirements no longer block published lessons, cascading completion, or progress totals. KPI periods enumerate every calendar month in the programme, including a fourth month and year boundaries. Lesson progress now tracks each node separately, retries failed saves, and cannot complete a newly selected lesson using the previous lesson's loading state.
- **A5/A10:** Smart Docs load the intended owner's answers; failed reads block editing. Serialized autosaves retain unsaved drafts and expose retryable failures. Submission and navigation await saves. Required-answer validation and submission run atomically, optional fields remain optional, and table-returning progress RPCs are normalized. A draft placement no longer unpublishes a shared document's published placement. See [Smart Doc integrity](smart-doc-integrity.md).
- **A6/A7:** Partnership create/edit is one transaction, including membership changes and the returned representation. Parent sharing changes and reactivation enforce one active owner per member/domain. A database guard row and unique derived claims protect concurrent edits. Existing overlaps abort migration rather than picking an arbitrary owner. Archived history remains read-only.
- **A13:** New accounts receive unique undisclosed credentials and an email setup link. Setup requires a verified, recent recovery/invite/OTP session, respects verified MFA, and atomically sets the password and clears the pending flag. Established accounts keep the normal user-scoped password-change flow. Pending accounts and pre-setup JWTs are blocked by API/database/storage guards. Recovery supports PKCE and implicit links and removes tokens from the URL without copying fragments into query strings. Webhook retries preserve completed users' password/reset state. Failed setup-email delivery is reported with a resend path.

Verification also found and closed direct role-assignment writes that could undermine entitlements, direct non-admin partnership writes, and private-resource signing that bypassed content checks. These are necessary database counterparts to the website checks.

## Database release

Four canonical migrations are bundled by `node tools/build-audit-fixes-release.mjs` into `sql/2026-10-08_audit_fixes_release.sql`:

1. `20261008019000_secure_onboarding`
2. `20261008020000_content_access_and_progress`
3. `20261008021000_smartdoc_submission_integrity`
4. `20261008022000_atomic_partnership_management`

The bundle installs and verifies all four in one transaction, records each exact canonical migration, preserves the archive/pre-existing request-hook chain, and rejects partial or repeated installation. A late failure rolls back schema, grants, policies, derived partnership claims, hook settings, and history registration together. Migration-history registration normalizes Windows clipboard line endings to canonical LF; the replay test simulates CRLF input. The bundle does not change passwords or send emails.

Production metadata was saved privately before changes. Relevant deployed function definitions matched the migration baseline. Preflight found 14 partnerships/28 member rows with no overlapping sharing domains or archived active sharing memberships. All four library/Compass roots were published, and every active assigned programme system had a published Library path. Existing public image buckets remain public.

## Existing onboarding credentials

A read-only password-hash comparison found 43 non-archived accounts, including 7 staff accounts, still using the legacy shared credential. None had verified MFA factors. Remediation uses fresh, project-bound snapshots and live Auth/profile revalidation, then assigns each unchanged matching account a unique random credential through Supabase Auth. It preserves other metadata, stamps the setup requirement, and records a private per-account audit. It does not send bulk emails. Members use **Set up or reset password** on the login page; admins can resend from profiles.

Accounts whose password already differs are excluded. Auth's admin password update revokes sessions. Database guards additionally reject older access JWTs even after setup completes. Because JWT `iat` has whole-second precision, tokens issued in the setup cutoff second are also rejected; sign-in must occur in a subsequent second. The maintenance Auth read/update sequence is not a compare-and-swap: a password change in the intervening HTTP window could be overwritten. Immediate timestamp revalidation narrows that window, and changed accounts are skipped.

The official Auth implementation documents the relevant behavior in [admin updates](https://github.com/supabase/auth/blob/master/internal/api/admin.go), [password/session invalidation](https://github.com/supabase/auth/blob/master/internal/models/user.go), [session verification](https://github.com/supabase/auth/blob/master/internal/api/auth.go), and [implicit versus PKCE recovery methods](https://github.com/supabase/auth/blob/master/internal/api/verify.go). The client never treats a URL `type=recovery` parameter as proof.

## Validation

Regression tests exercise actual components and route handlers, installed Supabase transport, and PostgreSQL/RLS through PGlite. They cover failed/late writes, navigation, owner isolation, publication ancestry, membership permutations, direct role/resource access, atomic partnership failures, setup proof and expiry, stale tokens, and combined migration rollback. A separate opt-in PostgreSQL test exercises actual multi-session partnership concurrency; it requires a dedicated test database and was not run on this host.

Final local run: **629 tests total, 626 passed, 3 optional integration tests skipped, no failures**. TypeScript, changed-file ESLint and the production build passed. The final generated release also passed a rollback-only rehearsal against production; no migration history remained after rollback. The subsequent Windows line-ending regression passed all seven combined-release checks.

## Production verification

- Application commit `49b9e59cd109cfb659a8362e566509117f243613` deployed successfully to Vercel Production on 8 October 2026. The rendered [production login](https://hub.rebootmembers.com/login) exposes **Set up or reset password**, and its email dialog opens. Unauthenticated setup completion returns HTTP 401. The login is client-rendered, so the rendered browser check is used for the button rather than a raw HTML substring check.
- All four migrations are registered, and their stored source fingerprints match canonical LF files. A bounded, hash-checked transaction normalized only their history line endings after the Windows SQL Editor paste. No migration was reapplied.
- Both the setup guard and the existing archive guard cover 86 tables. The authenticator request hook is `public.account_setup_pre_request`, with the archive/predecessor chain preserved. The original 14 partnerships and 28 membership rows remain.
- Anonymous calls to the three restricted legacy content mutation RPCs return HTTP 401 / PostgreSQL `42501`.
- The fresh password-hash snapshot contained **42** eligible non-archived accounts; one of the initial 43 no longer matched before remediation. Dry-run revalidation confirmed 42 eligible accounts. The Auth rotation completed **42 updates, zero failures**, preserving other metadata and requiring email password setup. No bulk email was sent.
- Final read-only database checks confirmed **zero non-archived accounts using the legacy credential**, **42 accounts requiring setup**, and **zero remaining Auth sessions for those 42 accounts**. Private schema backups, bounded snapshots and per-account remediation results are retained outside the repository.

Members affected by the rotation must use the login page's setup/reset action to choose their own password. No one whose password already differed was included.

## Login communication follow-up

The login page now explains that the shared starter password was retired for security and offers an email setup action. People who already chose their own password are directed to sign in as usual. The same notice and recovery dialog are used on desktop and mobile, with readable text and the entered login email carried into the dialog. Invalid-credential errors explain the recovery option without revealing whether an account exists.

The recovery dialog explains the steps, confirms email requests without account enumeration, and gives inbox/spam and support guidance. The password page states the eight-character minimum and explains that saving returns to login. A successful reset displays a password-saved confirmation on login. This follow-up changes presentation only; no additional credentials were rotated and no bulk emails were sent.

Validation: all eight existing password-reset UI tests, TypeScript, focused ESLint and diff checks passed. Browser checks verified the notice, dialog, email prefill and success confirmation on desktop and mobile without sending recovery emails.
