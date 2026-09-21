# Unpublished redesign reconciliation

Reviewed on 21 September 2026. This is a source reconciliation and release inventory, not approval to deploy. The cleanup branch is `codex/reconcile-unpublished-redesign`.

## Conclusion

**V1 already contains all of V2.** V1 is the continuation of the redesign despite its older-sounding name. There is no V2-only work to merge into V1. Use V1 as the source of unpublished work, and main as the source of current mainline behavior when selecting future changes.

**Do not merge the whole redesign branch into main yet.** It changes the member homepage and navigation immediately. `MEMBER_DISCOVERY_ENABLED=false` disables member discovery surfaces, but does not disable the visual redesign. The branch also predates newer main features and contains known integration issues described below.

The safe cleanup removes generated build output and records every changed path. It does not merge main into the redesign, resolve product decisions, apply database changes, or fix the listed feature issues.

## Branch history

| Branch | Source commit | Commit date, Europe/Belgrade | Relationship |
|---|---|---|---|
| `main` | [`b68fc22`](https://github.com/DusanMutuc/reboot-site/commit/b68fc22fb553aa9acfae6391da8391b8a1770267) | 14 September 2026, 21:53 | Current main snapshot; Legends reviews can include Foundation scorecards |
| `redesign/member-home-v1` | [`6d29ff1`](https://github.com/DusanMutuc/reboot-site/commit/6d29ff1048a8b0eaefd4496d7ecafd0bf23cf43a) | 17 September 2026, 14:14 | Latest checkpoint; its direct parent is V2 |
| `redesign/member-home-v2` | [`1346471`](https://github.com/DusanMutuc/reboot-site/commit/13464710e58796b1666baaea4f8061508709e9e3) | 26 August 2026, 11:24 | Fully contained in V1 |

Main and V1 share ancestor `fc0db91c7a3aa00e21ad6c7400ad0733284e75bb`. V1 is eight commits ahead and fifteen behind main by ancestry. Those counts overstate the functional divergence: the checkpoint includes substantial work already present on main through different commits.

Commit dates describe commits, not the time they were pushed. Repository contents cannot prove that an inaccessible computer has no remaining uncommitted files.

## Complete accounting

The comparison examines every path changed on either main or V1 since their common ancestor, and compares the actual file contents at both tips. It does not assume that all files in a three-dot GitHub diff are unreleased.

| Classification | Paths before cleanup | Meaning |
|---|---:|---|
| Already on main, byte-identical | 126 | No content to release from these paths |
| Changed only on the redesign side | 120 | Includes 30 generated build files removed by cleanup; 90 paths remain |
| Changed on both sides, contents differ | 41 | Requires selective reconciliation; six differ only in whitespace |
| Changed only on main | 51 | Newer main work to preserve, not proposed deletions |
| Total audited paths | 338 | Complete union of changes since the common ancestor |

After removing generated output, 131 source/configuration/documentation paths remain in the two differing redesign groups. These are **not 131 features**: some contain only formatting, comments, older copies of main behavior, or support material. The three reconciliation documents themselves are new review artifacts, outside the source snapshot counts.

- [Every path, grouped and linked to its source snapshot](redesign-reconciliation-inventory.md)
- [CSV with classifications, V2 comparison, and blob IDs](redesign-reconciliation-inventory.csv)

The six whitespace-only overlaps are `CurrentFocusModule.tsx`, `SystemsGrid.tsx`, `onePagePlaceholderData.ts`, `ninetyDayProgramme.ts`, `trainingAssignments.ts`, and `types/trainingAssignments.ts`. Two overlapping 90-day migrations differ only in comments. `courseAccess.ts` has import/formatting changes without an access behavior change. These should not be presented as new product features.

## Work that is already on main

| Area | Evidence and implication |
|---|---|
| Admin tagging and resources | 47 discovery admin implementation files match main exactly, including admin routes, curation UI, and supporting libraries. Resource administration, CourseBuilder discovery fields, uploads, coach resource suggestions, and discovery maintenance are already present. |
| Guides and handbooks | Ten of eleven discovery documentation files match main, including the admin guides, PDFs, quick reference, and design/queue documentation. Main's release runbook is newer and must be preserved. The guide filenames do not identify a second unshipped admin release. |
| Discovery database foundation | 25 discovery-named migrations and ten discovery SQL test files match main exactly. Member discovery builds on this existing foundation. |
| 90-day programme foundation | The 90-day homepage, programme/required-training cards, training helpers and types, coach suggestions, and lifecycle/cycle foundation are already represented on main. The redesign branch mixes these with additional UI and admin changes. |

## Actual unpublished release groups

| Group | Contents that differ from main | Proposed disposition |
|---|---|---|
| Member visual redesign | Momentum `/home`, `/dashboard` redirect, navigation, member-theme wrappers for libraries/courses/resources/review preparation, tracker and login styling, homepage rails/panels/cards | Hold together for the visual release. Default member routing changes to `/home`; this is not protected by the discovery flag. |
| Member discovery and recommendations | `/discover`, catalogue/events/preferences APIs, home search, discovery client/data/flag helpers, tracking hook, and live recommendation data consumed by the homepage | Hold with member discovery. Admin tagging can continue on main independently. Validate authenticated behavior and database contracts before launch. |
| Alternative homepage prototypes | `/home/hub`, `/home/onepage`, prototype shells, and placeholder datasets; `/home/momentum` redirects | Retained for now. Choose the supported design before deleting prototypes or exposing routes. |
| Training assignment management | Training-assignment API, coach/admin assignment panel, homepage training UI, and course audience saving that preserves assigned members' visibility | Separate feature decision. The intended Business Review entry point is not wired in its current display mode. Keep audience handling with assignment management. |
| 90-day admin changes | Meeting-update PATCH API, relocation of the existing promote-to-member control, additional local/SQL tests, and profile response exposing `is_ninety_day_user` | Review selectively against newer main lifecycle and roster behavior. The meeting editor endpoint has no matching edit control in the reviewed UI. |
| Podcast synchronization | Provider-ID upsert/update/archive behavior and expanded metadata/discovery fields | Independent backend proposal. Resolve preservation of admin curation before release. |
| Resource thumbnail synchronization | New cron route, synchronization helper, and scheduled job configuration | Independent backend proposal. Fix pagination and empty-thumbnail handling before release. |
| Role permissions migration | `20260831040000_role_permissions.sql` plus SQL/local tests | Keep deferred. Main explicitly deferred this migration; it changes role/RLS and RPC permissions and needs its own database preflight. It is not required to re-release the tagging UI already on main. |
| Development support | Supabase CLI dev dependency and `db:*` scripts, local PowerShell launch helper, environment examples, Next/TypeScript configuration and supporting docs | Review independently where useful. No runtime dependency upgrade was found; the added Supabase CLI resolves to 2.115.0. Preserve main's newer operational instructions. |

The standalone training SQL script is not by itself evidence that a new production migration must be run. Assignment schema already appears in main's database reference; confirm the target database and migration history before deciding whether any schema work is needed.

## Newer main behavior that must survive reconciliation

The 51 main-only paths and the main side of the 41 overlapping paths are part of the intended application, not obsolete files to remove. Preserve these groups when a future integration branch is prepared:

- Legends library routes, library scope/access, editor placement support, and navigation.
- Manual business review creation, scorecard version management, scorecard library administration, and the later ability to add a Foundation scorecard to a Legends review.
- Member pause handling, pause API/migration/tests, and corresponding directory/status behavior.
- Coach roster and workspace inclusion for 90-day users, lifecycle permissions, and the later any-coach review migration.
- Main's current KPI grouping/currency formatting and updated schema/preflight/release documentation.

Do not reconcile by copying the redesign tree over main. A normal merge also needs semantic review: a clean textual merge is not proof that these behaviors remain correct.

## Known issues and integration checks

These are findings for the next implementation decision, not changes made by the cleanup.

| Finding | Concrete evidence | Required follow-up |
|---|---|---|
| Redesign is not disabled by the discovery flag | [`home/page.tsx`](../src/app/home/page.tsx) renders Momentum and [`dashboard/page.tsx`](../src/app/dashboard/page.tsx) redirects to `/home` independently of the flag | Hold this routing/UI group until the visual release, or deliberately add a separate rollout control |
| Training panel is absent from the intended Business Review view | [`BusinessAuditTab.tsx`](../src/components/student/workspace/BusinessAuditTab.tsx) passes `contentMode="notes-only"`; [`CoachingNotesPanel.tsx`](../src/components/coach/CoachingNotesPanel.tsx) returns that view before the assignment panel | Add the agreed “Add Training” entry point when implementing the feature |
| Legends navigation points to the wrong route | [`StickyBar.tsx`](../src/components/home/StickyBar.tsx) uses `/library/legend`, while main provides `/legends-library` | Preserve main's actual Legends route and scope |
| Resource redirect weakens the existing 90-day access check | [`r/[id]/route.ts`](../src/app/r/[id]/route.ts) replaces main's `canAccessNinetyDayResource` path with the discovery access RPC; that RPC admits paths that do not enforce the same 90-day restriction | Retain the main entitlement guard when integrating discovery and redirect hardening; test each role |
| Editing 90-day profiles can submit incompatible status flags | [`UserProfilesAdmin.tsx`](../src/components/admin/UserProfilesAdmin.tsx) sends `is_past_member`/`is_legend` for 90-day accounts, while the user-update API rejects past-member edits without the member role | Retain main's omission of incompatible flags |
| Podcast refresh may overwrite admin curation | [`sync-podcasts/route.ts`](../src/app/api/cron/sync-podcasts/route.ts) upserts existing episodes with published/discoverable state and replacement metadata | Define which provider fields can change and preserve curated publication/visibility fields |
| Thumbnail maintenance can miss resources | [`resourceThumbnailSync.ts`](../src/lib/resourceThumbnailSync.ts) reads without pagination and treats blank thumbnails as missing but writes only where the column is SQL NULL | Add pagination and consistent blank/NULL handling before scheduling it |

## Small candidates that can be considered separately

These are possible follow-up patches to main, not approved or shipped changes:

1. Await the dynamic route parameters in `api/courses/[courseSlug]/route.ts`.
2. Return `is_ninety_day_user` in the admin user profile response.
3. Filter unpublished resources in `libraryAccess.ts`, while preserving main's newer Legends support.
4. Extract resource-open ID validation, HTTP(S)-only redirect checks, and private/no-store responses while retaining main's entitlement checks.
5. Limit implementation-note iteration to `impl1`, `impl2`, and `impl3` in `CoachingNotesPanel.tsx`.
6. Adapt the KPI formatting tests to main's current behavior; do not replace main's newer grouping/currency implementation with the older branch version.

Each candidate should be a focused change based on main with validation specific to its behavior. No candidate needs to carry the homepage redesign along with it.

## Cleanup completed

Cleanup commit: `d29e4bb` (`chore: remove generated redesign build artifacts`).

- Removed 30 tracked files under `.next-jobs-verify/`, totaling 4,391,852 bytes of generated bundles, cache, traces, and declarations. The files remain in historical commits.
- Added `/.next-*/` to `.gitignore` so temporary Next build directories stay untracked.
- Removed the stale `.next-jobs-verify/types/**/*.ts` TypeScript include.
- Added this decision report and the complete Markdown/CSV inventories in a separate documentation commit.

The cleanup branch starts at V1. Main and both source redesign branches remain unchanged. Prototype source, historical guides, migrations, and product changes remain available until their release disposition is decided. Existing uncommitted work in the original local checkout was not included.

## Validation and limits

- Production `next build`: passed after cleanup, including lint/type checks and generation of all 65 pages. Existing lint warnings remain.
- Focused Node tests: 24 passed across `discoveryAdminValidation`, `discoveryAdminWorkflow`, `discoveryItemIdentity`, `discoveryVisibility`, and `kpiFormat`.
- `git diff --check`: passed.
- The build used matching installed runtime dependencies from the existing checkout and placeholder loopback Supabase configuration, with member discovery disabled. A fresh `npm ci` and the newly added Supabase CLI were not exercised.
- Local Supabase integration/SQL tests, real authenticated member workflows, production credentials, and production migrations were not exercised. Passing the build and focused tests does not establish that every unreleased workflow is ready for production.

The next decision is which, if any, of the small independent candidates to bring to main. The redesign and member discovery can remain unpublished while that decision is made.
