# Smart Doc saving and submission

The 8 October 2026 audit repairs address A5 (submission before saved answers) and
A10 (staff viewers loading another member's answers).

- The course editor reads responses by both placement and verified viewer ID.
  Failed status/answer reads keep editing disabled and offer a retry.
- Each owner and placement has a serialized browser save queue. Debounced edits
  are coalesced, acknowledged revisions alone are removed, and failed drafts stay
  in memory. Save failures are visible and retryable. Switching lessons flushes
  the queue instead of cancelling its timers.
- Submit/Update awaits pending fields and disables inputs during submission.
  Course outline/back navigation and same-window links await saves; save failure
  keeps the current page. Closing/reloading with unsaved answers triggers the
  browser's unsaved-work warning. In-memory drafts are not durable offline storage.
- Required indicators, completion totals and submission validation all use the
  prompt's authored `required` flag. Optional answers are still saved. A published
  document with no required prompts can be submitted.
- `/api/smartdoc/submit` uses the existing `submit_smart_doc` RPC. Validation and
  status change are atomic; upsert and submit lock the same unique response row.
  Editing submitted answers changes the response back to draft until resubmitted.
  Required whitespace-only answers and answers for another document are rejected.
  Repeated successful submits preserve the existing submission timestamp.
- The API normalizes table-returning progress RPCs and checks expected viewer IDs
  on queued writes. Legacy `/api/smartdoc/field` now passes the authenticated owner.

Apply `20261008021000_smartdoc_submission_integrity.sql` before the application
release. It replaces `get_smart_doc_progress(bigint,uuid)`,
`upsert_smart_field_value(bigint,bigint,uuid,jsonb)`, and
`submit_smart_doc(bigint,uuid)`. They remain SECURITY INVOKER and preserve content,
coaching, and merged-account RLS. Public/anonymous execution is revoked for the two
write functions; authenticated and service-role execution remains available.

The migration also repairs `cb_guard_smartdoc_publish_consistency()` and the
Smart Doc assignment in `set_node_state(bigint,text)`: adding a draft placement or
drafting its parent subtree no longer unpublishes a document used in another
published lesson. The existing node cascade and restricted function ACLs remain
intact. Publication still follows parent state, considering all placements.
Installing the migration does not rewrite document publication or answer rows.
The content-access migration still checks the individual placement's published path.

The browser-facing `get_user_smartdoc_answers(uuid,bigint)` and
`list_user_smartdoc_instances(uuid,bigint,boolean)` now share an explicit
`can_read_smartdoc_instance(uuid,bigint)` authorization check. Members can read
their own answers only through published, accessible placements. Current admins
retain historical and draft review access. Current coaches must be actively
assigned to the requested owner; they retain existing response history when
content or membership is retired, while unanswered placements follow the owner's
content access. Every query still selects only the requested owner's responses.
Anonymous execution is revoked; service reads remain available. Past, merged and
setup-incomplete staff cannot bypass these checks through their other roles.

The legacy `coach_reset_doc(bigint,uuid)` and
`coach_clear_field(bigint,uuid,bigint)` retain their assigned-coach/admin rules with
the same active-account prerequisite. Clearing an existing field locks the
response and changes it to draft atomically, so required answers cannot be removed
while the response stays submitted. Clearing an absent field is a no-op.

For rollback, retain the prior definitions and ACLs of the nine replaced functions
above and remove the new `can_read_smartdoc_instance` helper after restoring its
callers. There are no new tables or policies in this migration. The audit release
backup contains the deployed pre-change definitions, which matched the baseline.

Regression coverage: `smartDocReliability.test.mjs` runs the actual API handlers,
preview, lesson and course navigation components plus the save queue;
`smartDocSubmission.test.mjs` runs the migration on PostgreSQL via PGlite under
authenticated RLS. `smartDocReadAccess.test.mjs` applies the archive, onboarding,
content and Smart Doc migrations together and verifies member, admin, assigned
coach, unassigned/inactive coach, past, merged, pending and service access.
PGlite's single connection verifies queued transaction outcomes, not simultaneous
cross-connection lock contention.
