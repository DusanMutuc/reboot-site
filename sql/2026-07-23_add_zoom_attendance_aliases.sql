begin;

create table if not exists public.zoom_attendance_aliases (
  -- Canonical value produced by normalizeZoomName() in the application.
  -- Example: "Diana's iPhone" becomes "diana s iphone".
  alias_key text primary key,

  -- Original value retained so administrators can recognize the Zoom name.
  alias text not null,

  user_id uuid not null
    references public.profiles (id)
    on delete cascade,

  approved_by uuid
    references auth.users (id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint zoom_attendance_aliases_alias_not_blank
    check (btrim(alias) <> ''),

  constraint zoom_attendance_aliases_alias_key_not_blank
    check (
      btrim(alias_key) <> ''
      and alias_key = btrim(alias_key)
      and alias_key = lower(alias_key)
    )
);

create index if not exists zoom_attendance_aliases_user_id_idx
  on public.zoom_attendance_aliases (user_id);

comment on table public.zoom_attendance_aliases is
  'Administrator-approved mappings from Zoom display names to website users.';

comment on column public.zoom_attendance_aliases.alias_key is
  'Normalized Zoom display name. This is globally unique so one alias cannot resolve to multiple users.';

alter table public.zoom_attendance_aliases enable row level security;

-- No browser-facing policies are intentionally created. Reads and writes
-- should go through an admin-only server endpoint using the service-role client.

commit;
