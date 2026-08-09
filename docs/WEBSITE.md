# Reboot website architecture and API

## Runtime

- Next.js 15 App Router with React 19 and TypeScript.
- Material UI for the interface.
- Supabase Auth for sessions.
- Supabase Postgres/PostgREST for data and functions.
- Supabase Storage for images and uploaded resources.
- Vercel deployment with a daily podcast sync (`0 6 * * *`) and hourly Business Review/Implementation meeting sync (`0 * * * *`).

## Supabase clients

| File | Context | Credential |
|---|---|---|
| `src/lib/supabaseClient.ts` | Browser | Public URL + anonymous key |
| `src/lib/supabaseServer.ts` | Server with Next cookies | Public URL + anonymous key |
| `src/lib/supabaseAdmin.ts` | Server-only privileged operations | Public URL + service-role key |
| `src/lib/requireUser.ts` | Cookie or bearer authentication | Anonymous client, plus service-role role lookup |
| `src/lib/requireAdmin.ts` | Cookie admin authentication | Anonymous session client, then service-role role lookup |

## Middleware behavior

`src/middleware.ts` refreshes/reads the Supabase session and applies routing rules.

Public prefixes:

- `/delete-account`
- `/login`
- `/privacy-policy`
- `/support`
- `/signup`
- `/reset-password`
- `/api/auth`
- `/api/mobile`
- `/api/ghl`
- `/auth`
- Next static/image assets and common public files
- `/api/webhooks`

`/api/cron` is excluded by the matcher and authenticates with its own secret.

Authenticated behavior:

- No session → redirect to `/login?redirectTo=<path>`.
- `past_member` → `/access-removed`; APIs return 403, except the two ambassador-hub endpoints.
- Auth metadata `must_reset_password = true` → `/reset-password`.
- Assistant role → assistant library only.
- Non-assistants requesting assistant library → main library.

API handlers still need their own guards. A middleware-public API prefix does not make its handler safe automatically.

## Page map

| Area | Routes | Purpose |
|---|---|---|
| Entry/auth | `/`, `/login`, `/reset-password`, `/auth/mobile-handoff`, `/access-removed` | Role routing and session flows |
| Member | `/dashboard`, `/tracker`, `/business-review-prep`, `/resources`, `/courses/**`, `/library/**`, `/support` | Dashboard, KPI, Business Review preparation, courses, content, resources |
| Assistant | `/assistant-library/**` | Assistant-scoped library |
| Coach | `/coach`, `/coach/notes`, `/coach/progress`, `/coach/students-overview`, `/coach/student-dashboard/[userId]`, `/coach/kpi-tracker/[userId]` | Assigned-member coaching workspace |
| Admin | `/admin`, `/admin/[view]` | User, content, meeting, resource, achievement, and assignment administration |
| Utility | `/r/[id]`, `/delete-account`, `/privacy-policy` | Authenticated resource redirect and policy pages |

## API authorization labels

- **Admin** — `requireAdmin`; signed-in user must have role code `admin`.
- **User** — `requireUser`; cookie or bearer token, and `past_member` is rejected unless explicitly allowed.
- **Session** — handler calls `auth.getUser`; middleware may also protect browser requests.
- **Secret** — cron or webhook secret.
- **Service role** in the implementation is a database access mechanism, not authentication by itself.

## Admin APIs

| Route | Methods | Purpose |
|---|---|---|
| `/api/admin/achievements` | GET, POST, PATCH, DELETE | Achievement definitions and node mapping |
| `/api/admin/user-achievements` | GET, POST, DELETE | Manual awards |
| `/api/admin/action-required` | GET | Admin action-required overview |
| `/api/admin/assign-assistant-role` | POST, DELETE | Add/remove assistant role |
| `/api/admin/assign-coach` | GET, POST, DELETE | Manage coach assignments |
| `/api/admin/assistant-assignments` | GET, POST, DELETE | Manage assistant assignments |
| `/api/admin/booking-follow-up` | GET | All-coach booking follow-up |
| `/api/admin/coach-profiles` | GET, POST | Coach-specific links and GHL mapping |
| `/api/admin/coach-rosters` | GET | Coaches, assigned members, and partnerships |
| `/api/admin/create-user` | POST | Auth user + profile + role onboarding |
| `/api/admin/list-users` | GET | Role-filtered Auth/profile list |
| `/api/admin/list-coaches` | GET | Coach directory |
| `/api/admin/list-assistants` | GET | Assistant directory |
| `/api/admin/users` | GET | Admin user directory |
| `/api/admin/users/[userId]` | GET, PATCH, DELETE | Person details, profile/Auth updates, role flags, deletion |
| `/api/admin/users/[userId]/reset-password` | POST | Send password reset |
| `/api/admin/partnerships` | GET, POST | List/create partnerships; intended admin guard is currently not enforced correctly |
| `/api/admin/partnerships/[partnershipId]` | PATCH, DELETE | Update/delete partnership and members; intended admin guard is currently not enforced correctly |
| `/api/admin/resources/placements` | POST | Resolve resource placements |
| `/api/admin/status-overview` | GET | All-member status overview |
| `/api/admin/transfer-user-data` | POST | Privileged user merge/transfer |
| `/api/admin/zoom-attendance-aliases` | GET, POST, DELETE | Approved Zoom-name mappings |

