# Reboot database architecture

This guide explains how the database fits together. Exact public columns, foreign keys, and RPC request signatures are in [the generated Supabase reference](generated/supabase-public-schema.md).

Snapshot verified against the live configured Supabase project on 2026-07-29. The website source was at commit `1138dc8`.

## Platform boundary

Reboot uses three Supabase surfaces:

| Surface | Responsibility |
|---|---|
| Supabase Auth | Accounts, sessions, email, phone, password flows, Auth metadata |
| Public Postgres schema | Profiles, roles, content, progress, coaching, attendance, KPI, resources, smart docs, and admin data |
| Supabase Storage | Course/library images, achievement images, uploaded resources |

The browser and session clients use the anonymous key and are subject to RLS. Server administrative code uses the service-role key and bypasses RLS.

## Identity and access

```text
auth.users
    │ same UUID (application invariant)
    ▼
public.profiles
    ├── user_roles ── roles
    ├── user_coaches ── profiles (coach)
    ├── user_assistants ── profiles (assistant)
    └── partnership_users ── partnerships
```

### Core relations

- `profiles` — display names, Looker/GHL links, introduction timestamp, and automatic/manual attention status.
- `roles` — stable authorization codes.
- `user_roles` — many-to-many user/role assignment.
- `coach_profiles` — booking, calendar, dashboard, form, and coaching links for a coach.
- `user_coaches` — historical coach assignments. Active rows use `is_active = true`; ending an assignment sets `ended_at`. `relationship_type` is `primary` or `implementation`.
- `user_assistants` — historical assistant assignments with the same active/ended pattern.
- `partnerships` and `partnership_users` — group members who may share KPI, attendance, or notes.

Supabase Auth email/phone is not duplicated in `profiles`. Cross-schema Auth relationships are not fully represented in PostgREST OpenAPI.

### Live role codes

| Code | Meaning in website |
|---|---|
| `admin` | Admin application and privileged APIs |
| `coach` | Coach workspace and assigned members |
| `user` | Standard member |
| `assistant` | Assistant-library-only experience |
| `past_member` | Normal access removed |
| `legend` | Additional member designation displayed in the UI |

Use codes, not the current numeric IDs.

## Content, courses, and libraries

```text
content_nodes
    ├── node_children ── content_nodes
    ├── content_blocks
    │       ├── resources
    │       └── smart_docs
    ├── content_node_roles ── roles
    ├── user_course_visibility ── profiles
    ├── course_sort_orders
    └── user_node_progress ── profiles
```

### Nodes and hierarchy

`content_nodes` is the shared content model. Website types recognize:

- Node types: `course`, `lesson`, `chapter`, `collection`, `playlist`.
- States: `draft`, `published`, `archived`.
- Visibility: `public`, `limited`.

`node_children` is a composite-key edge table. It stores `parent_id`, `child_id`, ordering, required status, label, and notes. The same child can only appear once under a given parent. Valid parent/child combinations are represented by `node_edge_rules`.

`course_sort_orders` controls top-level course order. `content_nodes.sequential_unlock` and edge requirements drive sequential access.

The separate `courses` relation is legacy and contains only `id`, `created_at`, `name`, and `start_date`. Do not confuse it with current course content.

### Blocks

`content_blocks` is ordered by `position` within a node. Supported website block types are:

- `text` — `text_md` stores sanitized HTML despite the legacy field name.
- `asset` — normally links `resource_id`.
- `divider`.
- `smart_doc` — links `smart_doc_id`.

Additional timing, label, notes, `settings`, and `data` fields support rendering and editor behavior.

### Course access and progress

- Role-based audience: `content_node_roles`.
- Per-user grants for limited courses: `user_course_visibility`.
- User progress: `user_node_progress`, status `not_started`, `in_progress`, or `completed`.
- Access checks: `can_user_access_course` and `can_user_access_node_via_course`.
- Mutations: `mark_node_started` and `mark_completed_and_cascade`.
- Unlock calculations: `get_child_unlock_status` and `get_child_unlock_status_bulk`.

Do not set progress rows directly when an RPC can apply cascading rules.

### Library roots

Server code resolves:

