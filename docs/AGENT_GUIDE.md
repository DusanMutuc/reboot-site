# Agent guide: Reboot database and website

This is the portable runbook for agents working on Reboot maintenance scripts. Read this file first, then use [DATABASE.md](DATABASE.md) for the domain model and [the generated schema](generated/supabase-public-schema.md) for exact columns and RPC arguments.

## Using this bundle in the scripts repository

Copy the complete `docs/` bundle rather than this file alone, plus the variable names from `.env.example`. Add this instruction to the scripts repository’s `AGENTS.md`:

```md
Before any Reboot database or website-integration task, read
`docs/AGENT_GUIDE.md`. Use `docs/generated/supabase-public-schema.md`
for exact public columns and RPC arguments.
```

Keep the website repository as the canonical source because it contains the callsites and the schema-refresh tool. Record the source website commit whenever the bundle is copied.

## Start-of-task checklist

1. Identify whether the task is a read, an additive write, an update, a merge, or a delete.
2. Read the relevant website callsite listed in the generated RPC reference. It often contains business rules not visible in the table shape.
3. Prefer a documented RPC when one exists for the operation.
4. Make destructive scripts dry-run by default. Require an explicit `--apply`.
5. Paginate reads and chunk large `in(...)` filters.
6. Back up the exact rows that will change before an applied destructive run.
7. Never print credentials, access tokens, full Auth user objects, or unnecessary personal data.
8. Verify postconditions and emit a small audit report.

## Sources of truth

Use this precedence when facts disagree:

1. Live database metadata and behavior.
2. Current website code.
3. Checked-in SQL in `sql/`.
4. Narrative documentation.

The checked-in SQL contains only recent changes. It is not a complete schema.

## Connecting from a Node script

Administrative scripts use the service-role client because they run outside a user session. Load credentials from the environment or an ignored `.env.local`; never hardcode them.

```js
import { createClient } from '@supabase/supabase-js';

if (typeof process.loadEnvFile === 'function') {
  process.loadEnvFile('.env.local');
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error('Supabase URL and service-role key are required.');
}

const supabase = createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
```

Required package:

```powershell
npm.cmd install @supabase/supabase-js
```

The service-role key bypasses RLS. The script is responsible for authorization, scope, validation, and auditability. For operations initiated by a signed-in person, prefer the website API so its role guards and validation run.

## Client and authorization choices

| Situation | Use | Why |
|---|---|---|
| Browser UI | `src/lib/supabaseClient.ts` pattern | Cookie-backed anonymous client; obeys RLS |
| Server component with the signed-in user | `getSupabaseServer()` | Reads the Supabase session from Next cookies |
| User API, including mobile bearer token | `requireUser(request)` | Authenticates and blocks `past_member` by default |
| Admin API | `requireAdmin(request)` then `getAdminClient()` | Verifies `admin`, then performs privileged work |
| Offline maintenance script | Service-role client | No browser session; bypasses RLS |
| Auth user lookup/update | `supabase.auth.admin.*` | `auth.users` is managed by Supabase Auth |

Do not use `SUPABASE_SERVICE_ROLE_KEY` in any file marked `'use client'`, in a `NEXT_PUBLIC_*` variable, or in a request sent from the browser.

## Identity rules

- Supabase Auth owns credentials, email, phone, password reset, and account identity.
- `public.profiles.id` is the application UUID for the same person and is used by nearly every domain table.
- Roles are normalized through `roles` and `user_roles`. Use role `code`, not a numeric role ID.
- Current live role codes are `admin`, `coach`, `user`, `assistant`, `past_member`, and `legend`.
- A person may have multiple roles.
- `past_member` removes normal access even if another role is present. Only the ambassador-hub APIs are explicitly allowed.
- `assistant` users are routed to the assistant library.
- “Current member” logic is centralized in `get_current_member_ids`; do not recreate it with an ad hoc role filter.
- Emails are in Supabase Auth, not `profiles`. Use paginated `auth.admin.listUsers()` or `auth.admin.getUserById()`.

### Creating a person

The website’s admin flow is:

1. Resolve the role by `roles.code`.
2. Create the Supabase Auth user.
3. Upsert `profiles` with the Auth UUID.
4. Upsert `user_roles`.
5. If the role is `coach`, ensure `coach_profiles` exists.

Prefer `POST /api/admin/create-user` for an interactive admin workflow. A script that implements this directly must handle partial failure and be safely retryable.

### Deleting or merging a person

Do not manually delete rows table by table.

- Delete: the website tries `auth.admin.deleteUser()` and uses `try_delete_user_db(p_user_id)` as a database fallback.
- Merge/transfer: use `transfer_user_data_admin(_source, _dest, _options)`.
- Merge operations are recorded in `user_merge_log`.

