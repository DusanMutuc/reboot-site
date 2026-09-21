# Member redesign branch

The canonical unpublished redesign branch is `codex/member-redesign`. It starts from main `8505d17`, after [maintenance PR #68](https://github.com/DusanMutuc/reboot-site/pull/68) merged on 21 September 2026. Compare this branch with main to review only the pending redesign release.

## Included release

- The active Momentum member homepage, member navigation, and associated visual changes to courses, Library, resources, tracker, login, and review preparation.
- Member discovery, search, recommendations, preferences and event recording, using the tagging model and admin curation already on main.
- The training assignment API and management panel in the full coaching notes view, homepage assigned-training display, and preservation of assigned-course access when course audiences change.
- Integration with main's current role landing-page precedence and Legends Library navigation. Content deep-links explicitly select all eligible Library items so a saved Legends-only filter does not hide a linked Foundation item.

Source: V1 `6d29ff1`, which already includes V2 `1346471`. Only the active release code was ported. No new database migration is included; the required shared discovery and training schema is already in main's baseline.

## Preserved main behavior

The branch retains main's manual and Legends business reviews, additional Foundation priorities, member pauses, 90-day lifecycle and resource checks, fourth and subsequent implementation meetings, and KPI input/formatting rules. Member routing now uses `/home`, while staff, assistants, past members and 90-day members keep their existing role precedence. The new full-member discovery APIs are blocked for 90-day-only members.

PR #68's course, published-resource, resource-link and thumbnail fixes and local database tooling are inherited from main. Podcast import behavior, deferred role-permission migration and optional admin status/meeting-edit changes are not part of this branch.

## Before release

Keep this branch out of production until the combined redesign is approved.

- Complete resource and Library topic tagging/curation, and review publication, placement, homepage approval and access eligibility. Existing live tagging is reusable; this branch introduces no replacement tagging store.
- Finish the requested **Add Training** entry point in the Business Review's notes-only view. The preserved editor is currently reachable in the full Implementation coaching notes view. Decide and test whether assignment editing should follow the active assigned-coach rule or main's broader Business Review coach access.
- Exercise assignment create/update/complete/remove and course-audience edits against a local database with representative cycle, course and member fixtures. Audience replacement remains a multi-write operation inherited from main; transactional failure recovery merits follow-up.
- Run authenticated end-to-end checks for full members, Legends, assistants, coaches/admins, past members and 90-day members, including mixed-role precedence, manual reviews and additional Foundation priorities.
- Check discovery with `MEMBER_DISCOVERY_ENABLED=false` and `true`. The flag controls discovery surfaces and legacy search fallback; it does **not** hide the redesigned homepage or prevent its routing from going live if the branch is merged.
- Review member attendance during paused dates. The imported homepage follows the existing member dashboard's counts; coach/admin engagement reporting excludes paused dates.

The original V1, V2 and reconciliation branches are retained as references. Unused Hub/OnePage prototypes and generated build files were not copied into this branch.

## Verification for branch preparation

- 57 automated tests passed, including role precedence, Library deep-links and main's maintenance coverage.
- The production build passed TypeScript, route compilation and lint checks; existing unrelated lint warnings remain.
- Changed UI and training files passed targeted ESLint. No production data was changed during validation.
- Authenticated local-database/browser flows have not been run for this port; the opt-in integration suites are retained for the pre-release checks above.

The integration also resets training editor state when switching member/cycle, disables it after a failed initial load, and performs the new assignment-access lookup before audience writes. Discovery's page reads its server flag per request, matching the dynamic homepage.
