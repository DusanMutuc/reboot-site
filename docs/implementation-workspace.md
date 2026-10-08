# Implementation meeting workspace

Administrators manage checklists at **Resources → Implementation Guides**. Every active Foundation and Legends system appears, including systems with no steps. A step has a title, a required description, optional resource links and PDF page ranges. Changes publish together on Save; simultaneous edits require a reload instead of overwriting another administrator's work. Saving an empty list removes the current checklist while keeping earlier revisions.

Coaches use **Student Workspace → Implementation**. Select a coaching cycle and a meeting card, then start the meeting. Cards are grouped into Past, Today, and Upcoming, with the next scheduled Business Review shown separately. The selected date, status, time zone, and attendance remain visible below the cards. A reminder returns to the latest unfinished meeting; older open sessions are labeled History because their progress has already been preserved. Today's appointment is selected first; otherwise the latest open session is preferred, then the closest valid appointment. Dates and time zones remain visible. Historical and upcoming starts require an explicit date confirmation.

The left column shows the cycle's prioritized systems and other action steps. Systems without steps show their action status without empty checklist controls. The right column holds that meeting's discussion notes and next actions, with the previous meeting's commitments and notes available alongside them. Suggest a resource follows the meeting notes so coaches can recommend follow-up material when wrapping up. Existing action-linked training remains available within each priority. Individual step-note controls have been removed; notes are entered at meeting level. Existing stored step-note records are retained.

**Add meeting**, in the Meetings header and in the empty state, provides recovery when a GHL appointment has not appeared. Choose a date within the selected coaching cycle (America/Edmonton). Creation adds the meeting to the same cards and selects it without starting a session or marking attendance. An existing unambiguous same-member/date appointment is reused; ambiguous matches require choosing an existing meeting. Repeated requests are idempotent. Unsaved meeting notes must be resolved before moving to the new meeting.

If the appointment later arrives from GHL, the existing importer can adopt a unique same-day, date-only, single-attendee manual meeting in place. This preserves its meeting ID, notes, progress, and attendance. Cancelled meetings are excluded from adoption. A changed date, multiple candidates, or a different attendee mapping may require reconciliation through scheduling.

The Business Review card uses the next noncancelled review after the selected cycle, including a saved date-only manual review. It appears only while that review is draft and its appointment date is today or later. Historical cycles do not borrow a later cycle's upcoming review. This card is informational and does not open an implementation session.

**Book for next meeting**, at the bottom of the workspace, prompts the coach to arrange the next implementation meeting or Business Review. The normal cadence is three implementation meetings before a Business Review. A future review booking does not skip remaining implementation calls; an extra implementation already scheduled before that review is respected. The prompt shows the matching existing appointment when available. Earlier unattended/cancelled appointments do not advance the count, and the selected started meeting counts as the call being wrapped up. Recommendations stay anchored to the selected meeting when reviewing history.

The same recommendation selects the embedded booking form by default. Coaches can temporarily switch between **Implementation** and **Business Review**, then choose **Use recommendation** to restore the default. This choice is local to the selected meeting and is not saved as a preference or a booking. The assigned coach's original GHL form handles date/time selection and the entire booking. There is no custom availability picker, GHL API booking endpoint or booking-request ledger. Cancelled meetings do not show a booking form.
Calendars use the selected member's current assignments, not the signed-in coach's own links. For each relationship, the server prefers an active, unexpired assignment for program course `2`, then a general assignment with no course. Other courses are excluded. When several assignments qualify, the newest `assigned_at`, then highest assignment ID, wins. Implementation uses the implementation coach's `impl_booking_url`; Business Review uses the primary coach's `m2_booking_url`. Missing assignments or links are explained in the panel; legacy 15-minute and generic embedded-calendar fields are not substituted.

Supported HTTPS LeadConnector URLs on `api.leadconnectorhq.com/widget/bookings/<slug>` load directly in an iframe; other valid HTTP(S) links open separately. Only allowlisted GHL embeds receive member prefill parameters. The selected member's name and email are passed as encoded `full_name` and `email` query parameters. Both were visually verified in Jelena's original embedded custom booking form; automated DOM inspection had incorrectly shown the email as blank. Email aliases are preserved, and a selected member's values replace existing values for those parameters. The separate member-details panel and Copy email button have been removed. The coach reviews the prefilled details before submitting. The frame is reset when the member, coach, booking type or prefill URL changes. No internal member IDs, authentication tokens, dates or appointment titles are passed.

GHL handles the appointment's title template, meeting location, confirmation rules, custom form, notifications and workflows. The app neither recreates these settings nor creates appointments through the GHL API. **Open calendar separately** uses the same booking URL and supported prefill. **Reload calendar** reloads only the form.