These are destructive operations. Require explicit IDs, a dry run where supported, and an audit artifact.

## Domain write rules

| Domain | Preferred operation |
|---|---|
| Course progress | `mark_node_started`, `mark_completed_and_cascade` |
| KPI period/value writes | `upsert_monthly_kpi_record` |
| Meeting creation | `create_meeting_with_attendees` |
| Meeting attendance | `upsert_meeting_attendance` |
| Smart document field | `upsert_smart_field_value` |
| Smart document submit | Website smart-doc API / `submit_smart_doc` where appropriate |
| Coaching notes, comments, actions | `create_coaching_note`, `add_coaching_note_comment`, `add_coaching_note_action_step` |
| Wins | `add_win`, `update_win`, `delete_win` |
| Manual attention status | `set_user_attention_manual_status` |
| Course access check | `can_user_access_course`, `can_user_access_node_via_course` |
| Current membership | `get_current_member_ids` |
| User transfer | `transfer_user_data_admin` |

These functions encode invariants, authorization context, cascading behavior, or audit logic. Direct writes can leave derived state inconsistent.

## Script safety pattern

Use this shape for any script that can mutate production:

```text
parse and validate arguments
load credentials without printing them
read the exact target set
calculate and display a summary
write a backup/audit artifact
exit if --apply is absent
perform bounded writes
re-read and verify postconditions
report changed IDs and counts
```

Additional rules:

- Use stable codes (`roles.code`, `meeting_types.code`, `kpi_metric_types.key`) rather than numeric IDs.
- Use ISO dates (`YYYY-MM-DD`) for Postgres `date`.
- Treat JavaScript `number` cautiously for Postgres `bigint`; IDs here are currently used as numbers, but scripts should avoid arithmetic on them.
- Do not update views. Use their `_base` table or the domain RPC.
- Do not assume PostgREST returns more than the project’s configured row limit; paginate.
- Chunk Auth listing and large UUID lists.
- For retryable inserts, use a real unique key with `upsert(..., { onConflict: ... })`.
- Do not use a broad `.delete()` or `.update()` without a verified filter.

The existing `scripts/replace-zoom-meetings.mjs` is a useful safety example: dry-run is the default, it emits comparison reports, backs up target rows, restricts deletion by meeting type and date, and verifies the result.

## Content model in one minute

- Courses and libraries share `content_nodes`.
- Hierarchy is an adjacency graph in `node_children`; position lives on the edge.
- Rendered material is in ordered `content_blocks`.
- A block may point to `resources` or `smart_docs`.
- A course is a `content_nodes` row with `node_type = 'course'`.
- Course visibility is `public` or `limited`; limited grants are in `user_course_visibility`.
- Role audience rules are in `content_node_roles`.
- User progress is in `user_node_progress` and should be changed through progress RPCs.
- Main and assistant library roots are resolved by slugs `library` and `assistant-library`.

## Known traps and current discrepancies

- `site_settings` is referenced by two UI components as an optional `library_root_id` lookup, but it is absent from the live public schema snapshot. Those components fall back to a collection node. Server library code uses the `library` slug.
- `courses` is a small legacy table used by older assignment/action-required code. Modern course content is `content_nodes` where `node_type = 'course'`.
- `coaching_notes`, `meeting_attendance`, and `monthly_kpi_records` are views. Their writable bases use the `_base` suffix.
- Dashboard display keys `total_closed` and `fifteen_thirty` map to database KPI keys `closed_deals` and `pipeline_15_30`.
- The Zoom replacement script’s help text mentions an npm script that is not present in `package.json`. Run it directly with `node scripts/replace-zoom-meetings.mjs` unless a script alias is added.
- The partnership API handlers call `requireAdmin()` but currently ignore its returned failure result. Middleware requires a session but does not enforce the admin role. Treat `/api/admin/partnerships` and `/api/admin/partnerships/[partnershipId]` as an open security issue until the handlers return `guard.res` on failure.
- Admin and GHL user provisioning currently use a shared bootstrap password in source and rely on `must_reset_password`. Do not copy that pattern into scripts; generate a strong random temporary credential or use an invite/reset flow.
- OpenAPI metadata does not include RLS policies, grants, indexes, triggers, checks, or function bodies. Never infer those from the generated reference.
- The generated schema contains public relations only. `auth.users` and Supabase Storage metadata are managed outside the public schema.

## Before handing off a script

- Confirm it uses the correct Supabase project through environment variables.
- Include `--help`.
- Make dry run the default for mutations.
- State the exact tables/RPCs touched.
- State whether service role is required.
- Include rollback or backup instructions.
- Run it once in dry-run mode and review the target counts.
- Keep generated reports and backups out of source control when they contain personal data.