### Course-builder APIs

| Route | Methods | Purpose |
|---|---|---|
| `/api/admin/course-builder/nodes` | GET, POST | List/create nodes |
| `/api/admin/course-builder/nodes/[nodeId]` | GET, PATCH, DELETE | Read/update/delete a node subtree |
| `/api/admin/course-builder/nodes/[nodeId]/duplicate` | POST | Duplicate subtree |
| `/api/admin/course-builder/nodes/[nodeId]/relocate` | PATCH | Move subtree |
| `/api/admin/course-builder/nodes/[nodeId]/children` | POST | Add child edge |
| `/api/admin/course-builder/nodes/[nodeId]/children/[childId]` | DELETE | Remove child edge |
| `/api/admin/course-builder/nodes/[nodeId]/children/reorder` | PATCH | Reorder child edges |
| `/api/admin/course-builder/nodes/[nodeId]/blocks` | POST | Add block |
| `/api/admin/course-builder/nodes/[nodeId]/blocks/reorder` | PATCH | Reorder blocks |
| `/api/admin/course-builder/blocks/[blockId]` | PATCH, DELETE | Update/delete block |
| `/api/admin/course-builder/nodes/[nodeId]/audience` | GET, PUT | Role and per-user course visibility |
| `/api/admin/course-builder/nodes/[nodeId]/sequential` | POST | Toggle strict sequencing |
| `/api/admin/course-builder/courses/reorder` | POST | Reorder top-level courses |
| `/api/admin/course-builder/rules` | GET | Valid node edge rules |
| `/api/admin/course-builder/unlock-status` | GET | Child unlock calculation |

All admin routes above are intended to be admin-only. Most call `requireAdmin`; their data queries may use either the service-role helper or the shared server-only course-builder admin client.

### Known authorization issue

The partnership handlers call `await requireAdmin()` but do not inspect the returned `{ ok, res }` result. `requireAdmin` returns a failure response; it does not throw. As a result, those handlers continue into service-role queries after a failed admin check. Middleware only proves that a normal `/api/admin/**` request has a session, not that the user is an admin. Fix this before relying on the partnership routes as an authorization boundary.

## Member, coach, and content APIs

