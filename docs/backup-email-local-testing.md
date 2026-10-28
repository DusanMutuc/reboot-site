# Verified backup email: PC test handoff

Branch: `codex/verified-backup-email`. This branch also carries this chat's course
continuation, Business Review preparation drafts, and Rebel SMTP help-form work.
It is not approved for production. `vercel.json` disables automatic Vercel
deployments for this branch. `BACKUP_EMAIL_ENABLED` defaults to false.

## What this implements

An established account can add **one verified backup email** under `/account`.
The student enters their current password, verifies the new inbox, and can then
use either address with the same password. The Auth UUID, primary email,
membership, course progress and application records stay the same.

Forgot-password accepts either address. Primary-email recovery stays on the
existing Supabase flow. Backup recovery uses a one-use application link, exchanges
it for a private Supabase recovery session on the server, and calls Supabase's
ordinary password-update API. No recovery session is returned to the browser.

Adding/removing an address requires the current password. Verification must be
completed while signed in to the account that requested it. Pending addresses
cannot sign in, and do not reserve an inbox. One normalized address cannot belong
to two accounts, including through direct Supabase signup or email updates.
Merged accounts cannot use their reserved backup addresses. Backup management and
recovery are unavailable for accounts with verified MFA factors; primary Auth
continues to be the supported route for those accounts.

This does not merge existing accounts, change the primary email, add additional
GHL contact addresses, or repair access after someone has already lost all their
inboxes. Students need to add a backup while they still have access.

## Prepare the PC

1. Fetch and check out the branch, then run `npm.cmd ci`.
2. Use the PC's **isolated local database with the existing application schema**.
   The repository's migration history alone is not a guaranteed reproducible
   snapshot of the current application database. Follow your established local
   restore process if the PC database is absent; do not run a blind database reset.
   Use sanitized local data and disable any copied database webhooks/jobs that
   call external services. The runner only overrides application settings.
3. Start the local Supabase stack (`npm.cmd run db:start`). If it was already
   running before pulling this branch, stop/start it without resetting it to load
   the local config changes: SMTP port 54325 and the 3017 reset redirect.
4. Apply **only the new migration** to that local schema, once:

   ```powershell
   powershell -ExecutionPolicy Bypass -File tools/backup-email-local.ps1 -Mode apply
   ```

   This uses `supabase db query --local --file` for
   `20261028140114_verified_backup_email.sql`. It does not push migrations, reset
   data, or update remote migration history. An already-present
   `reboot_backup_email` schema means it has already been applied; do not drop it
   to silence an error. If the migration fails, inspect the first error. A
   normalized email collision in existing Auth data intentionally stops it.

The local baseline must include the account-merge/lifecycle schema and `user`
role, as well as the normal `auth.users`, `auth.mfa_factors`, `public.profiles`,
and `public.user_roles` tables. Applying unrelated untracked migrations is not a
prerequisite of this feature. To test the other student-experience changes too,
apply their two named migrations from `student-experience-release.md` locally.

## Run the enabled flow

Start the app in one PowerShell window:

```powershell
powershell -ExecutionPolicy Bypass -File tools/backup-email-local.ps1 -Mode start
```

In a second window, from the same checkout:

```powershell
powershell -ExecutionPolicy Bypass -File tools/backup-email-local.ps1 -Mode test
```

The helper obtains credentials from `supabase status` in memory and requires
`http://127.0.0.1:54321`. The app runs at **http://127.0.0.1:3017**; captured email
appears at **http://127.0.0.1:54324**. Backup mail goes only to local Mailpit on
54325. The app's real SMTP and external-service variables are overridden with
disabled/local values. No Rebel mailbox or password is needed for these tests.
Keep using this launcher rather than a normal `npm run dev` that may load your
real `.env.local` configuration.

The HTTP suite creates synthetic `example.invalid` users, exercises real Supabase
Auth and PostgreSQL, and deletes only those users afterward. It leaves captured
messages for inspection. It checks pending/verified login, inbox proof tied to
the correct user, replay denial, case folding, UUID and primary-email preservation,
SSR cookie login, direct Auth namespace collisions, service-RPC denial, generic
recovery replies, concurrent one-use recovery, removal revocation, and native
primary recovery delivery. It never sends messages outside local Mailpit.

Quota rows deliberately survive failed attempts and synthetic-user deletion.
Repeated runs can hit an hourly limit; wait for that limit to expire instead of
weakening rate limits or deleting production-like state to get a passing result.