When the embedded GHL form reports a successful booking, the app automatically saves `next_meeting_booked` against the originating implementation session. There is no visible booking checkbox or status badge. Only the `msgsndr-booking-complete` message from the current iframe window and exact allowlisted GHL origin is accepted; loading, resizing and generic form submissions do not count. This completion event was verified in the currently served Classic and Neo GHL widgets. Its payload has no appointment or member identity, so the coach still reviews the entered member details. Bookings made in a separate tab cannot be confirmed by this listener.

The confirmation stays pinned to its original member, cycle, meeting and session. Duplicate events share one save; fresh reads and bounded retries handle revision conflicts or a lost acknowledgement without overwriting notes. Pending source IDs are retained in session storage across same-tab refreshes and meeting changes. A confirmation received before the session starts waits for the coach to explicitly start it. A failed save shows **Retry saving**, which retries only recording the flag, never booking another appointment. Completed and historical sessions support this update; cancelled sessions remain read-only. The flag does not change attendance, progress, saved notes or note authorship. Appointments still populate through the existing GHL detection/import process, which retains the provider's event title.

## Progress and history

- On Start, each priority with a nonempty guide receives a copy of that guide revision. The same action keeps this copy and cumulative progress for the remainder of the cycle. Later admin edits affect newly initialized checklists. An empty/missing guide may be initialized on a later meeting start if an admin has since added content.
- A check records completed work, its actor, time and meeting. The first new check on the appointment's local calendar date marks its existing attendance record. Preparation on another date, notes, and unchecks do not mark attendance. A manual attendance correction after that first check is respected.
- Only the latest open meeting changes cumulative checks and action status. Finishing saves a snapshot; starting another meeting freezes the previous open meeting's snapshot. Historical notes remain correctable without replacing its progress snapshot. Reopening is limited to the latest completed session.
- System completion is an explicit decision. The last checkbox does not promote its scorecard rating. Explicit action completion uses the existing scorecard promotion and next-review carry-forward behavior.
- A started appointment stays attached to its original cycle after rescheduling. Cancelled appointments are not selected for new work. Captured action references prevent deletion from erasing meeting history.
- The old Scheduling and cycle records section has been removed from Implementation, including its duplicate actions and legacy notes controls. Existing saved notes are retained. The private notes sidebar remains available, resource suggestions sit under meeting notes, and Member wins precedes the final booking confirmation section.

## Coaching notes history

The far-right **Coaching notes** workspace tab combines Business Review coaching comments, older M2/cycle comments, implementation meeting notes and next actions, and standalone coaching notes. It shows the original written date and author, with the meeting/review date as separate context. Newest first is the default; coaches can switch to oldest first. Every source is paginated on the server so older notes are not silently truncated. The screen displays 20 entries at a time with Show more.

New notes can be written without a meeting or cycle. They are stored in `general_coaching_notes`, with author/time set by the authenticated RPC and a client request ID preventing duplicate saves on retry. Creating a note does not create a coaching cycle. Unsaved drafts are protected when changing tabs, members, or pages.

Implementation notes have separate first-written and last-edited attribution. Checking steps, recording attendance, or finishing a meeting does not change note authorship. Existing implementation notes without that metadata show **Author not recorded / Written date not recorded**; the meeting date remains visible, and unknown written dates sort last. Later edits preserve unknown original attribution and record the editor separately. Legacy comment edits retain their existing original-author/date behavior.

This aggregate and new standalone notes are available to admins and actively assigned coaches. Existing source visibility is unchanged; the separate private-notes sidebar and individual implementation step notes are not included.

## Storage and access

Active partnerships with `shared_notes` enabled expose the same Business Reviews,
coaching cycles, implementation sessions, and standalone coaching notes from either
member's profile. Reads follow the expanded coaching-note view, preserving records
originally created under either partner. Review edits authorize against the attached
note rather than the review's original member ID. Disabling notes sharing removes
that access immediately; it does not copy, move, or delete history.

Attendance remains an independent domain. Workspace requests check the signed-in
coach's assignment through the selected member's attendance-sharing scope before
loading attendance or offering meeting creation. Shared session notes and progress
remain accessible when attendance is unavailable, but those edits cannot create or
change an unauthorized attendance record. Mutations pass the selected `_user_id`
to the six-argument `mutate_implementation_workspace`; the old five-argument call
remains compatible and enforces the same actor permissions. Booking links and
prefilled identity continue to use the selected member.