- Main library: `content_nodes.slug = 'library'`; fallback is the latest collection.
- Assistant library: `content_nodes.slug = 'assistant-library'`.

The assistant scope includes both roots but requires the `assistant` role.

## Resources, search, and storage

### Relations

- `resources` — canonical metadata for links, videos, podcasts, PDFs, images, and stored files.
- `tags` and `resource_tags` — resource categorization.
- `resource_access` — access analytics by user or session.
- `search_analytics` — query and result-count analytics.
- `resource_block_locations` — view of every block placement.
- `resource_primary_location` — view resolving a preferred open path.
- `tag_usage` — tag usage-count view.
- `node_assets_v` — resource placements beneath parent nodes.

`resources.storage_bucket` and `resources.storage_path` identify private stored files. `/r/[id]` resolves an authenticated resource to an external URL or a signed Storage URL.

### Storage buckets

| Bucket | Expected access | Use |
|---|---|---|
| `course-heroes` | Public URL | Course and library hero images |
| `achievements` | Public URL | Achievement icons/images |
| `resources` | Signed URL through `/r/[id]` | Uploaded PDFs and images |

The upload route accepts `pdf` and `image`, writes under `<type>/<random UUID>.<extension>`, inserts the `resources` row, and removes the object if the insert fails.

## Meetings and attendance

```text
meeting_types
    └── meetings
            └── meeting_attendance_base ── profiles
                    └── meeting_attendance (view)
```

- `meeting_types.code` is the stable identifier.
- `meetings.date` is a Postgres date, not a timestamp.
- Future GHL-backed Business Audit and Implementation meetings retain `date` for compatibility and also store `starts_at`, `ends_at`, `meeting_timezone`, GHL status, and the unique `ghl_appointment_id`.
- `meeting_attendance_base` has a composite key of meeting and user.
- `meeting_attendance` is a view; use the base table or attendance RPC.
- `counts_toward_engagement` controls engagement calculations.

### Live meeting types

| Code | Name | Counts toward engagement | Active |
|---|---|---:|---:|
| `WEDNESDAY_SESSION` | Wednesday Session | yes | yes |
| `FRIDAY_DROPIN` | Friday Drop-in | yes | yes |
| `SET_YOUR_COMPASS` | Set Your Compass | no | yes |
| `M2_MEETING` | M2 Meeting | yes | yes |
| `IMPLEMENTATION_MEETING` | Implementation Meeting | yes | yes |
| `ONE_ON_ONE_BEN` | 1-on-1 with Ben | no | yes |
| `ADMIN_MEETING` | Admin Meeting | no | yes |
| `LEGENDS_MEETING` | Legends Meeting | yes | yes |

Preferred write functions are `create_meeting_with_attendees` and `upsert_meeting_attendance`.

Scheduled GHL reconciliation uses service-role-only RPCs. `sync_business_audit_appointment` atomically upserts the `M2_MEETING`, student attendance row, connected `business_reviews` row, and coaching-note meeting link. `sync_implementation_appointment_v2` safely adopts one unambiguous same-day manual Implementation meeting before delegating to the base synchronization RPC, preventing a later hourly run from creating a duplicate. The `meetings_remove_cancelled_ghl_attendance` trigger retains canceled meetings for history while removing their attendance-backed member association, so they disappear from feeds, engagement, and Implementation slots. Existing meetings are not backfilled; eligibility starts at Calgary midnight on August 6, 2026.

### Zoom aliases

`zoom_attendance_aliases` maps a normalized Zoom display name to one profile. `alias_key` is globally unique. The table has RLS enabled and intentionally has no browser policies in its checked-in migration; admin server endpoints use service role.

## KPI tracking

```text
kpi_metric_types
    └── monthly_kpi_values
            └── monthly_kpi_records_base ── profiles
                    └── monthly_kpi_records (view)
```

`monthly_kpi_records_base` is one period row per user and `monthly_kpi_values` holds one numeric value per metric. Use `upsert_monthly_kpi_record` so the record and values remain consistent.

### Live KPI keys

| Key | Display name | Meaning |
|---|---|---|
| `closed_deals` | Closed Deals | Transactions closed in the period |
| `repeat_referral` | Repeat / Referral | Deals from repeat or referral clients |
| `pipeline_15_30` | 15/30 Pipeline | Clients in the 15/30 pipeline |
| `days_off` | Days Off | Days off in the period |
| `gross_revenue` | Gross Revenue | Gross revenue in the period |
| `profit` | Profit | Net profit in the period |

