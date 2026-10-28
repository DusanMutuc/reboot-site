# Student experience release

This release covers course continuation, Business Review preparation drafts, and
the help form. It does not release the separate member-home/discovery redesign.

## Before going live

- [x] Dusan supplied **support@rebootmembers.com** on October 27, 2026 as the
  destination for help requests.
- [ ] Confirm that the support inbox is active and can receive mail. Dusan said it
  was not live yet when he supplied the address. Do not substitute the old inbox.
- [ ] Obtain Rebel’s exact outgoing SMTP settings once the mailbox is active.
  Configure `SUPPORT_TO_EMAIL=support@rebootmembers.com`, an authorized
  `SUPPORT_FROM_EMAIL`, `SUPPORT_SMTP_HOST`, `SUPPORT_SMTP_PORT`,
  `SUPPORT_SMTP_SECURE`, `SUPPORT_SMTP_USER`, and `SUPPORT_SMTP_PASSWORD`.
  Add a random `SUPPORT_RATE_LIMIT_SECRET` of at least 32 characters. All settings
  are server-only; enter credentials in the hosting environment, not source control
  or chat. No Resend account, API key, or Resend domain verification is required.
  Sending stays disabled until configuration is complete.
- [ ] Set `SUPPORT_SMTP_SECURE=true` for Rebel’s implicit TLS endpoint, or `false`
  for its STARTTLS endpoint. STARTTLS is mandatory when false; certificate
  verification remains enabled. Confirm Node.js 20 or later and SMTP connectivity
  from the deployed host.
- [ ] Apply `20261016094806_business_review_preparation_drafts.sql` and
  `20261016095111_support_requests.sql` through the normal deployment workflow
  before deploying the matching application. Verify grants and the PostgREST
  schema cache. Never reset a production database.
- [ ] Send an explicitly authorized test request through the configured help form.
  Confirm arrival in the new inbox, Reply-To, the screenshot attachment, and the
  student's confirmation. Provider acceptance alone does not prove inbox delivery.
- [ ] Check signed-in and signed-out support, including a member who cannot log in.
- [ ] Check continuation on a second device, nested/sequential lessons, completed
  course review, worksheet-save failure, and access revoked since the last visit.
- [ ] Save a partial preparation form, reopen it, submit all eight answers, and
  confirm the coach still sees the last submitted answers until resubmission.
- [ ] Test simultaneous tabs, failed saves, retries, and cancelled/rescheduled
  reviews before release.
- [ ] Set an operations retention schedule for private support messages, expired
  delivery payloads, and obsolete quota rows.

Implementation and local tests do not authorize a production deployment. The
support-setup reminder is attached to this chat and should stay quiet until
there is actionable release preparation.

## Intended student behaviour

Course entry resumes the latest unfinished accessible lesson, or the next available
unfinished lesson. Completed lessons remain reviewable without moving that resume
point. Finished courses open for review. Existing completion and access rules remain
in force; video playback timestamp persistence is deferred.

Preparation has a saved draft distinct from the submitted answer set. Partial work
does not change the coach's submitted preparation. Final submission still requires
all eight answers and the existing rating rules. Saving shows progress and failures,
and conflicts must be resolved without silently overwriting another device's work.
The account-transfer workflow copies submitted preparation; it does not copy these
private working drafts to the destination account.

Support asks for a message and an optional screenshot. Signed-in identity is checked
on the server; signed-out users provide a reply email. The source page excludes URL
queries and fragments. Screenshots are validated, bounded, and stripped of metadata.
Retries check the same request identity. A known unsent failure can be retried;
an uncertain delivery is held for review instead of being automatically sent again.
The form only confirms an SMTP-accepted request that has been recorded successfully.

## Delivery and operations

Support delivery uses Nodemailer with authenticated Rebel SMTP, a fixed configured
destination, and a sender authorized for that mailbox. No real email is sent by
automated tests; SMTP tests use synthetic local servers or transport doubles.
The recipient address is known, but the mailbox and exact SMTP settings are pending.
A real end-to-end delivery check remains a release prerequisite.

Keep support request records and delivery failures private to authorized operations.
Do not paste message bodies, screenshots, API keys, or personal details into logs.
Investigate expired or unresolved deliveries before asking a student to submit again.
Rate limiting is enforced by the database across server instances; the network
identity is hashed with the configured secret rather than stored as a raw IP address.

Delivery retries happen when the student retries the form; there is no background
email worker. SMTP has no provider idempotency key. A stable Message-ID helps locate
the request in Rebel’s logs but does not guarantee deduplication.

The database claims a sending lease before the SMTP attempt. Definitive failures
before acceptance can be retried. An unknown outcome, a lost database acknowledgement
after SMTP acceptance, or an expired sending lease must not trigger another SMTP
attempt. These requests move to `needs_review`; students keep their text and
reference, and operations must check the inbox/mail logs before deciding what to do.
Expired preparation leases remain retryable because SMTP has not started.

Accepted or quarantined requests discard their stored delivery payload and screenshot.
Retained retryable-failure payloads must be removed under the retention schedule.

Both email environment values must be plain addresses. On Vercel, network limits
use its overwritten forwarding header. Other hosts share a conservative network
quota until a trusted proxy identity is explicitly integrated.

If the application release is rolled back, retain the additive database tables so
drafts and delivery records survive. The previous application will read the
unchanged submitted-response table; it will not expose or edit private drafts.

## Local verification

Before the SMTP change, the combined student-experience regression run passed 156
tests with no skipped tests. It covered
course continuation and access, SmartDoc save protection, preparation autosave and
submission retries, support form and delivery failures, and public-route access.
The database suites executed the migration SQL in isolated PGlite databases,
including permission, concurrency, revision, lease, and quota checks.

The changed TypeScript files passed ESLint and the full project passed TypeScript
checking and a production build. Existing lint warnings outside this change remain.
The support page was inspected in the desktop browser with delivery disabled.
Real inbox delivery and hosted-environment verification remain on the release
checklist above.

The SMTP replacement was verified on October 27, 2026 with 57 passing focused
tests: support form behaviour, request handling, seven real local SMTP protocol
scenarios, database leases/permissions/quotas, and public membership routing.
The SMTP scenarios cover implicit TLS, required STARTTLS, missing STARTTLS,
authentication rejection, final message rejection, disconnect after message
upload, and rejection of an untrusted certificate. They use synthetic localhost
servers only. Changed-file ESLint and the production build (including TypeScript
checking) passed. Existing unrelated lint warnings remain. Live service settings
were replaced with local/dummy values for the build; no real email was sent and
no production database or deployment settings were changed.


## Backup-email addition (not released)

On October 28, Dusan authorized implementation and a nonproduction branch push,
with full Auth/database testing deferred to his PC. Branch
`codex/verified-backup-email` adds one verified backup email for sign-in and
password recovery while retaining the existing Supabase account. It remains
default-off. See [the PC testing handoff](backup-email-local-testing.md) for the
exact local-only migration, app launcher, mail capture, and acceptance checks.

Do not enable the feature or apply its migration in production based on laptop
unit/PGlite results. Local Supabase integration, collision/backfill review,
verified email delivery, and a separate release decision are still required.
Include expired verification/recovery records and quota rows in the retention
plan. The support mailbox and Rebel SMTP requirements above remain pending.
