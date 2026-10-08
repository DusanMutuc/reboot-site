# Stabilization follow-up — 8 October 2026

## Implementation update integrated

Fetched `origin` and fast-forwarded `main` from `30bb87b` to `02f839c`, including `a4a6698` (guided implementation meetings and coaching notes history) and the Windows preflight correction. There was no overlap with the local modified/untracked files and no merge conflict.

The implementation workspace retains the existing KPI tab mounting/props and the corrected coaching-workspace member selection. Its migrations do not replace the KPI upsert or account-transfer functions. Focused compatibility checks passed, followed by the complete local Node suite.

## KPI fixes included in the stabilization release

Audit findings **A1 and A2** are repaired in `src/components/KpiTracker.tsx` and `src/components/home/TrackerPanel.tsx`, using shared draft/save coordination in `src/lib/kpiDrafts.ts`.

- A failed history read keeps the programme tracker disabled; every requested year must succeed. Both editors offer a history retry without requiring a page reload.
- Blur saves only the edited metric. The existing `upsert_monthly_kpi_record` RPC updates supplied keys and leaves omitted keys unchanged. An intentional clear still sends null.
- Saves for a member/month are serialized. Each request captures its field values and revisions before waiting; an older acknowledgement cannot clear or replace newer edits.
- Drafts survive month/member switches for the lifetime of the mounted editor. Responses update their original record, with errors and success feedback scoped to the current member/month.
- Failed writes keep their edits and can be retried. They do not block later queued saves.
- A genuine fresh history read refreshes untouched values while preserving dirty fields and edits/writes made during that read.
- Explicit Save continues to refresh its parent, including when blur already saved the edit. Autosave does not disable the button before its click can fire.
- Programme month-prop changes use an available month consistently for display and saves.

These fixes need no database migration. They do not introduce cross-browser conflict resolution; concurrent people editing the same metric still follow the existing database write behavior. Unsaved drafts are retained within the mounted editor, not across a page reload.

## Live access verification

Ran `tools/check-live-membership-access.mjs` against the configured project on **8 October 2026 at 16:28 Europe/Belgrade**. The script enforces GET/HEAD-only transport, does not sign in or create sessions, and outputs aggregate results only. The run made 25 GET requests, zero writes, and zero session creations.

| Sample | Result per sampled account |
|---|---|
| Two past members without staff roles | Entitlement inventory returned 20 main-library nodes; the node-access predicate allowed the sampled node |
| Two active programme-only members without staff roles | Inventory returned 20 main-library nodes, including 12 outside assigned systems; the node-access predicate allowed an outside node |
| Two ordinary full-member controls | Inventory returned 20 main-library nodes; the sampled node was allowed |
| Inactive programme-only members | No representative account available in the sampled metadata |
| Two legend/full-member accounts | No published Legends-only descendant node was available to test the download finding |

**Conclusion:** A3's membership entitlement mismatch exists in the deployed user-scoped access functions. These were service-role evaluations with explicit target user IDs. They do **not** establish actual authenticated-session RLS behavior or retrieve deployed policy/function definitions; available credentials expose REST/RPC access, not database catalog inspection. Policy wiring still needs verification when preparing the access migration. No member content, personal answers, credentials, or account identifiers were included in output.

The new implementation migrations contain no replacement for the discovery access functions. No production data or access rules were changed.

## Account-transfer compatibility follow-up

The initial compatibility check found that the pre-existing account-transfer migration omitted implementation checklists, meeting sessions/history, and standalone `general_coaching_notes` rows. The subsequent account-transfer task addresses those gaps in the new `20261008000000_complete_account_transfers.sql` migration, alongside verified destination-email GHL mapping, lifecycle history, Smart Doc conflicts, and durable retry recovery.

The user's five pre-existing transfer files were left unchanged during the stabilization pass. The subsequent account-transfer task updates the API/UI and adds a new migration; the previously applied migration remains unchanged. See [account-transfers.md](account-transfers.md).

## Original stabilization validation

- 38 behavioral KPI regressions pass, exercising the actual transpiled components through a deterministic hook/element harness with controlled database promises.
- Full suite after pulling implementation work: **267 tests total, 264 passed, 3 skipped, 0 failed**. The skipped cases require opt-in database/HTTP runtimes.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false` passed.
- ESLint passed for both changed KPI components, the shared store, test suite/harness, and read-only inspection script.
- `git diff --check` passed.
- No browser end-to-end session or database migration execution was performed.

## Stabilization release after account transfers

The account-transfer release was deployed separately at `f422e86`, including its new database migration. This follow-up release includes all completed audit fixes: booking/member filtering, partnership authorization, and KPI A1/A2. It also includes their regression tests, the audit records, and the read-only membership inspection script.

No additional database migration is required. Booking eligibility uses existing membership and enrollment tables and `get_current_member_ids`. Partnership guards use the existing admin authentication helper. KPI sparse writes use the existing `upsert_monthly_kpi_record` behavior, which preserves omitted metrics and clears only explicit null values. No environment or package changes are required.

The already-applied legacy `20260916000000_transfer_business_reviews.sql` and its standalone legacy test remain local, as previously requested. The committed account-transfer regression suite covers the current replacement.

Release validation on the complete working tree: **370 tests total, 368 passed, 2 skipped, 0 failed**, with the isolated PostgreSQL runtime enabled. The skips are opt-in local HTTP integration tests. TypeScript, targeted ESLint, and whitespace checks passed. The production build for this same application source passed during the immediately preceding transfer rollout; this release adds the remaining previously uncommitted source to Git.

Database access repair A3 and the other unresolved audit findings remain queued; they are not represented as repaired by this release.
