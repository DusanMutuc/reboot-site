# Discovery: agreed purpose and implementation plan

Audited from the working tree 2026-08-31, branch `redesign/member-home-v1`, including the
uncommitted `supabase/` migrations. Revised with the member-approved review on 2026-08-31.
The build-state and data sections below describe the audit baseline, not production rollout.
Implementation progress is tracked at the end of this document.

## Final admin completion pass — approved 2026-08-31

Keep the redesigned Content/Tags layout. Implement and verify locally:

1. Assign topics only; show categories inherited from topics read-only. The four category
   roots are fixed, not editable. Synonyms target topics. Preserve existing legacy links
   rather than silently removing catalogue metadata during this infrastructure pass.
2. Add staff resource previews and containing-guide/course links, including multiple
   placements. Staff previews are not a promise of universal member access.
3. Track explicit embedded-resource review: needs review, reviewed/keep context, or
   reviewed/independent. A safe default is not a completed human review. Independent-use
   approval never implies homepage approval.
4. Use plain admin language. Count homepage approvals rather than claiming actual member
   visibility. Explain search, inherited category chips, publication and guide context
   accurately. Uncategorized approved resources may appear in All, not category chips.
5. Conservative duplicate suggestions; editable merge membership, dismiss/restore
   suggestions, explicit confirmation and no automatic merging.
6. Unsaved-edit protection, accessible controls, clear loading/save errors, grouped-picker
   ordering, and recovery of the local development server.

Verify database/API contracts and the admin-to-member journey with representative content;
do not reset the cloned database or silently classify real resources. Production changes
still require explicit approval and release checks.