## Check the default-off path

Stop only the app with Ctrl+C, then restart and test with matching flags:

```powershell
powershell -ExecutionPolicy Bypass -File tools/backup-email-local.ps1 -Mode start -FeatureOff
# In the second window:
powershell -ExecutionPolicy Bypass -File tools/backup-email-local.ps1 -Mode test -FeatureOff
```

The state endpoint returns `enabled:false`, mutations are unavailable, and the
existing primary-email Supabase login still works. Confirm the Account navigation
entry is hidden. The additive database ownership guard remains installed; turning
off the UI flag does not remove that guard or release reserved backup addresses.

## Desktop acceptance before release

- Add, resend, verify and remove a backup through the actual UI. Check expired
  and superseded links, stale tabs, interrupted delivery and wrong passwords.
- Open verification/reset links in another browser. Verification should ask for
  sign-in; reset should work without an existing session. A page preview alone
  must never consume a link. The link token disappears from the address bar.
- Test the primary reset UI end to end, password changes on the same account,
  membership/setup restrictions, archived accounts, and verified MFA accounts.
- Use a second browser to check alias removal and credential changes against
  in-flight login/recovery. Verify that completed password recovery revokes
  refresh sessions. Existing short-lived access JWTs may remain valid until
  expiry, as in Supabase's normal session model.
- Confirm both regular members and 90-day students can reach Account settings.
  Assistants can reach it without gaining access to other member pages.
- Recheck course continuation, preparation drafts and the help page separately.
  Mobile testing is outside this requested scope.

## Boundaries and release gate

The feature uses a private schema and service-only RPCs. Tokens are random,
hashed in storage, expire quickly, and are redeemed by explicit POST. Recovery
consumes the application grant before issuing a native Supabase token. PostgreSQL
and Supabase Auth are separate transactions: a failure after consumption burns
the link; request a new link, never retry it automatically. The final check before
the password update cannot make those two services one atomic transaction. The
race checks above are therefore part of the PC review.

The migration takes write locks while it backfills the ownership registry and
adds Auth triggers. Any later production application needs its own review of
existing email collisions, Supabase Auth privileges, migration duration, auth
hooks, and rate limits. No production migration or settings changes are part of
this branch push.

Before enabling for real users, complete the PC tests and review any failures,
configure a fixed HTTPS `BACKUP_EMAIL_ORIGIN`, a random server-only
`BACKUP_EMAIL_SECRET`, and `BACKUP_EMAIL_DELIVERY_MODE=smtp`. Use the authorized
Rebel sender and exact SMTP settings documented in `.env.example`. Keep
`BACKUP_EMAIL_ENABLED=false` until verified delivery and a reviewed rollout.
Primary recovery uses Supabase's own email configuration, so verify that too.

The support address is already known: **support@rebootmembers.com**. Its mailbox
activation, exact Rebel settings and an authorized real delivery test are still
pending. Do not request a Resend account or the support address again.

## Verification record

On October 28, 2026, the combined student-experience and authentication regression
run passed 236 tests, with the one PC-only HTTP test intentionally skipped. The
production build (including TypeScript checking) passed with local/dummy service
configuration; existing unrelated lint warnings remain. Focused lint passed for
new/changed backup-email code, and the PC PowerShell runner and HTTP test parsed
successfully. TypeScript checking also passed after the final password-proof race
fix. No production database, deployment, or real email service was used.

Implementation and laptop-only results are recorded in the branch's commit and
handoff. The opt-in HTTP suite is intentionally skipped on this laptop because
there is no local Supabase stack. Passing mock or PGlite tests is not evidence
that the complete Auth/database/email integration has passed. Record the PC
results here before considering release.

- [ ] Enabled local HTTP suite passes.
- [ ] Default-off local HTTP suite passes.
- [ ] Desktop acceptance and account-lifecycle scenarios pass.
- [ ] Native primary recovery UI passes.
- [ ] Real SMTP delivery and production rollout are separately approved.

References: [Supabase password auth](https://supabase.com/docs/guides/auth/passwords),
[Supabase recovery link generation](https://supabase.com/docs/reference/javascript/auth-admin-generatelink),
[Mailpit API](https://mailpit.axllent.org/docs/api-v1/), and
[Vercel branch deployment configuration](https://vercel.com/docs/project-configuration/git-configuration).