| Route | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/business-audit-preparation` | GET, PUT | User | Load or update the signed-in student's preparation form for one Business Review |
| `/api/business-reviews` | GET | Coach/admin | Load a student's Business Reviews; manual creation is intentionally unavailable |
| `/api/business-reviews/[reviewId]/status` | PUT | Coach/admin | Mark a Business Review complete or reopen it without making its content read-only |
| `/api/coach/booking-follow-up` | GET | User | Booking follow-up scoped to coach |
| `/api/coach/status-overview` | GET | Session/coach logic | Status overview for assigned members |
| `/api/coach/workspace-students` | GET | User | Coach’s current assigned members |
| `/api/courses` | GET | User | Accessible course list |
| `/api/courses/[courseSlug]` | GET | User | Accessible course subtree |
| `/api/courses/[courseSlug]/unlocks` | POST | User | Bulk unlock statuses |
| `/api/library/collection` | GET | User | Collection contents by scope |
| `/api/library/detail` | GET | User | Accessible library node and blocks |
| `/api/library/sidebar` | GET | User | Library navigation tree |
| `/api/library/slug` | GET | User | Resolve node ID to accessible slug |
| `/api/nodes/[nodeId]/blocks` | GET | User | Authorized block list |
| `/api/progress` | POST | User | Mark node started/completed |
| `/api/podcast/episodes` | GET | User | Podcast episodes |
| `/api/my-schedule` | GET | Session | Coach links and schedule |
| `/api/user/assistant` | GET | Session | Current assistant contact |
| `/api/user/ambassador-hub` | GET | User, past member allowed | GHL ambassador link |
| `/api/mobile/ambassador-hub` | GET | Bearer user, past member allowed | Mobile ambassador link |
| `/api/mobile/reboot-hub` | GET | Bearer user | Short-lived web handoff link |
| `/api/resources/upload` | POST | Session + staff role | Upload PDF/image and create resource |

### Smart-document APIs

| Route | Method | Purpose |
|---|---|---|
| `/api/smartdoc/field` | POST | Upsert one prompt value |
| `/api/smartdoc/progress` | POST | Read completion progress |
| `/api/smartdoc/status` | POST | Read response status |
| `/api/smartdoc/submit` | POST | Submit response |
| `/api/smartdoc/upsert` | POST | Upsert response value |

All use `requireUser`.

## Auth and integration APIs

| Route | Methods | Authentication | Purpose |
|---|---|---|---|
| `/api/auth/is-admin` | GET | Session | Admin-role check |
| `/api/auth/clear-first-login-flag` | POST | Session | Clear `must_reset_password` Auth metadata |
| `/api/cron/sync-business-audit-meetings` | GET | Bearer `CRON_SECRET` | Reconcile future GHL Business Review and Implementation appointments with site meetings and reviews |
| `/api/cron/sync-podcasts` | GET | Bearer `CRON_SECRET` | Sync Transistor episodes into `resources` |
| `/api/ghl/create-assistant` | POST | `x-reboot-webhook-secret` | Create/update assistant account from GHL tags |

## External integrations

### GoHighLevel

Environment:

- `GHL_API_BASE`
- `GHL_VERSION`
- `GHL_PRIVATE_TOKEN`
- `GHL_LOCATION_ID`
- `GHL_ASSISTANT_WEBHOOK_SECRET`
- `GHL_MEETING_SYNC_LOOKBACK_DAYS` (optional)
- `GHL_MEETING_SYNC_FUTURE_DAYS` (optional)

Uses:

- assistant provisioning webhook;
- coach calendars and booking follow-up;
- forward-only hourly Business Review and Implementation meeting reconciliation;
- ambassador-hub contact/link resolution.

`GHL_LOCATION_ID` has a hardcoded fallback in `src/lib/config.ts`; deployments and scripts should set it explicitly.

The forward-only cutoff (`2026-08-06T00:00:00-06:00`) and Calgary timezone (`America/Edmonton`) are fixed Business Review rules in `src/lib/businessAuditMeetingSync.ts`. The job never scans before that cutoff. Repeated runs are safe because `meetings.ghl_appointment_id` is unique. An unambiguous same-day manual Implementation meeting is adopted by the GHL appointment rather than duplicated. Existing GHL appointments that disappear from valid scan matches are reported as an incomplete reconciliation, and incomplete cron runs return a non-success status instead of silently appearing healthy.

Coaches cannot manually create Business Reviews or Implementation meetings in the workspace. Both record types are created by the GHL reconciliation job; empty workspace slots are informational until a matching appointment synchronizes.

The GHL and admin provisioning routes currently create accounts with a shared bootstrap password and set `must_reset_password`. This is security debt and should not be reproduced in external scripts.

### Transistor

Environment:

- `TRANSISTOR_SHOW_ID`
- `TRANSISTOR_API_KEY`
- `CRON_SECRET`

The cron fetches all episodes, de-duplicates existing podcast titles, and upserts `resources` with Transistor source metadata.

## High-level data flows

### Member dashboard

Auth user → `profiles` → KPI RPCs + meeting RPCs + coaching-note relations + `wins` + `user_achievements`.

### Coach workspace

Coach profile → active `user_coaches` → current-member filter → profiles, status summary, course progress, KPI history, attendance, notes, smart-doc answers, and wins.

### Business Review preparation

Authenticated `/business-review-prep` uses the signed-in student's ID to resolve their nearest upcoming, non-cancelled, meeting-connected Business Review. When no future review exists, it falls back to the latest non-cancelled review so submitted answers remain editable after the meeting. The legacy `/business-audit-prep` URL redirects to the canonical page so existing GHL reminders continue working. The reminder link is static and does not need appointment-specific merge data. All eight answers are required; the two ratings allow 1-10 except 5 and 7. Preparation wins remain form answers and do not write to `wins`. Coaches see the saved responses at the top of the matching Business Review.

### Course render

Authenticated user → accessible course RPC → `content_nodes` subtree → ordered `content_blocks` → linked `resources`/`smart_docs` → progress RPCs.

### Library render

Authenticated scope → root slug → `node_children` tree → published accessible nodes → blocks/resources.

### Resource open

Authenticated `/r/[id]` → published `resources` row → external redirect or signed URL from the row’s Storage bucket/path.

### Admin user lifecycle

Admin guard → Auth admin API → `profiles` → `user_roles` → optional coach/assistant assignment relations. Delete/merge routes delegate cleanup to database functions when necessary.

## Environment inventory

| Variable | Exposure | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-safe credential | Session/RLS client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only secret | Admin DB/Auth/Storage |
| `GHL_API_BASE` | Server config | GHL API base |
| `GHL_VERSION` | Server config | GHL API version |
| `GHL_PRIVATE_TOKEN` | Server secret | GHL API authentication |
| `GHL_LOCATION_ID` | Server config | GHL location |
| `GHL_ASSISTANT_WEBHOOK_SECRET` | Server secret | Provisioning webhook |
| `GHL_MEETING_SYNC_LOOKBACK_DAYS` | Server config | Optional reconciliation lookback; defaults to 7 days |
| `GHL_MEETING_SYNC_FUTURE_DAYS` | Server config | Optional future scan window; defaults to 180 days |
| `TRANSISTOR_SHOW_ID` | Server config | Podcast show |
| `TRANSISTOR_API_KEY` | Server secret | Podcast API |
| `CRON_SECRET` | Server secret | Scheduled-job authentication |

`.env.local` is ignored by Git. `.env.example` contains names only.