**Pre-production product discussions (not excluded from launch planning):** revisit
recommendations first (the product owner's main concern), then whole-course search and
coach-assignment changes. Finish the six admin changes before those discussions; do not
implement a presumed redesign of these features in this pass. The analytics dashboard
and another visual redesign remain outside this pass.

**Sequencing confirmed 2026-08-31:** complete the local infrastructure and admin tooling
before populating vocabulary, classifying/tagging real catalogue items, evaluating real
search relevance, or building analytics diagnostics/dashboard screens. Synthetic technical
regression tests continue during implementation. Passing them is not a content-quality claim.

## Purpose and boundaries

Help members retrieve useful tools, reach material their coach has selected, and explore
relevant supplementary learning — while keeping structured guides intact and coaching
decisions with coaches.

- The original `/library` remains the browsable, structured collection of guides.
- Homepage discovery is supplementary exploration, not another assigned learning path.
- Full discovery/search results have their own destination; they do not replace the library.
- Publication, member access, search eligibility, and homepage browse eligibility are
  separate concerns. A discovery setting never grants access or changes an assignment.
- Course training assignments are a **new feature awaiting rollout**, not a dead mechanism.
  Preserve them alongside system-priority/action-step links; do not infer obsolescence from
  low row counts or replace one with the other.

---

## Background: what members actually do

Three distinct jobs, informed by the user's production-data analysis. Historical counts
are reported audit findings, not independently revalidated unique-member demand estimates.

- **Retrieve** — *"I need the contract."* The member knows what they want. 6,902 logged
  search records, dominated by concrete nouns and misspellings. Typing fragments and repeat
  requests mean these are not necessarily 6,902 distinct member needs.
- **Follow** — *"My coach said watch Win the Listing."* 145 podcast and episode references
  written into coaching notes, several with "search for it!" appended, and matching
  zero-result searches. Coaches name content in prose because there is no field to attach
  a resource to an action step.
- **Explore** — *"What else is there on hiring?"* The homepage browse section. Real, but
  currently unmeasured, because there is nothing to browse yet.

Design implication: search addresses demonstrated friction; browse addresses an unmeasured
need. Reliable retrieval is a baseline requirement, while useful homepage exploration
remains the original product objective. Lack of browse measurements is not evidence of
low demand.

For **Follow**, the desired experience is a direct link to the exact content a coach
explicitly selected. Search supports remembered names and historical notes; it is not a
replacement for that destination. Do not infer coach picks automatically from prose.

---

## The rules, and why they hold

**R1 — Guides remain in the structured library and search, not homepage discovery.**
Guides are *systems*, installed three at a time, assigned by a main coach and verified by an
implementation coach. Surfacing an unassigned guide pushes a member ahead of their install
order, which the coaching explicitly guards against — one coach note flags scaling
prospecting before the P&L is installed as pouring water into a leaky bucket. Retrieval is
member-initiated and fine; recommendation is a coaching act and is not the platform's to
make. "Not browsable" here means excluded from homepage discovery and algorithmic
recommendations, never removal from the original guide library.

**R2 — Tools and lessons have different defaults; admin review confirms context.**
A *tool* (contract, template, script, form, checklist) is a candidate for direct retrieval
during work. A *lesson* normally retains its surrounding learning context. Being embedded
in a guide does not by itself settle eligibility, and neither does file type. Some PDFs
need instructions; some videos are independently useful. Media-type suggestions help the
review but never automatically authorize standalone presentation.

The retrieval pool may include embedded tools; the homepage exploration pool is curated
supplementary material. The two pools need not contain the same resources.

**R3 — In-guide tools return as themselves, labelled with their guide.**
A member searching `contract` has a deal on the table. Returning "Win the Listing →
Chapter 4" fails them even though it contains the contract. Returning a bare document loses
the connection to the system it supports. Returning the document *labelled* "from Win the
Listing" can satisfy both. Review must retain any essential instructions. The primary
action opens the approved tool; a distinct secondary link opens its accessible guide.
Embedded lessons should instead lead to their containing learning experience. Parent
labels, routes, and direct file access must all respect member access restrictions.

**R4 — Browse is vicarious, not prescriptive.**
Coaching replays and supplementary material: "here is another agent wrestling with what
you're wrestling with," never "here is your next assignment." This is what stops browse
competing with action steps or undermining a coach's sequencing. 61 of 126 podcasts are
tagged `[Coaching Replay]` in their titles — this content already exists and is
problem-shaped.

**R5 — Tags come from a closed vocabulary; no free-text entry.**
Free text already produced `p&l`, `pnl`, `p and l`, `p n l` and `profit and loss` as five
separate tags across 18 resources. An SOP alone will not hold; the constraint has to live in
the schema and the UI.

**R6 — A coach-attribution badge only ever appears on a real coach pick.**
Never on an algorithmic suggestion that happens to fit. The first time a member thanks a
coach for a recommendation they never made, every badge on the platform loses its meaning.

---

## Already built — do not rebuild

The foundation is considerably more complete than it looks from outside.

**Schema** (`20260827010000_discovery_foundation.sql`)
- `is_discoverable` + `catalog_priority` on `resources` and `content_nodes`, partial indexes
  filtered to published + discoverable.
- `resources.state` now defaults to `draft`, so new content is not discoverable until
  reviewed.
- `tags` extended: `slug`, `tag_kind` (`browse_category|topic|alias|format|audience|legacy`),
  `browse_category` (constrained to the four), `canonical_tag_id`, `is_active`. Constraints
  enforce that an alias carries a canonical and a non-alias does not.
- Four browse categories seeded as tag rows; unique index enforces one active tag per
  category.
- `content_node_tags` table + index + RLS.
- `refresh_tag_text()` folds a resource's tags, their canonicals, **and every active alias
  pointing at those canonicals** into `resources.tag_text`. Trigger-maintained. This
  supports topic synonyms, not necessarily the item-specific nicknames in Gap 6.

**Search** (`20260827030000_discovery_search.sql`)
- `search_discovery_items()` serves **both** search and browse. Called from
  `src/lib/discovery.ts:252`, `api/discovery/catalogue/route.ts:152`,
  `api/home/search/route.ts:152`. This sharing is the cause of Gap 3.
- Returns `resource` and `guide` item types (guides = `content_nodes` where
  `node_type = 'lesson'`).
- **Fuzzy matching implemented locally** — `pg_trgm` installed, `similarity()` / `word_similarity()`
  against title, tag_text and description, with floors that relax for short queries. This
  matters because `assistant` is the most-searched term on the platform and is misspelled at
  least ten ways (`asisstant`, `asistantt`, `assi sta nt`).
- Websearch + prefix + related tsqueries; `strict`/`related` tiers; `match_reason_codes`.
- Filters (category, type, tags, duration, date), 11 sorts, course-access gating via
  `get_available_course_ids_for_user`.

**Recommendations / analytics**
- `recommend_discovery_resources()` returns resources only — it reads `content_node_tags`
  for topic overlap but never emits a guide. This covers the guide exclusion for
  recommendations only; browse exclusion and search-only resource exclusion still need work.
- Six analytics tables + `discovery_logical_search_outcomes` view. Response counts and
  attributed opens/no-click outcomes are implemented. No-click is not proof of abandonment
  or failure, and production capture is not established by these local files.

**Admin** (`src/components/admin/ResourceLibraryAdmin.tsx`, 1,264 lines)
- Per-resource edit dialog with `is_discoverable` toggle and tag picker.
- Picker is **already closed** — reads `tags` excluding aliases, only adds options that
  already exist, no free-text creation path. R5 is enforced here today.

---

## Gaps

### 1. Nothing writes to the tag vocabulary — blocks everything else

`tags` carries the full taxonomy and the resource picker reads from it, but no screen
creates or edits rows. Grep for `tag_kind`, `canonical_tag_id`, `browse_category` across
`src` returns four files — two API routes, `lib/discovery.ts`, the resource admin — all
readers.

*Why it blocks:* the agreed vocabulary has nowhere to be recorded, so the closed picker
offers whatever 46 rows exist, half of them spelling variants. Tagging against a vocabulary
that later changes means doing the pass twice.

*Needs:* create/rename canonical tags with an optional browse category; create alias rows
pointing at an active canonical; deactivate rather than delete; usage counts per tag.
A merge must move/deduplicate resource and node assignments, preserve existing synonyms,
and preserve category/filter/recommendation behavior before retaining the old label as an
alias. Flipping `tag_kind` alone only repairs part of search behavior. Prevent self-links,
alias chains/cycles, and invalid canonical targets; the existing shape constraint alone
does not enforce those rules. Ordinary tagging stays closed; vocabulary maintenance is
an authorized admin operation.

### 2. Guides and lessons cannot be tagged

`content_node_tags` is read by both `search_discovery_items` and
`recommend_discovery_resources` but has **zero references anywhere in `src`**.

*Why it matters:* guide-side search quality currently comes from title and description
alone, and the recommender's "canonical guide-topic overlap" path has nothing to work with.

*Needs:* the same closed picker in course-builder or library-editor, writing to
`content_node_tags`. Per R1, node tags serve retrieval and topic overlap only — tagging a
guide must never make it eligible for homepage discovery.

### 3. Separate search, browse, and recommendation eligibility

`is_discoverable` gates eligibility inside `search_discovery_items`, and browse and search
both call that function, so a resource is in both surfaces or neither.

*Why it matters:* R2/R3 need a third state — an in-guide tool that is **directly searchable
but never browsable**. A contract should be findable by name and should not appear in a "For
You" grid. That cannot be expressed today. Related: the foundation migration backfilled
`is_discoverable = true` for every published resource, so the catalogue is currently
"everything published" rather than anything curated.

*Implementation choice:* retain `is_discoverable` as search eligibility for compatibility
and add `is_browsable`, default false, with browsable implying searchable. Admins see one
three-state choice: hidden from discovery, search only, or search and homepage browse.
This is independent of draft/published state and member access. Existing search eligibility
is preserved pending review, but published content is not automatically approved for browse.
Approved podcast sync remains explicitly searchable; sync must not overwrite an admin's
browse decision. New browse inclusion needs explicit review rather than a file-type rule.

The query must know whether it serves search or browse. Recommendations must use browse
eligibility **before** ranking/capping, not a post-limit UI filter. Guides stay out of both
homepage browse and recommendations. No fallback may silently restore an uncurated feed.

### 4. No parent-guide context in results

The function joins `resource_primary_location` to build `open_path`, so it knows where a
resource lives, but the return signature has no column for the containing guide's title
or id.

*Why it matters:* R3 depends on that label — it is the thing that lets the document and its
guide both be delivered at once.

*Needs:* resolve an accessible published placement for the requesting member and identify
the containing guide/course, not just the nearest chapter. Return separate resource and
container destinations and render "from Win the Listing" as its own link. The current
global `resource_primary_location` is not a member-specific access decision. Test direct
resource access as well as result eligibility, including multiple placements and restricted
or unpublished parents. Do not leak inaccessible parent titles in labels.

### 5. No bulk editing, no progress filters

Resource admin edits one item at a time through a dialog. No multi-select, no apply-to-many,
no filter for "untagged", "no browse category", or "discoverable but untagged".

*Why it matters:* at 258 resources and rising, this is the difference between an afternoon
and a week, and the most likely reason for the pass to stall halfway.

*Needs:* apply-to-many for tags, browse category and browsable state; filter by tagging
state and by media type (the tool/lesson defaults are type-driven); a visible progress count
— on a pass this long, "184 of 258" is worth more than it sounds.

### 6. No alias rows exist

The topic-alias mechanism exists; vocabulary data and item-specific name handling are
different tasks.

*Why it matters:* fuzzy matching fixes `asisstant` → `assistant`. It does nothing for
`sellers guide`, `just sold`, `legends`, `ask for business`, `7 questions` — those are not
misspellings, they are members using a different name than the org does. Aliases fix the
query without renaming content.

*Needs:* topic aliases once canonicals exist (Gap 1), plus content-scoped alternate names
where a phrase identifies a particular resource or guide/course. Never attach an episode
nickname to a broad topic and thereby make every tagged item match that nickname. Diagnose
each historical phrase before deciding whether it needs a synonym, a content nickname,
an access correction, or new content.

### 7. Analytics captured, never surfaced

Search response counts and engagement events are implemented, and
`discovery_logical_search_outcomes` aggregates attributed opens and no-click windows.
No admin screen reads them. Historical `search_analytics` and the new event model must not
be presented as directly comparable populations without normalization.

*Why it matters:* this turns "what is missing from the catalogue" from a one-off analysis
into a maintained list.

*Needs:* useful query diagnostics by frequency with investigation outcomes (vocabulary,
ranking, access, missing content). A low count can be a successful exact lookup, not a
content gap. Correct qualification before reporting demand: the current recorder qualifies
two-character requests, so counting qualified rows alone still inflates typing fragments.
Keep requests, meaningful search states, journeys, displayed results, and opens distinct.

Preserve the agreed analytics contract: opens do not mean completion or end a journey;
post-open reformulation is investigatory evidence, not proof of poor content; attribution
covers displayed pages with the agreed ten-minute search window; passive views and opens
do not downrank recommendations; only explicit finished/not-interested feedback suppresses
them. Preserve event integrity, agreed reporting privacy thresholds, and 30/90-day retention.
A full dashboard is not a prerequisite for the first catalogue-review/testing pass.

### 8. Upload discards tags

`api/resources/upload/route.ts:32` parses a `tags` array and comments that it is "currently
unused". The admin sends tag names on upload, tag ids on edit.

*Why it matters:* a population push is under way. Without this, new resources accumulate
untagged behind the pass and the catalogue drifts back.

*Needs:* validated tag IDs at upload against the closed vocabulary; consistent visibility
controls and errors that cannot silently report successful tagging when it was discarded.

### 9. Restore the library/discovery separation

Restore `/library` to the existing structured guide collection. Keep the full search and
supplementary browse page at a separate `/discover` destination, and make homepage links
describe the destination accurately. Search continuation must not replace library browsing.
Record visits to discovery separately from actual full-library opens.

### 10. Exact coach-selected content

Record the desired direct-link experience for specific coach-selected resources. Preserve
the new course-training assignment feature and existing action-step/system links. Do not
expand this into a replacement coaching workflow or infer attribution from note text.
Confirm the appropriate attachment location before extending the coach authoring UI.

---

## Data state

- **240/258** resources have no browse category; exactly one is tagged `mindset`. The four
  categories are a plan, not a state.
- **18/258** carry any tag, using 46 distinct rows — about half spelling variants.
- `is_discoverable` backfilled `true` for all published resources; nothing curated yet.
- **103/126** podcasts carry a format tag in the title (`[Coaching Replay]`, `[Showcase]`,
  `[Intensive Replay]`). Format is script-recoverable; topic is not.
- Media mix: 126 podcast, 60 video, 44 pdf, 19 image, 7 link, 2 document.
- Historic zero-result queries **predate these migrations and the fuzzy search**. Re-run
  them against the current index before treating any as missing content.

---

## Open questions

1. Is `node_type = 'lesson'` the right retrieval granularity, or should whole courses also
   be matchable?
2. Is `legends` returning zero because content is absent, or because course gating filters
   it out for the searching member? Different fix either way.
3. Who owns tagging after the initial pass, and do they need a simpler screen than the bulk
   tool?
4. Where should a coach attach an exact supplementary resource, without conflating that
   selection with a system priority or assigned course?

## Implementation checkpoints

Work locally against the cloned database. No production migrations, catalogue edits,
deployment, or reset of the populated local database without the appropriate approval.
Use additive migrations so existing local work and data remain intact.

- [x] Record the agreed product corrections and training-assignment clarification.
- [x] First slice: restore the structured library, separate the discovery destination,
  add search/browse eligibility and admin controls, enforce it in recommendations and
  fallback paths, and verify with regression tests.
- [x] Context/access infrastructure: approved direct items with accessible parent context;
  embedded lessons lead to their learning experience. Whole-course retrieval remains an
  explicit product question, not an implicitly added search surface.
- [x] Curation tooling (not catalogue population): canonical vocabulary management and safe merges, node tagging,
  bulk review/progress filters, upload tag persistence, content-scoped alternate names.
- [ ] Resolve the separately discovered role-table permission gap before production rollout;
  confirm scope with the product owner and verify current production configuration read-only.
- [ ] Admin browser walkthrough of the new controls. HTTP save-flow tests are complete;
  they do not replace visual/interaction review of the screens.
- [ ] Evaluate curated real-content scenarios and historical query examples in member
  access contexts. Expected destination and result quality matter more than result count.
- [ ] Measurement slice: qualification and journey-integrity review, privacy-safe query
  diagnostics, then the broader dashboard against the agreed analytics contract.
- [ ] Confirm coach-resource attachment and ongoing catalogue ownership with the product
  owner before extending those workflows.

Minimum first-slice tests: an approved browse resource appears in browse/search; a
search-only tool remains searchable but cannot enter browse or recommendations; guides
remain searchable and in the old library but never enter homepage discovery; hidden,
draft, or inaccessible content does not enter results; limits and counts are computed
after eligibility; deployment mismatch does not fall back to an uncurated feed.

### First-slice verification — 2026-08-31

- Applied only `20260831010000_discovery_surfaces.sql` to the local Supabase clone.
  No production migration, deployment, reset, or real-catalogue curation was performed.
- Local SQL suite: **111 passing assertions across five files**, including 18 surface
  checks and recommendation regression coverage with 105 competing search-only tools.
  Fixtures run in rolled-back transactions and now tolerate the populated clone's existing
  catalogue and active scorecard template without changing either.
- Visibility helper: **2 passing Node tests**. TypeScript no-emit check and targeted ESLint
  check passed.
- Browser: `/library` renders the original structured guide collection; `/discover` is a
  separate page; `assistant` returns real-content search results; homepage browse remains
  empty instead of falling back to the uncurated resource pool.
- Admin save-flow browser verification remains outstanding: the current browser session
  is a member and correctly receives "Admin privileges required". No admin account was
  signed in or real resource visibility changed merely to complete this smoke test.
- Post-test local counts: **258 resources, 91 content nodes, 1 training assignment**.
  **0 resources approved for browse** is intentional: existing search eligibility is
  preserved, but the catalogue still needs review. Do not interpret the passing structural
  tests as completion of search relevance, tool/lesson classification, or context routing.

### Context and admin infrastructure — 2026-08-31

Implemented locally with additive migrations `20260831020000` through `20260831033000`.
No production migration/deployment/reset or real catalogue curation was performed.

**Presentation and access**

- `resources.discovery_open_mode` is `context` by default. This is a presentation decision,
  not a guessed tool/lesson classification. When an item is embedded, `direct` explicitly
  approves using it independently. Nothing infers this permission from PDF/video type.
- Contextual embedded matches resolve to an eligible accessible lesson/guide. A guide and
  its embedded lesson matches deduplicate before counts and pagination. Format filters
  describe the delivered presentation, so a guide does not masquerade as a video result.
- Contextual resources without an eligible lesson destination are withheld rather than
  linking to a restricted parent or inventing whole-course retrieval. Unplaced resources
  retain their existing search eligibility. Embedded contextual resources do not enter
  browse merely because the browse flag is set.
- Approved direct resources open through `/r/:id`; a separate “From …” link opens the
  accessible containing guide/course. This secondary link is not falsely recorded as a
  direct resource open. Further attribution treatment belongs to the deferred analytics review.
- Member-specific paths enforce publication and ownership at each ancestor and existing
  course audience rules. Multiple placements are considered, with stable selection and
  preference for an eligible guide where a contextual item has several accessible homes.
- Resource and node RLS, placement views, direct resource opens, library service-client
  loaders, and course node/block reads use the shared access inventory. Existing staff
  resource preview is retained. Discovery visibility does not revoke assigned learning access.
- Course progress/unlock policy was not redesigned. Whole-course search remains open.
  Known external public URLs cannot be made private by an application redirect. Locally,
  the `resources` Storage bucket is private; the artwork bucket is intentionally public.

**Admin tools**

- `/admin/discovery` provides paginated catalogue review and vocabulary maintenance.
  Filters cover untagged, uncategorized, search-enabled-but-untagged, embedded/unplaced,
  hidden and browse-approved records, plus title and format. Coverage counts describe
  active tagging/settings, not completed human review or universal member availability.
- Bulk edits select explicit items on the current page, show a confirmation, and apply
  tags/visibility/presentation transactionally. Unspecified fields stay unchanged.
  Replacing tags clearly warns that existing assignments are removed.
- Canonical names, categories, aliases and activity are editable. Aliases cannot be
  assigned directly, self-link or chain. Deactivation preserves assignments, deactivates
  dependent aliases, and removes inactive vocabulary from future index refreshes.
- Merges move/deduplicate resource and node assignments, retarget existing synonyms, and
  preserve the old name as an alias. Cross-kind/category merges require explicit resolution
  first; browse-category roots are not merge candidates. There is no one-click unmerge.
- Resource forms and the shared course/library node properties use a closed vocabulary
  picker. Node discovery settings save independently of the editor's existing content saves.
  Tagging a node never grants homepage browse or changes a training assignment.
- `search_names` are bounded, content-scoped alternate names, separate from canonical topic
  text. Their lexical/prefix matches take effect without spreading an episode nickname to
  every resource sharing a topic. Whole-course/chapter metadata does not enable search for
  those node types by itself.
- File upload validates existing tag IDs before uploading and commits the resource, tags,
  and alternate names together. Old clients submitting tag names fail visibly. A confirmed
  DB rejection cleans up only that new file; an ambiguous transport failure is not reported
  as successful tagging and retains the file for inspection rather than risking deletion
  of an object attached to a committed record.

**Technical verification**

- **234 SQL assertions across eight files** pass, including context/access, aliases and
  merges, bulk rollback, deactivation, nickname isolation, upload tag persistence, and
  56 role-permission assertions added in the authorized security follow-up.
  SQL fixtures run in rolled-back transactions.
- **4 Node validation tests** pass. TypeScript no-emit and targeted ESLint pass.
- **5 local HTTP scenarios** pass through normal cookie middleware: anonymous/member
  admin denial, vocabulary and metadata round trips, the discovery RPC response contract,
  direct resource access/denial, and upload/tag/signed-link behavior. The test explicitly
  verifies the app sees a nonce row in the local clone before any application writes.
- **6 additional role-permission HTTP scenarios** pass: direct REST/admin API denials,
  account-RPC bypass denials, assistant assignment/removal, Legend/Past Member changes,
  immediate admin promotion/revocation, and the authorized account-transfer dry run.
- HTTP fixtures use temporary synthetic accounts/resources/tags/files, clean up through
  normal APIs, and verify original row counts. An existing deferred analytics integrity
  trigger initially blocked Auth account deletion; its narrow execution-context fix is
  included. This changes no metric definitions, qualification rules or dashboard behavior.
- Final local inventory: **258 resources, 91 content nodes, 0 browse approvals,
  0 direct-presentation approvals, 0 item-specific alternate names, 0 leftover test profiles**.
  Real tags/aliases/classifications were not populated. The app is running locally on port 3015.

**Role-permission follow-up — authorized and completed locally, 2026-08-31**

The product owner authorized fixing role permissions, provided admins can continue to
assign/change roles and trusted Supabase SQL Editor access remains available.
Migration `20260831040000_role_permissions.sql` is applied only to the local clone.
No production permission changes or real user role changes were made.

Audit findings and resolution:

- The cloned `roles` and `user_roles` tables had RLS disabled and broad anonymous/member
  grants. Both now enforce admin-only writes. Anonymous access is revoked. Signed-in users
  retain existing role reads, including cross-user reads used by coach-peer profile
  policies. This is an authorization-write fix, not a role-directory privacy redesign.
- `is_admin` and both `has_role` overloads now use a fixed, owner-executed context to avoid
  recursive RLS. They check the requesting user's stored assignments, not user-editable
  metadata. The existing meaning of admin remains the `admin` role code.
- Browser roles no longer hold table-wide TRUNCATE/TRIGGER/REFERENCES privileges or role
  sequence UPDATE privileges. RLS alone does not protect those operations.
- The legacy `transfer_user_data` and `transfer_user_data_admin` functions can copy roles.
  Their definer context and caller-supplied `skip_admin_check` made their old checks unsafe
  as a browser boundary. They, plus the account-deletion fallback `try_delete_user_db`, are
  now executable only by trusted server/owner callers. Their existing admin-guarded API
  routes retain service-role access. No other public function calling these RPCs was found.
- No FORCE RLS is enabled. `postgres` owner access, including SQL Editor sessions using
  that role, and the trusted service role remain available. Normal Auth deletion still
  cleans up role assignments. This follows PostgreSQL's documented
  [owner/RLS behavior](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) and
  [safe definer-function guidance](https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY).

Verification and limits:

- `supabase/tests/role_permissions.test.sql`: 56 rolled-back assertions cover anonymous,
  member, coach, admin, service-role, and SQL Editor-equivalent owner contexts. They cover
  INSERT/UPDATE/DELETE/upsert attacks, role-definition tampering, removing one's own Past
  Member restriction, legacy RPC bypasses, existing coach-peer reads, admin role CRUD,
  promotion/revocation, trusted role management and account-deletion cascades.
- `tests/rolePermissions.local.test.mjs`: six opt-in, loopback-only HTTP scenarios use
  synthetic accounts and verify the app sees a local nonce before any app mutations.
  The test proves real cookie middleware and admin APIs still work, not only SQL policies.
  Role changes take effect on the next request without requiring a fresh login. The
  account-transfer API was tested with a dry run, not a full real-data transfer.
- All previous discovery SQL, Node, and HTTP checks were re-run successfully after the
  permissions change. TypeScript no-emit and targeted ESLint pass. Temporary account,
  role, and transfer-log counts return to their starting values; no fixtures remain.

**Remaining security release gate**

Current production grants, policies, and function exposure are still **unverified**.
Before deploying, compare them with the audited clone, inspect existing policies/grants,
and approve a production rollout. The migration deliberately stops if either role table
already has policies, rather than silently combining permissive rules with unknown ones.

Six other RLS-disabled tables remain separately flagged: `content_node_roles`,
`partnership_users`, `partnerships`, `user_assistants`, `user_attention_status_log`, and
`user_merge_log`. Their permission/use-path audit has not been completed. They were not
blanket-locked because that could break existing account/coaching workflows. The role
write boundary is now tested locally; this is **not** a claim that the entire application
or production database has passed a comprehensive security audit.

### Final admin completion pass — implemented locally, 2026-08-31

The six approved admin changes are implemented. Migration
`20260831060000_discovery_admin_workflow.sql` was applied only to the local clone.
The redesigned Content/Tags layout and original structured member library remain intact.

- **Topics and categories:** content pickers assign active topics, never category roots
  or synonyms. Inherited categories are shown read-only. The four section roots cannot
  be edited, retired or repurposed through the admin tools. Synonyms target topics.
  Existing non-topic legacy assignments are preserved when replacing topic assignments;
  none existed in the local clone at the start of this pass.
- **Previews:** resource settings link to the asset and every distinct placement.
  Read-only staff previews render ordered blocks and link to parent/child learning nodes,
  including restricted or draft material an authorized admin may inspect. Preview access
  is not a member-access grant and does not mark learning complete.
- **Explicit review:** embedded items start in Needs review until a human records either
  Keep within its guide or Suitable independently. Both decisions leave that queue.
  Metadata/tag edits alone never record a review. Independent-use review and homepage
  browse approval remain separate. Changing presentation through an older editor clears
  the previous review marker rather than carrying an unrelated decision forward.
- **Plain-language outcomes:** counts label approvals rather than guaranteed visibility;
  outcome explanations distinguish publication, member access, guide context, All versus
  category chips, and learning containers not yet returned as standalone search results.
- **Duplicates:** suggestions use conservative spelling comparisons, not shared prefixes
  or inferred meaning. Admins can exclude individual terms, choose the retained topic,
  inspect the exact merge and cancel. Dismissals persist per admin and can be restored.
  Suggestions are deterministic across vocabulary ordering and never merge automatically.
- **Interaction safeguards:** labeled controls, ordered topic groups, clearer request
  errors/recovery, and protected dialog/tab/filter/page/admin-sidebar transitions.
  Bulk Clear asks before discarding pending changes and is disabled during saves.
  Refresh/close has a browser unload guard. Node discovery settings in the course/library
  editor open in a protected dialog, keeping node selection separate from an unsaved draft.

**Verification completed in this pass**

- 265 database assertions across nine SQL files pass, using rolled-back fixtures.
- 10 discovery unit tests pass, including category inheritance, review semantics,
  conservative/deterministic duplicate groups, navigation guards and non-JSON errors.
- Eight local HTTP scenarios pass with synthetic accounts/resources and cleanup:
  existing discovery/upload flows plus fixed roots, topic-only synonyms and assignments,
  persistent duplicate dismissals, explicit review and independent browse approval,
  multiple placements, member context links, and admin/member preview boundaries.
  Three real cloned lessons were also checked read-only against their stored block counts.
- Browser checks confirmed the queue, topic-only picker, immutable roots, synonym form,
  duplicate exclusions and confirmation, resource placement/parent preview links, and
  keep-editing/discard behavior for resource, synonym, bulk and shared node settings.
  Browser edits of real metadata were discarded; no real tag merge was confirmed.
- TypeScript no-emit and targeted ESLint pass. The only warning seen in the final admin
  browser check concerned existing Next.js smooth-scroll configuration, not discovery.
- Final local inventory remains **258 resources, 91 content nodes, 86 vocabulary rows,
  0 explicit resource reviews, 0 direct approvals, 0 homepage browse approvals, and
  0 duplicate dismissals**. Real vocabulary/category curation has not been performed.

**Local app recovery**

The recovered app runs at `http://127.0.0.1:3015/admin/discovery`, using an isolated
`.next-local` output directory so other development/build processes cannot overwrite
its generated chunks. `tools/start-local.ps1` reads credentials from the running local
Supabase stack, refuses a non-loopback API URL and does not write or print credentials.
With Docker and the existing local clone running, start it with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/start-local.ps1
```

No database reset, production deployment, production migration or real catalogue
classification was performed. This is an admin-tooling completion checkpoint, not a
claim of production readiness or real-search relevance.

**Next, before production**

1. Product-owner review of the admin workflow.
2. Discuss and settle recommendation behavior first, then whole-course search and
   coach-assignment changes. Record decisions before implementing any redesign.
3. Curate representative real content and test expected search/browse results as a member;
   complete the previously agreed analytics verification and release checks. Preserve the
   outstanding production/security verification described above rather than treating
   local synthetic tests as a production audit.
