# Redesign release decisions

Agreed on 21 September 2026 after comparing main `b68fc22` with redesign V1 `6d29ff1` (which already contains V2 `1346471`). This document supersedes the proposed dispositions in the earlier [reconciliation report](https://github.com/DusanMutuc/reboot-site/blob/bf5d2dd16a8f320212e8fb8f017d020f7a2cbcb7/docs/redesign-reconciliation.md).

## Keep together for the later redesign release

- Member homepage, navigation, and visual changes.
- Member discovery, search, and recommendations.
- Training assignment management, including the Business Review entry point and preservation of assigned-course access when course audiences are edited.

Release these together after catalogue tagging/curation is ready. Main and the redesign share the tagging model and admin writes; no retagging or data-format conversion was identified. Resources and the Library items linked to priorities need appropriate shared topics. Search visibility, homepage approval, publication, placement, and member access remain separate eligibility requirements.

The discovery flag does not hide the homepage redesign. Keep its routing/UI out of the maintenance release. Preserve main's newer Legends, review, pause, membership, and coaching behavior when integrating the redesign later.

## Selected maintenance

| Change | Agreed scope |
|---|---|
| Course loading | Await the course route parameters; preserve content/access behavior. |
| Library resources | Load only published resources inside member Library guides; preserve main's library scopes and permissions. Existing unavailable-resource rendering remains. |
| Resource links | Validate IDs/destinations and mark successful redirects private/no-store. Preserve main's authentication, 90-day entitlement checks, query sequence, and 120-second download-link expiry. These checks add no database or network requests. |
| Thumbnail sync | Fill missing thumbnails as scheduled maintenance. Cover all pages and NULL/blank images, preserve concurrent admin edits, and leave tagging/visibility unchanged. This job is separate from opening a resource. |
| KPI regression tests | Test main's existing input/formatting rules and thousands separators. Do not change revenue/profit rules or tracker behavior. |
| Local development | Retain the Supabase CLI, local database commands, guarded local launcher, and separate build output. Do not copy live data or run migrations against production. |

## Excluded or deferred

- **Podcast synchronization changes:** excluded. Keep main's existing importer and schedule.
- **Role-permissions migration:** deferred; do not add or apply it as part of this work.
- **Extra admin profile/promotion status fields:** optional response completeness, with no established current UI failure; deferred.
- **90-day meeting-edit endpoint:** deferred until an edit interface is requested.
- **Three-implementation-meeting limit:** reject. The earlier report mistakenly described it as a small fix. Main intentionally displays fourth and subsequent meetings; preserve that behavior.
- **Older KPI formatting:** reject. Keep main's current display/input behavior. The user's negative-revenue clarification explicitly requests no change from main.

Preparing a branch or pull request is not a production deployment. Keep the redesign unpublished until its separate release decision.