Apply `20261008024000_shared_coaching_workspaces.sql` before deploying the matching
application change. It follows the October account-lifecycle and partnership repairs
and preserves existing record identities. See [repair verification](shared-coaching-repair-2026-10-08.md).

`system_implementation_guides` identifies a guide by audience and stable system key. `system_implementation_guide_versions` stores ordered immutable content revisions. Guide saves run through `save_system_implementation_guide` using the authenticated administrator and an expected revision.

`implementation_action_checklists` pins content and cumulative progress. `implementation_meeting_sessions` owns meeting notes, revision and progress snapshots. `implementation_session_actions` protects referenced actions; `implementation_step_notes` retains historical step notes and `implementation_step_events` records checkbox transitions. `mutate_implementation_workspace` serializes writes on the coaching note, checks session revisions and enforces member/meeting/cycle ownership. `create_implementation_meeting` validates the same cycle date bounds, derives the actor from authentication, and uses the importer's member/date lock to prevent duplicate recovery appointments.


Admins/superadmins may manage guides and workspaces. Coaches and implementation coaches may access workspaces for members with an active, unexpired assignment. Members and unassigned coaches cannot access these meeting records through the new APIs. RLS applies the same restriction to direct reads; client table writes are revoked in favor of the guarded RPCs.

## Rollout

Apply these migrations in order through the normal deployment workflow before exposing the new UI:

1. `20260925010000_system_implementation_guides.sql`
2. `20260925020000_implementation_meeting_workspaces.sql`
3. `20260925030000_seed_system_implementation_guides.sql`
4. `20260929010000_coaching_notes_history.sql`
5. `20260929020000_manual_implementation_meetings.sql`
6. `20260929030000_implementation_next_meeting_booking.sql`

If CLI access is unavailable, `sql/2026-10-07_implementation_workspace_release.sql` is the equivalent initial-release script for the Supabase SQL Editor. Run the entire file as `postgres` in the intended project. It validates prerequisites and rejects existing or partially applied releases, then applies all six migrations and registers their history in one transaction. It includes read-only postflight checks. Do not run the six migrations separately after using that script.

The original booking form uses existing coach assignments and Coach Profiles links. It requires no new GHL API scopes or database tables. No production database changes or real booking submissions were made during verification.

No existing action progress or meeting attendance is backfilled into checkboxes. Existing cycle notes remain stored and readable in Coaching notes; removing the old Implementation panel does not delete notes or change their existing member visibility. The seed supplies 15 guides / 58 steps and preserves preexisting admin guides. See `implementation-guides-content.md` for source decisions and the regeneration command.

The guide and workspace pgTAP suites run inside rolled-back transactions. Run the existing `implementation_completion_carry_forward.test.sql` alongside them to check scorecard compatibility. Meeting date selection is covered by `node --experimental-strip-types --test tests/implementation-meeting-selection.test.mjs`.

Coaching history access, attribution, and idempotent creation are covered by `supabase/tests/coaching_notes_history.test.sql`; aggregation, pagination, and API validation are covered by `node --experimental-strip-types --test tests/coachingNotes.test.mjs`.

Manual meeting access, cycle boundaries, duplicate handling, and subsequent GHL adoption are covered by `supabase/tests/manual_implementation_meetings.test.sql`. The endpoint validation and actor-bound RPC are covered by `node --experimental-strip-types --test tests/implementationMeetingCreation.test.mjs`.

Upcoming review dates, cancellation and cycle boundaries are covered by `tests/upcomingBusinessReview.test.mjs`. Workspace training-link preservation is covered by `tests/implementationWorkspaceServer.test.mjs`, and coach/implementation-coach resource suggestion access by `tests/coachResourceSuggestionsPermissions.test.mjs`.

The booking confirmation's access, revision checks, meeting isolation, and lack of effects on notes/attendance/progress are covered by `supabase/tests/implementation_next_meeting_booking.test.sql` and `tests/implementationBookingApi.test.mjs`. Booking recommendations are covered by `tests/implementationNextMeeting.test.mjs`.

Booking coach selection, course fallback, expired assignments, deterministic ties and safe external URLs are covered by `tests/implementationBookingCoaches.test.mjs`. The iframe host/path allowlist and unsafe URL rejection are covered by `tests/coachBookingEmbed.test.mjs`.

Automatic booking confirmation is covered by `tests/coachBookingConfirmation.test.mjs` (message source, origin and payload), `tests/implementationBookingConfirmation.test.mjs` (source isolation, revision conflicts and lost acknowledgements) and `tests/useBookingConfirmation.test.mjs` (duplicate events, pending storage, busy sessions, retries and navigation races). These use mocked events and requests; no real GHL appointment is created by the tests.