Dashboard-only aliases `total_closed` and `fifteen_thirty` are presentation keys, not database keys.

## Coaching, wins, and attention

### Coaching

- `coaching_notes_base` — writable, soft-deletable note record.
- `coaching_notes` — active-note view.
- `coaching_note_action_steps` — action item with status `not_started`, `in_progress`, or `complete`; may link a content node.
- `coaching_note_comments` — note conversation.
- `coaching_private_notes` — private per-user notes authored by a profile.
- `wins` — user wins added by staff.

Use the coaching and win RPCs listed in the generated reference for normal mutations.

### Business Audit preparation

`business_review_preparation_responses` is a one-to-one child of `business_reviews`; its `business_review_id` is both the primary key and cascading foreign key. It stores the six required written answers and two required 1-10 ratings, with 5 and 7 excluded by database constraints. Students access it only through the authenticated website API, which verifies `business_reviews.user_id` and rejects canceled appointments; direct browser policies are intentionally absent. Resubmission updates the same row and refreshes `submitted_at` and `updated_at`. Coaches with access to the student receive these answers in the Business Audit payload and can review them in the audit tab.

### Attention status

`profiles` holds:

- automatic status;
- optional manual override;
- manual reason;
- updater and update timestamp.

Values are `green`, `yellow`, or `red`. `user_attention_effective` exposes manual-over-auto status. `user_attention_status_log` is the audit trail. Use `set_user_attention_manual_status`; send a null status to return to automatic mode.

## Smart documents

```text
smart_docs
    └── smart_doc_prompts
content_blocks
    └── smart_doc_responses ── profiles
            └── smart_doc_response_values ── smart_doc_prompts
```

- `smart_docs` is the template.
- `smart_doc_prompts` defines ordered fields and optional choices/validation JSON.
- `smart_doc_responses` is a per-user, per-content-block instance with started/submitted state.
- `smart_doc_response_values` has a composite key of response and prompt.

Use `upsert_smart_field_value` for field updates. Website APIs expose progress, status, field upsert, general upsert, and submit operations.

## Achievements

- `achievements` — active definitions.
- `achievement_node_map` — nodes that imply an achievement.
- `user_achievements` — actual awards with timestamp and `awarded_via`.
- `user_achievements_inferred`, `user_achievements_missing`, and `user_achievements_extraneous` — reconciliation views.

Admin endpoints manage definitions and manual awards. Reconciliation functions exist in the live schema but are not called by the website.

## Views and writable bases

| View | Writable source |
|---|---|
| `coaching_notes` | `coaching_notes_base` / coaching RPCs |
| `meeting_attendance` | `meeting_attendance_base` / attendance RPC |
| `monthly_kpi_records` | `monthly_kpi_records_base` plus `monthly_kpi_values` / KPI RPC |
| `node_assets_v` | `content_blocks` and `resources` |
| `resource_block_locations` | `content_blocks`, `content_nodes`, `resources` |
| `resource_primary_location` | same source relations |
| `tag_usage` | `tags` and `resource_tags` |
| `user_achievements_*` | achievements source relations / reconciliation functions |
| `user_attention_effective` | `profiles` and attention-status functions |

## What the generated reference does not prove

PostgREST OpenAPI provides relations, columns, types, required/default status, key annotations, comments, and RPC arguments. It does not provide complete:

- RLS policies or grants;
- indexes and performance characteristics;
- triggers;
- check and unique constraints beyond exposed key annotations;
- function bodies or security-definer behavior;
- Storage policies;
- Auth schema internals.

For a migration or security review, obtain a database schema dump or inspect the Supabase dashboard in addition to these docs.

## Schema lifecycle

Recent checked-in SQL:

- `2026-04-23_add_past_member_role.sql`
- `2026-07-17_add_legends_meeting_type.sql`
- `2026-07-23_add_zoom_attendance_aliases.sql`

Refresh the live public reference after database changes:

```powershell
npm.cmd run docs:db
```

The command requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` and reads metadata only.
