

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';


-- The hosted project has pg_trgm installed in public. Selective pg_dump does
-- not emit extension declarations, so recreate it explicitly for local replay.
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";



CREATE TYPE "public"."action_step_status" AS ENUM (
    'not_started',
    'in_progress',
    'complete'
);


ALTER TYPE "public"."action_step_status" OWNER TO "postgres";


CREATE TYPE "public"."business_review_status" AS ENUM (
    'draft',
    'completed'
);


ALTER TYPE "public"."business_review_status" OWNER TO "postgres";


CREATE TYPE "public"."coach_relationship_type" AS ENUM (
    'primary',
    'implementation'
);


ALTER TYPE "public"."coach_relationship_type" OWNER TO "postgres";


CREATE TYPE "public"."course_visibility" AS ENUM (
    'public',
    'limited'
);


ALTER TYPE "public"."course_visibility" OWNER TO "postgres";


CREATE TYPE "public"."membership_status" AS ENUM (
    'none',
    'past',
    'current'
);


ALTER TYPE "public"."membership_status" OWNER TO "postgres";


CREATE TYPE "public"."node_progress_status" AS ENUM (
    'not_started',
    'in_progress',
    'completed'
);


ALTER TYPE "public"."node_progress_status" OWNER TO "postgres";


CREATE TYPE "public"."share_domain" AS ENUM (
    'kpis',
    'attendance',
    'notes'
);


ALTER TYPE "public"."share_domain" OWNER TO "postgres";


CREATE TYPE "public"."system_scorecard_audience" AS ENUM (
    'foundation',
    'legends'
);


ALTER TYPE "public"."system_scorecard_audience" OWNER TO "postgres";


CREATE TYPE "public"."system_scorecard_status" AS ENUM (
    'not_started',
    'started',
    'complete',
    'consistent'
);


ALTER TYPE "public"."system_scorecard_status" OWNER TO "postgres";


CREATE TYPE "public"."user_attention_status" AS ENUM (
    'green',
    'yellow',
    'red'
);


ALTER TYPE "public"."user_attention_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'user',
    'coach',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."__dbg_chosen_coach"() RETURNS TABLE("dbg_user_id" "uuid", "coach_id" "uuid", "course_id" bigint, "assigned_at" timestamp with time zone, "is_active" boolean)
    LANGUAGE "sql" STABLE
    AS $$
with me as (select auth.uid() as uid),
chosen as (
  select uco.*
  from public.user_coaches uco, me
  where uco.user_id = me.uid
    and uco.is_active
  order by
    case when uco.course_id is null then 1 else 0 end,
    uco.assigned_at desc,
    uco.id desc
  limit 1
)
select
  me.uid as dbg_user_id,
  chosen.coach_id,
  chosen.course_id,
  chosen.assigned_at,
  chosen.is_active
from chosen, me;
$$;


ALTER FUNCTION "public"."__dbg_chosen_coach"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."__dbg_coach_links"() RETURNS TABLE("coach_id" "uuid", "coach_name" "text", "m2_booking_url" "text", "call15_url" "text", "course_id" bigint, "course_name" "text", "seen_profiles" boolean, "seen_coach_profiles" boolean, "seen_courses" boolean)
    LANGUAGE "sql" STABLE
    AS $$
with me as (select auth.uid() as uid),
chosen as (
  select uco.*
  from public.user_coaches uco, me
  where uco.user_id = me.uid
    and uco.is_active
  order by
    case when uco.course_id is null then 1 else 0 end,
    uco.assigned_at desc,
    uco.id desc
  limit 1
)
select
  ch.coach_id,
  concat_ws(' ', c.first_name, c.last_name) as coach_name,
  cp.m2_booking_url,
  cp.call15_url,
  ch.course_id,
  crs.name as course_name,
  (c.id  is not null)  as seen_profiles,
  (cp.user_id is not null) as seen_coach_profiles,
  (crs.id is not null) as seen_courses
from chosen ch
left join public.profiles        c   on c.id = ch.coach_id
left join public.coach_profiles  cp  on cp.user_id = ch.coach_id
left join public.courses         crs on crs.id = ch.course_id;
$$;


ALTER FUNCTION "public"."__dbg_coach_links"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_canon_user_att"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.user_id := public.canonical_owner_for(NEW.user_id, 'attendance');
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."_canon_user_att"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_canon_user_kpis"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.user_id := public.canonical_owner_for(NEW.user_id, 'kpis');
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."_canon_user_kpis"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_canon_user_notes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.user_id := public.canonical_owner_for(NEW.user_id, 'notes');
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."_canon_user_notes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_course_sort_orders_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  _t text;
begin
  select cn.node_type into _t
  from public.content_nodes cn
  where cn.id = new.course_node_id;

  if _t is null then
    raise exception 'course_sort_orders.course_node_id % does not exist in content_nodes', new.course_node_id;
  end if;

  if _t <> 'course' then
    raise exception 'course_sort_orders.course_node_id % must reference content_nodes(node_type=course), got %',
      new.course_node_id, _t;
  end if;

  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."_course_sort_orders_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_jsonb_inc"("c" "jsonb", "path" "text"[], "delta" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE STRICT
    AS $$
declare
  cur int;
  pg_path text;
begin
  pg_path := '{' || array_to_string(path, ',') || '}';
  cur := coalesce((c #>> path)::int, 0);
  return jsonb_set(c, pg_path::text[], to_jsonb(cur + delta), true);
end;
$$;


ALTER FUNCTION "public"."_jsonb_inc"("c" "jsonb", "path" "text"[], "delta" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_jsonb_inc"("c" "jsonb", "path" "text"[], "delta" bigint) RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE STRICT
    AS $$
  select public._jsonb_inc(c, path, (delta)::int);
$$;


ALTER FUNCTION "public"."_jsonb_inc"("c" "jsonb", "path" "text"[], "delta" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_rt_after_change_refresh_tag_text"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  perform public.refresh_tag_text(coalesce(new.resource_id, old.resource_id));
  return null;
end $$;


ALTER FUNCTION "public"."_rt_after_change_refresh_tag_text"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_status_rank"("s" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE STRICT
    AS $$
  select case s
           when 'not_started'  then 0
           when 'in_progress'  then 1
           when 'completed'    then 2
           else 0
         end;
$$;


ALTER FUNCTION "public"."_status_rank"("s" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_tags_after_update_refresh_dependents"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if TG_OP = 'UPDATE' and new.name is distinct from old.name then
    update public.resources r
    set tag_text = sub.tag_text
    from (
      select rt.resource_id, string_agg(lower(t.name), ' ') as tag_text
      from public.resource_tags rt
      join public.tags t on t.id = rt.tag_id
      where t.id = new.id
      group by rt.resource_id
    ) sub
    where r.id = sub.resource_id;
  end if;
  return null;
end $$;


ALTER FUNCTION "public"."_tags_after_update_refresh_dependents"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_v_cn_del"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  _owner uuid := public.canonical_owner_for(old.user_id, 'notes');
begin
  update public.coaching_notes_base
     set deleted_at = coalesce(deleted_at, now()),
         deleted_by = coalesce(deleted_by, auth.uid())
   where id = old.id
     and user_id = _owner
     and deleted_at is null;

  return null;
end;
$$;


ALTER FUNCTION "public"."_v_cn_del"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_v_cn_ins"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  _owner uuid := public.canonical_owner_for(NEW.user_id, 'notes');
  _id    bigint;
  _coach uuid;
BEGIN
  _coach := COALESCE(NEW.coach_id, auth.uid());
  INSERT INTO public.coaching_notes_base (user_id, coach_id, created_at, updated_at, m2_meeting_id)
  VALUES (_owner, _coach, COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now()), NEW.m2_meeting_id)
  RETURNING id INTO _id;

  RETURN ROW(NEW.user_id, _id, _coach, now(), now(), NEW.m2_meeting_id)
         ::public.coaching_notes;
END; $$;


ALTER FUNCTION "public"."_v_cn_ins"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_v_cn_upd"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  _old_owner uuid := public.canonical_owner_for(OLD.user_id, 'notes');
  _new_owner uuid := public.canonical_owner_for(COALESCE(NEW.user_id, OLD.user_id), 'notes');
BEGIN
  IF _old_owner = _new_owner THEN
    UPDATE public.coaching_notes_base
       SET coach_id      = COALESCE(NEW.coach_id, coach_id),
           m2_meeting_id = COALESCE(NEW.m2_meeting_id, m2_meeting_id),
           created_at    = COALESCE(NEW.created_at, created_at),
           updated_at    = now()
     WHERE id = OLD.id;
  ELSE
    UPDATE public.coaching_notes_base
       SET user_id       = _new_owner,
           coach_id      = COALESCE(NEW.coach_id, coach_id),
           m2_meeting_id = COALESCE(NEW.m2_meeting_id, m2_meeting_id),
           created_at    = COALESCE(NEW.created_at, created_at),
           updated_at    = now()
     WHERE id = OLD.id;
  END IF;

  RETURN ROW(COALESCE(NEW.user_id, OLD.user_id),
             OLD.id,
             COALESCE(NEW.coach_id, OLD.coach_id),
             COALESCE(NEW.created_at, OLD.created_at),
             now(),
             COALESCE(NEW.m2_meeting_id, OLD.m2_meeting_id))
         ::public.coaching_notes;
END; $$;


ALTER FUNCTION "public"."_v_cn_upd"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_v_ma_del"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  _owner uuid := public.canonical_owner_for(OLD.user_id, 'attendance');
BEGIN
  DELETE FROM public.meeting_attendance_base
   WHERE meeting_id = OLD.meeting_id AND user_id = _owner;
  RETURN NULL;
END; $$;


ALTER FUNCTION "public"."_v_ma_del"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_v_ma_ins"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  _owner uuid := public.canonical_owner_for(NEW.user_id, 'attendance');
BEGIN
  INSERT INTO public.meeting_attendance_base (meeting_id, user_id, attended, updated_at)
  VALUES (NEW.meeting_id, _owner, COALESCE(NEW.attended, false), COALESCE(NEW.updated_at, now()))
  ON CONFLICT (meeting_id, user_id)
  DO UPDATE SET attended = EXCLUDED.attended, updated_at = now();

  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."_v_ma_ins"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_v_ma_upd"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  _old_owner uuid := public.canonical_owner_for(OLD.user_id, 'attendance');
  _new_owner uuid := public.canonical_owner_for(COALESCE(NEW.user_id, OLD.user_id), 'attendance');
BEGIN
  IF _old_owner = _new_owner THEN
    UPDATE public.meeting_attendance_base
       SET attended = COALESCE(NEW.attended, OLD.attended),
           updated_at = now()
     WHERE meeting_id = OLD.meeting_id AND user_id = _old_owner;
  ELSE
    DELETE FROM public.meeting_attendance_base
     WHERE meeting_id = OLD.meeting_id AND user_id = _old_owner;

    INSERT INTO public.meeting_attendance_base (meeting_id, user_id, attended, updated_at)
    VALUES (COALESCE(NEW.meeting_id, OLD.meeting_id),
            _new_owner,
            COALESCE(NEW.attended, OLD.attended),
            now())
    ON CONFLICT (meeting_id, user_id)
    DO UPDATE SET attended = EXCLUDED.attended, updated_at = now();
  END IF;

  RETURN COALESCE(NEW, OLD);
END; $$;


ALTER FUNCTION "public"."_v_ma_upd"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_v_mkr_del"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  _owner uuid := public.canonical_owner_for(OLD.user_id, 'kpis');
BEGIN
  DELETE FROM public.monthly_kpi_records_base WHERE id = OLD.id AND user_id = _owner;
  RETURN NULL;
END; $$;


ALTER FUNCTION "public"."_v_mkr_del"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_v_mkr_ins"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  _owner uuid;
  _rec   public.monthly_kpi_records_base;
BEGIN
  _owner := public.canonical_owner_for(NEW.user_id, 'kpis');

  INSERT INTO public.monthly_kpi_records_base (user_id, period_start_date, last_updated_by, last_updated_at)
  VALUES (_owner, NEW.period_start_date, COALESCE(NEW.last_updated_by, auth.uid()), COALESCE(NEW.last_updated_at, now()))
  ON CONFLICT (user_id, period_start_date)
  DO UPDATE SET last_updated_by = EXCLUDED.last_updated_by, last_updated_at = EXCLUDED.last_updated_at
  RETURNING * INTO _rec;

  RETURN ROW(NEW.user_id, _rec.id, _rec.period_start_date, _rec.last_updated_at, _rec.last_updated_by)
         ::public.monthly_kpi_records;
END; $$;


ALTER FUNCTION "public"."_v_mkr_ins"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_v_mkr_upd"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  _old_owner uuid := public.canonical_owner_for(OLD.user_id, 'kpis');
  _new_owner uuid := public.canonical_owner_for(COALESCE(NEW.user_id, OLD.user_id), 'kpis');
  _rec       public.monthly_kpi_records_base;
BEGIN
  IF _old_owner = _new_owner THEN
    UPDATE public.monthly_kpi_records_base
       SET period_start_date = COALESCE(NEW.period_start_date, OLD.period_start_date),
           last_updated_by   = COALESCE(NEW.last_updated_by,   auth.uid()),
           last_updated_at   = COALESCE(NEW.last_updated_at,   now())
     WHERE id = OLD.id
     RETURNING * INTO _rec;
  ELSE
    DELETE FROM public.monthly_kpi_records_base WHERE id = OLD.id;
    INSERT INTO public.monthly_kpi_records_base (user_id, period_start_date, last_updated_by, last_updated_at)
    VALUES (_new_owner,
            COALESCE(NEW.period_start_date, OLD.period_start_date),
            COALESCE(NEW.last_updated_by,   auth.uid()),
            COALESCE(NEW.last_updated_at,   now()))
    ON CONFLICT (user_id, period_start_date)
    DO UPDATE SET last_updated_by = EXCLUDED.last_updated_by, last_updated_at = EXCLUDED.last_updated_at
    RETURNING * INTO _rec;
  END IF;

  RETURN ROW(COALESCE(NEW.user_id, OLD.user_id), _rec.id, _rec.period_start_date, _rec.last_updated_at, _rec.last_updated_by)
         ::public.monthly_kpi_records;
END; $$;


ALTER FUNCTION "public"."_v_mkr_upd"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_validate_node_state"("_state" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
begin
  if _state not in ('draft','published','archived') then
    raise exception 'Invalid state: % (allowed: draft|published|archived)', _state;
  end if;
  return _state;
end
$$;


ALTER FUNCTION "public"."_validate_node_state"("_state" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."coaching_note_action_steps" (
    "id" bigint NOT NULL,
    "coaching_note_id" bigint NOT NULL,
    "label" "text" NOT NULL,
    "library_item_id" bigint,
    "status" "public"."action_step_status" DEFAULT 'not_started'::"public"."action_step_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coaching_note_action_steps" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_coaching_note_action_step"("_coaching_note_id" bigint, "_label" "text", "_library_item_id" bigint DEFAULT NULL::bigint) RETURNS "public"."coaching_note_action_steps"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_step public.coaching_note_action_steps;
begin
  insert into public.coaching_note_action_steps (
    coaching_note_id,
    label,
    library_item_id
  )
  values (
    _coaching_note_id,
    _label,
    _library_item_id
  )
  returning * into v_step;

  return v_step;
end;
$$;


ALTER FUNCTION "public"."add_coaching_note_action_step"("_coaching_note_id" bigint, "_label" "text", "_library_item_id" bigint) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coaching_note_comments" (
    "id" bigint NOT NULL,
    "coaching_note_id" bigint NOT NULL,
    "author_id" "uuid",
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coaching_note_comments" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_coaching_note_comment"("_coaching_note_id" bigint, "_body" "text") RETURNS "public"."coaching_note_comments"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_comment public.coaching_note_comments;
begin
  insert into public.coaching_note_comments (
    coaching_note_id,
    author_id,
    body
  )
  values (
    _coaching_note_id,
    auth.uid(),
    _body
  )
  returning * into v_comment;

  return v_comment;
end;
$$;


ALTER FUNCTION "public"."add_coaching_note_comment"("_coaching_note_id" bigint, "_body" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wins" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "added_by" "uuid",
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wins" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_win"("_user_id" "uuid", "_body" "text") RETURNS "public"."wins"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_win public.wins;
begin
  insert into public.wins (
    user_id,
    added_by,
    body
  )
  values (
    _user_id,
    auth.uid(),
    _body
  )
  returning * into v_win;

  return v_win;
end;
$$;


ALTER FUNCTION "public"."add_win"("_user_id" "uuid", "_body" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_clone_system_scorecard_version"("_source_template_key" "text", "_actor_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  _source public.system_scorecard_templates%rowtype;
  _next_version integer;
  _target_key text;
  _category record;
  _new_category_id bigint;
begin
  select template.*
    into _source
  from public.system_scorecard_templates as template
  where template.key = _source_template_key
  for update;

  if _source.key is null then
    raise exception 'Scorecard template not found.';
  end if;

  if exists (
    select 1
    from public.system_scorecard_templates as candidate
    where candidate.audience = _source.audience
      and candidate.is_active = false
      and not exists (
        select 1
        from public.business_reviews as review
        where review.system_scorecard_template_key = candidate.key
      )
  ) then
    raise exception 'This scorecard already has an unpublished draft version.';
  end if;

  select coalesce(max(template.version), 0) + 1
    into _next_version
  from public.system_scorecard_templates as template
  where template.audience = _source.audience;

  _target_key := format('%s_scorecard_v%s', _source.audience::text, _next_version);

  insert into public.system_scorecard_templates (
    key,
    audience,
    name,
    version,
    is_active,
    created_at,
    updated_at
  )
  values (
    _target_key,
    _source.audience,
    _source.name,
    _next_version,
    false,
    now(),
    now()
  );

  for _category in
    select category.*
    from public.system_scorecard_categories as category
    where category.template_key = _source.key
    order by category.position, category.id
  loop
    insert into public.system_scorecard_categories (
      template_key,
      key,
      label,
      position,
      created_at,
      updated_at
    )
    values (
      _target_key,
      _category.key,
      _category.label,
      _category.position,
      now(),
      now()
    )
    returning id into _new_category_id;

    insert into public.system_scorecard_systems (
      template_key,
      category_id,
      key,
      label,
      position,
      library_item_id,
      created_at,
      updated_at
    )
    select
      _target_key,
      _new_category_id,
      system.key,
      system.label,
      system.position,
      system.library_item_id,
      now(),
      now()
    from public.system_scorecard_systems as system
    where system.template_key = _source.key
      and system.category_id = _category.id
    order by system.position, system.id;
  end loop;

  return _target_key;
end;
$$;


ALTER FUNCTION "public"."admin_clone_system_scorecard_version"("_source_template_key" "text", "_actor_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_clone_system_scorecard_version"("_source_template_key" "text", "_actor_id" "uuid") IS 'Creates one inactive, editable copy of a scorecard template with the next audience version number.';



CREATE OR REPLACE FUNCTION "public"."admin_discard_system_scorecard_draft"("_template_key" "text", "_actor_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  _template public.system_scorecard_templates%rowtype;
begin
  select template.*
    into _template
  from public.system_scorecard_templates as template
  where template.key = _template_key
  for update;

  if _template.key is null then
    raise exception 'Scorecard template not found.';
  end if;

  if _template.is_active or exists (
    select 1
    from public.business_reviews as review
    where review.system_scorecard_template_key = _template.key
  ) then
    raise exception 'Only an unpublished, unused scorecard draft can be discarded.';
  end if;

  delete from public.system_scorecard_systems as system
  where system.template_key = _template.key;

  delete from public.system_scorecard_categories as category
  where category.template_key = _template.key;

  delete from public.system_scorecard_templates as template
  where template.key = _template.key;
end;
$$;


ALTER FUNCTION "public"."admin_discard_system_scorecard_draft"("_template_key" "text", "_actor_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_discard_system_scorecard_draft"("_template_key" "text", "_actor_id" "uuid") IS 'Deletes an unpublished scorecard version only while no Business Review references it.';



CREATE OR REPLACE FUNCTION "public"."admin_publish_system_scorecard_version"("_template_key" "text", "_actor_id" "uuid", "_resolutions" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  _target public.system_scorecard_templates%rowtype;
  _review public.business_reviews%rowtype;
  _resolution jsonb;
  _snapshot jsonb;
  _priority jsonb;
  _rating jsonb;
  _old_system_key text;
  _target_system_key text;
  _target_system_id bigint;
  _target_system_label text;
  _target_library_item_id bigint;
  _starting_status public.system_scorecard_status;
  _mapped_priority_keys text[];
  _new_priority_position integer;
  _removed_priority_count integer;
  _removed_reviewed_count integer;
  _eligible_count integer := 0;
  _migrated_count integer := 0;
  _skipped_count integer := 0;
  _was_active boolean;
begin
  if jsonb_typeof(coalesce(_resolutions, '[]'::jsonb)) <> 'array' then
    raise exception 'Conflict resolutions must be an array.';
  end if;

  select template.*
    into _target
  from public.system_scorecard_templates as template
  where template.key = _template_key
  for update;

  if _target.key is null then
    raise exception 'Scorecard template not found.';
  end if;

  _was_active := _target.is_active;

  if not _target.is_active and exists (
    select 1
    from public.business_reviews as review
    where review.system_scorecard_template_key = _target.key
  ) then
    raise exception 'A retired scorecard version cannot be published again.';
  end if;

  if not exists (
    select 1
    from public.system_scorecard_systems as system
    where system.template_key = _target.key
  ) then
    raise exception 'A scorecard version must contain at least one system before publishing.';
  end if;

  for _review in
    select review.*
    from public.business_reviews as review
    join public.system_scorecard_templates as current_template
      on current_template.key = review.system_scorecard_template_key
    where review.status::text = 'draft'
      and current_template.audience = _target.audience
      and review.system_scorecard_template_key <> _target.key
    order by review.review_date, review.id
    for update of review
  loop
    _eligible_count := _eligible_count + 1;

    select count(*)::integer
      into _removed_priority_count
    from public.business_review_system_priorities as priority
    join public.system_scorecard_systems as old_system
      on old_system.id = priority.system_id
    left join public.system_scorecard_systems as target_system
      on target_system.template_key = _target.key
      and target_system.key = old_system.key
    where priority.business_review_id = _review.id
      and target_system.id is null;

    select count(*)::integer
      into _removed_reviewed_count
    from public.business_review_system_ratings as rating
    join public.system_scorecard_systems as old_system
      on old_system.id = rating.system_id
    left join public.system_scorecard_systems as target_system
      on target_system.template_key = _target.key
      and target_system.key = old_system.key
    where rating.business_review_id = _review.id
      and rating.reviewed_at is not null
      and target_system.id is null;

    _resolution := null;
    select item.value
      into _resolution
    from jsonb_array_elements(coalesce(_resolutions, '[]'::jsonb)) as item(value)
    where (item.value ->> 'reviewId')::bigint = _review.id
    limit 1;

    if _removed_priority_count > 0 or _removed_reviewed_count > 0 then
      if _resolution is null
        or coalesce(_resolution ->> 'action', '') not in ('upgrade', 'skip')
      then
        raise exception 'Business Review % has unresolved scorecard conflicts.', _review.id;
      end if;

      if _resolution ->> 'action' = 'skip' then
        _skipped_count := _skipped_count + 1;
        continue;
      end if;

      if _removed_reviewed_count > 0
        and not coalesce((_resolution ->> 'confirmReviewedRemoval')::boolean, false)
      then
        raise exception 'Business Review % contains reviewed systems that require confirmation.', _review.id;
      end if;
    else
      _resolution := jsonb_build_object(
        'reviewId', _review.id,
        'action', 'automatic'
      );
    end if;

    select jsonb_build_object(
      'review', to_jsonb(_review),
      'ratings', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'systemKey', system.key,
            'status', rating.status,
            'reviewedAt', rating.reviewed_at,
            'reviewedBy', rating.reviewed_by,
            'updatedBy', rating.updated_by,
            'createdAt', rating.created_at,
            'updatedAt', rating.updated_at
          )
          order by system.position, system.id
        )
        from public.business_review_system_ratings as rating
        join public.system_scorecard_systems as system
          on system.id = rating.system_id
        where rating.business_review_id = _review.id
      ), '[]'::jsonb),
      'priorities', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'systemKey', system.key,
            'position', priority.position,
            'actionStepId', priority.action_step_id,
            'startingStatus', priority.starting_status,
            'selectedAt', priority.selected_at,
            'selectedBy', priority.selected_by
          )
          order by priority.position, system.id
        )
        from public.business_review_system_priorities as priority
        join public.system_scorecard_systems as system
          on system.id = priority.system_id
        where priority.business_review_id = _review.id
      ), '[]'::jsonb)
    ) into _snapshot;

    _mapped_priority_keys := array[]::text[];

    for _priority in
      select item.value
      from jsonb_array_elements(_snapshot -> 'priorities') as item(value)
    loop
      _old_system_key := _priority ->> 'systemKey';
      _target_system_key := _old_system_key;
      _target_system_id := null;

      select system.id
        into _target_system_id
      from public.system_scorecard_systems as system
      where system.template_key = _target.key
        and system.key = _target_system_key
      limit 1;

      if _target_system_id is null then
        if not (
          coalesce(_resolution -> 'priorityReplacements', '{}'::jsonb) ? _old_system_key
        ) then
          raise exception 'Priority % in Business Review % needs a replacement or explicit removal.',
            _old_system_key, _review.id;
        end if;

        _target_system_key := _resolution -> 'priorityReplacements' ->> _old_system_key;

        if _target_system_key is not null then
          select system.id
            into _target_system_id
          from public.system_scorecard_systems as system
          where system.template_key = _target.key
            and system.key = _target_system_key
          limit 1;

          if _target_system_id is null then
            raise exception 'Replacement system % was not found in %.',
              _target_system_key, _target.key;
          end if;
        end if;
      end if;

      if _target_system_key is not null
        and _target_system_key = any(_mapped_priority_keys)
      then
        raise exception 'Business Review % would contain the same priority twice.', _review.id;
      end if;

      if _target_system_key is not null then
        _mapped_priority_keys := array_append(_mapped_priority_keys, _target_system_key);
      end if;
    end loop;

    delete from public.business_review_system_priorities as priority
    where priority.business_review_id = _review.id;

    delete from public.business_review_system_ratings as rating
    where rating.business_review_id = _review.id;

    update public.business_reviews as review
    set system_scorecard_template_key = _target.key,
        updated_at = now()
    where review.id = _review.id;

    insert into public.business_review_system_ratings (
      business_review_id,
      template_key,
      system_id,
      status,
      reviewed_at,
      reviewed_by,
      updated_by,
      created_at,
      updated_at
    )
    select
      _review.id,
      _target.key,
      target_system.id,
      coalesce(
        (source_rating.value ->> 'status')::public.system_scorecard_status,
        'not_started'::public.system_scorecard_status
      ),
      nullif(source_rating.value ->> 'reviewedAt', '')::timestamptz,
      nullif(source_rating.value ->> 'reviewedBy', '')::uuid,
      nullif(source_rating.value ->> 'updatedBy', '')::uuid,
      coalesce(
        nullif(source_rating.value ->> 'createdAt', '')::timestamptz,
        now()
      ),
      coalesce(
        nullif(source_rating.value ->> 'updatedAt', '')::timestamptz,
        now()
      )
    from public.system_scorecard_systems as target_system
    left join lateral (
      select item.value
      from jsonb_array_elements(_snapshot -> 'ratings') as item(value)
      where item.value ->> 'systemKey' = target_system.key
      limit 1
    ) as source_rating on true
    where target_system.template_key = _target.key;

    _new_priority_position := 0;

    for _priority in
      select item.value
      from jsonb_array_elements(_snapshot -> 'priorities') as item(value)
      order by (item.value ->> 'position')::integer
    loop
      _old_system_key := _priority ->> 'systemKey';
      _target_system_key := _old_system_key;
      _target_system_id := null;

      select system.id, system.label, system.library_item_id
        into _target_system_id, _target_system_label, _target_library_item_id
      from public.system_scorecard_systems as system
      where system.template_key = _target.key
        and system.key = _target_system_key
      limit 1;

      if _target_system_id is null then
        _target_system_key := _resolution -> 'priorityReplacements' ->> _old_system_key;

        if _target_system_key is not null then
          select system.id, system.label, system.library_item_id
            into _target_system_id, _target_system_label, _target_library_item_id
          from public.system_scorecard_systems as system
          where system.template_key = _target.key
            and system.key = _target_system_key
          limit 1;
        end if;
      end if;

      if _target_system_id is null then
        delete from public.coaching_note_action_steps as action_step
        where action_step.id = (_priority ->> 'actionStepId')::bigint;
        continue;
      end if;

      _new_priority_position := _new_priority_position + 1;

      if _target_system_key = _old_system_key then
        _starting_status := (_priority ->> 'startingStatus')::public.system_scorecard_status;
      else
        select rating.status
          into _starting_status
        from public.business_review_system_ratings as rating
        where rating.business_review_id = _review.id
          and rating.system_id = _target_system_id;
      end if;

      insert into public.business_review_system_priorities (
        business_review_id,
        system_id,
        position,
        action_step_id,
        starting_status,
        selected_at,
        selected_by
      )
      values (
        _review.id,
        _target_system_id,
        _new_priority_position,
        (_priority ->> 'actionStepId')::bigint,
        _starting_status,
        coalesce(nullif(_priority ->> 'selectedAt', '')::timestamptz, now()),
        nullif(_priority ->> 'selectedBy', '')::uuid
      );

      update public.coaching_note_action_steps as action_step
      set label = _target_system_label,
          library_item_id = _target_library_item_id,
          updated_at = now()
      where action_step.id = (_priority ->> 'actionStepId')::bigint;
    end loop;

    insert into public.system_scorecard_version_migrations (
      business_review_id,
      from_template_key,
      to_template_key,
      migrated_by,
      resolution,
      previous_snapshot
    )
    values (
      _review.id,
      _review.system_scorecard_template_key,
      _target.key,
      _actor_id,
      _resolution,
      _snapshot
    );

    _migrated_count := _migrated_count + 1;
  end loop;

  if not _was_active then
    update public.system_scorecard_templates as template
    set is_active = false,
        updated_at = now()
    where template.audience = _target.audience
      and template.key <> _target.key
      and template.is_active = true;

    update public.system_scorecard_templates as template
    set is_active = true,
        updated_at = now()
    where template.key = _target.key;
  end if;

  return jsonb_build_object(
    'templateKey', _target.key,
    'published', not _was_active,
    'eligibleReviewCount', _eligible_count,
    'migratedReviewCount', _migrated_count,
    'skippedReviewCount', _skipped_count
  );
end;
$$;


ALTER FUNCTION "public"."admin_publish_system_scorecard_version"("_template_key" "text", "_actor_id" "uuid", "_resolutions" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_publish_system_scorecard_version"("_template_key" "text", "_actor_id" "uuid", "_resolutions" "jsonb") IS 'Publishes a scorecard version and atomically upgrades compatible draft reviews, requiring explicit resolutions for removed priorities or reviewed systems.';



CREATE OR REPLACE FUNCTION "public"."admin_replace_system_scorecard_draft"("_template_key" "text", "_name" "text", "_categories" "jsonb", "_actor_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  _template public.system_scorecard_templates%rowtype;
  _category jsonb;
  _system jsonb;
  _category_position bigint;
  _system_position bigint;
  _category_id bigint;
  _library_item_id bigint;
begin
  select template.*
    into _template
  from public.system_scorecard_templates as template
  where template.key = _template_key
  for update;

  if _template.key is null then
    raise exception 'Scorecard template not found.';
  end if;

  if _template.is_active then
    raise exception 'Published scorecard versions are immutable.';
  end if;

  if exists (
    select 1
    from public.business_reviews as review
    where review.system_scorecard_template_key = _template.key
  ) then
    raise exception 'A scorecard version used by a Business Review is immutable.';
  end if;

  if nullif(btrim(_name), '') is null then
    raise exception 'A scorecard name is required.';
  end if;

  if _categories is null
    or jsonb_typeof(_categories) <> 'array'
    or jsonb_array_length(_categories) = 0
  then
    raise exception 'At least one scorecard category is required.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(_categories) as category(value)
    where nullif(btrim(category.value ->> 'key'), '') is null
      or nullif(btrim(category.value ->> 'label'), '') is null
      or jsonb_typeof(coalesce(category.value -> 'systems', '[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(category.value -> 'systems', '[]'::jsonb)) = 0
  ) then
    raise exception 'Every category needs a stable key, label, and at least one system.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(_categories) as category(value)
    group by category.value ->> 'key'
    having count(*) > 1
  ) then
    raise exception 'Category keys must be unique within a scorecard version.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(_categories) as category(value)
    cross join lateral jsonb_array_elements(category.value -> 'systems') as system(value)
    where nullif(btrim(system.value ->> 'key'), '') is null
      or nullif(btrim(system.value ->> 'label'), '') is null
  ) then
    raise exception 'Every system needs a stable key and label.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(_categories) as category(value)
    cross join lateral jsonb_array_elements(category.value -> 'systems') as system(value)
    group by system.value ->> 'key'
    having count(*) > 1
  ) then
    raise exception 'System keys must be unique within a scorecard version.';
  end if;

  delete from public.system_scorecard_systems as system
  where system.template_key = _template.key;

  delete from public.system_scorecard_categories as category
  where category.template_key = _template.key;

  for _category, _category_position in
    select item.value, item.ordinality
    from jsonb_array_elements(_categories) with ordinality as item(value, ordinality)
  loop
    insert into public.system_scorecard_categories (
      template_key,
      key,
      label,
      position,
      created_at,
      updated_at
    )
    values (
      _template.key,
      btrim(_category ->> 'key'),
      btrim(_category ->> 'label'),
      _category_position,
      now(),
      now()
    )
    returning id into _category_id;

    for _system, _system_position in
      select item.value, item.ordinality
      from jsonb_array_elements(_category -> 'systems') with ordinality as item(value, ordinality)
    loop
      _library_item_id := nullif(_system ->> 'libraryItemId', '')::bigint;

      insert into public.system_scorecard_systems (
        template_key,
        category_id,
        key,
        label,
        position,
        library_item_id,
        created_at,
        updated_at
      )
      values (
        _template.key,
        _category_id,
        btrim(_system ->> 'key'),
        btrim(_system ->> 'label'),
        _system_position,
        _library_item_id,
        now(),
        now()
      );
    end loop;
  end loop;

  update public.system_scorecard_templates as template
  set name = btrim(_name),
      updated_at = now()
  where template.key = _template.key;

  return _template.key;
end;
$$;


ALTER FUNCTION "public"."admin_replace_system_scorecard_draft"("_template_key" "text", "_name" "text", "_categories" "jsonb", "_actor_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_replace_system_scorecard_draft"("_template_key" "text", "_name" "text", "_categories" "jsonb", "_actor_id" "uuid") IS 'Atomically replaces the editable structure of an unpublished and unused scorecard version.';



CREATE OR REPLACE FUNCTION "public"."apply_user_attention_auto"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_prev public.user_attention_status;
  v_new  public.user_attention_status;
begin
  select attention_status_auto
    into v_prev
  from public.profiles
  where id = p_user_id
  for update;

  -- During cascading deletes / intermediate states, the profile may not exist.
  -- Do NOT raise; just skip.
  if not found then
    return;
  end if;

  v_new := public.compute_user_attention_auto_from_attendance(p_user_id);

  update public.profiles
     set attention_status_auto = v_new
   where id = p_user_id;

  -- Optional logging (leave commented if you want)
  -- if v_prev is distinct from v_new then
  --   insert into public.user_attention_status_log
  --     (user_id, manual_status, reason, prev_manual_status, prev_reason, changed_by, change_source)
  --   values
  --     (p_user_id, null, null, null, null, null, 'auto');
  -- end if;
end;
$$;


ALTER FUNCTION "public"."apply_user_attention_auto"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_achievements_on_action_step"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user uuid;
begin
  if NEW.library_item_id is null then
    return NEW;
  end if;

  select cn.user_id into v_user
  from public.coaching_notes cn
  where cn.id = NEW.coaching_note_id;

  if v_user is null then
    return NEW;
  end if;

  insert into public.user_achievements (user_id, achievement_id, achieved_at, awarded_via)
  select v_user, m.achievement_id, now(), 'auto'
  from public.achievement_node_map m
  where m.node_id = NEW.library_item_id
  on conflict (user_id, achievement_id) do nothing;

  return NEW;
end
$$;


ALTER FUNCTION "public"."award_achievements_on_action_step"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."business_audit_set_updated_at_20260729"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."business_audit_set_updated_at_20260729"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_owner"("_viewer" "uuid", "_owner" "uuid", "_domain" "public"."share_domain") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  -- direct ownership
  SELECT true
  WHERE _viewer = _owner

  UNION ALL

  -- shared via partnership
  SELECT true
  WHERE _owner IN (
    SELECT p.id
    FROM public.partnership_users pu
    JOIN public.partnerships p ON p.id = pu.partnership_id
    WHERE pu.user_id = _viewer
      AND p.is_active
      AND (
        (_domain = 'kpis'       AND p.shared_kpis) OR
        (_domain = 'attendance' AND p.shared_attendance) OR
        (_domain = 'notes'      AND p.shared_notes)
      )
  )
  LIMIT 1;
$$;


ALTER FUNCTION "public"."can_access_owner"("_viewer" "uuid", "_owner" "uuid", "_domain" "public"."share_domain") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_user_access_course"("p_user_id" "uuid", "p_course_node_id" bigint) RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  with viewer as (
    select coalesce(p_user_id, auth.uid()) as user_id
  )
  select exists (
    select 1
    from public.content_nodes c
    cross join viewer v
    where c.id = p_course_node_id
      and c.node_type = 'course'
      and c.state = 'published'
      and (
        c.visibility = 'public'::public.course_visibility
        or exists (
          select 1
          from public.user_course_visibility ucv
          where ucv.user_id = v.user_id
            and ucv.course_node_id = c.id
        )
        or exists (
          select 1
          from public.content_node_roles cnr
          join public.user_roles ur
            on ur.role_id = cnr.role_id
           and ur.user_id = v.user_id
          where cnr.node_id = c.id
        )
      )
  );
$$;


ALTER FUNCTION "public"."can_user_access_course"("p_user_id" "uuid", "p_course_node_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_user_access_node_via_course"("p_user_id" "uuid", "p_node_id" bigint) RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.get_containing_course_ids(p_node_id) gcc
    where public.can_user_access_course(p_user_id, gcc.course_node_id)
  );
$$;


ALTER FUNCTION "public"."can_user_access_node_via_course"("p_user_id" "uuid", "p_node_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_domain_owner"("_viewer" "uuid", "_owner" "uuid", "_domain" "public"."share_domain") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    CASE
      WHEN _viewer IS NULL OR _owner IS NULL THEN FALSE
      ELSE
        (_viewer = _owner)
        OR public.is_admin_or_coach()
        OR EXISTS (
          SELECT 1
          FROM public.partnerships p
          JOIN public.partnership_users pu1 ON pu1.partnership_id = p.id AND pu1.user_id = _viewer
          JOIN public.partnership_users pu2 ON pu2.partnership_id = p.id AND pu2.user_id = _owner
          WHERE p.is_active
            AND (
              (_domain='kpis'       AND p.shared_kpis)
           OR (_domain='attendance' AND p.shared_attendance)
           OR (_domain='notes'      AND p.shared_notes)
            )
        )
    END;
$$;


ALTER FUNCTION "public"."can_view_domain_owner"("_viewer" "uuid", "_owner" "uuid", "_domain" "public"."share_domain") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."canonical_owner_for"("_user" "uuid", "_domain" "public"."share_domain") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  WITH p AS (
    SELECT p.id
    FROM public.partnerships p
    JOIN public.partnership_users pu ON pu.partnership_id = p.id
    WHERE pu.user_id = _user
      AND p.is_active
      AND (
        (_domain='kpis'       AND p.shared_kpis)
     OR (_domain='attendance' AND p.shared_attendance)
     OR (_domain='notes'      AND p.shared_notes)
      )
    LIMIT 1
  )
  SELECT COALESCE(
    ( SELECT pu2.user_id
      FROM p JOIN public.partnership_users pu2 ON pu2.partnership_id = p.id
      ORDER BY pu2.user_id
      LIMIT 1 ),
    _user
  );
$$;


ALTER FUNCTION "public"."canonical_owner_for"("_user" "uuid", "_domain" "public"."share_domain") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cb_guard_smartdoc_publish_consistency"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_node_state text;
  v_should_publish boolean;
begin
  if new.block_type = 'smart_doc' then
    select state into v_node_state
    from public.content_nodes
    where id = new.node_id;

    v_should_publish := (v_node_state = 'published');

    -- Auto-sync the Smart Doc to match the parent’s state
    update public.smart_docs
       set is_published = v_should_publish,
           updated_at   = now()
     where id = new.smart_doc_id;
  end if;

  return new;
end
$$;


ALTER FUNCTION "public"."cb_guard_smartdoc_publish_consistency"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cn_autoslug"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.node_type in ('chapter','lesson', 'course') then
    if (tg_op = 'INSERT' and coalesce(new.slug,'') = '')
       or (tg_op = 'UPDATE' and new.title is distinct from old.title and coalesce(new.slug,'') = '')
    then
      new.slug := public.slugify(new.title);
    end if;
  end if;
  return new;
end
$$;


ALTER FUNCTION "public"."cn_autoslug"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cn_sequential_unlock_flip_trg"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.node_type = 'course'
     and new.sequential_unlock is distinct from old.sequential_unlock
  then
    perform public.enforce_strict_sequence(new.id, new.sequential_unlock);
  end if;
  return new;
end
$$;


ALTER FUNCTION "public"."cn_sequential_unlock_flip_trg"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cn_state_cascade_trg"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'UPDATE' and new.state is distinct from old.state then
    perform public.set_node_state(new.id, new.state);
  end if;
  return new;
end
$$;


ALTER FUNCTION "public"."cn_state_cascade_trg"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."coach_clear_field"("_content_block_id" bigint, "_user_id" "uuid", "_prompt_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  _rid bigint;
begin
  if not (
    public.is_admin()
    or exists (
      select 1 from public.user_coaches uc
      where uc.coach_id = auth.uid()
        and uc.user_id = _user_id
        and uc.is_active = true
    )
  ) then
    raise exception 'Permission denied: not assigned coach';
  end if;

  select id into _rid
  from public.smart_doc_responses
  where content_block_id = _content_block_id
    and user_id = _user_id;

  if _rid is not null then
    delete from public.smart_doc_response_values
    where response_id = _rid and prompt_id = _prompt_id;
  end if;
end
$$;


ALTER FUNCTION "public"."coach_clear_field"("_content_block_id" bigint, "_user_id" "uuid", "_prompt_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."coach_reset_doc"("_content_block_id" bigint, "_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not (
    public.is_admin()
    or exists (
      select 1 from public.user_coaches uc
      where uc.coach_id = auth.uid()
        and uc.user_id = _user_id
        and uc.is_active = true
    )
  ) then
    raise exception 'Permission denied: not assigned coach';
  end if;

  update public.smart_doc_responses
     set status = 'draft',
         submitted_at = null,
         updated_at = now()
   where content_block_id = _content_block_id
     and user_id = _user_id;
end
$$;


ALTER FUNCTION "public"."coach_reset_doc"("_content_block_id" bigint, "_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_user_attention_auto_from_attendance"("p_user_id" "uuid") RETURNS "public"."user_attention_status"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
with rng as (
  select (current_date - interval '2 months')::date as d_from,
         current_date::date                        as d_to
),
agg as (
  select
    count(*)::int                                            as expected_count,
    count(*) filter (where ma.attended)::int                 as attended_count
  from public.meeting_attendance ma
  join public.meetings m       on m.id = ma.meeting_id
  join public.meeting_types mt on mt.id = m.meeting_type_id
  cross join rng
  where ma.user_id = p_user_id
    and mt.counts_toward_engagement = true
    and m.date between rng.d_from and rng.d_to
),
ratio as (
  select
    expected_count,
    attended_count,
    case when expected_count = 0 then null
         else attended_count::numeric / expected_count::numeric
    end as x
  from agg
)
select case
  when expected_count = 0 then 'green'::public.user_attention_status
  when x >= 0.5          then 'green'::public.user_attention_status
  when x >= 1.0/3.0      then 'yellow'::public.user_attention_status
  else                         'red'::public.user_attention_status
end
from ratio;
$$;


ALTER FUNCTION "public"."compute_user_attention_auto_from_attendance"("p_user_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_reviews" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "coach_id" "uuid",
    "coaching_note_id" bigint NOT NULL,
    "focus_finder_template_key" "text" DEFAULT 'focus_finder_v1'::"text" NOT NULL,
    "review_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "status" "public"."business_review_status" DEFAULT 'draft'::"public"."business_review_status" NOT NULL,
    "completed_at" timestamp with time zone,
    "completed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "system_scorecard_template_key" "text",
    "meeting_id" bigint,
    CONSTRAINT "business_reviews_completion_valid" CHECK (((("status" = 'draft'::"public"."business_review_status") AND ("completed_at" IS NULL)) OR (("status" = 'completed'::"public"."business_review_status") AND ("completed_at" IS NOT NULL))))
);


ALTER TABLE "public"."business_reviews" OWNER TO "postgres";


COMMENT ON TABLE "public"."business_reviews" IS 'One 60 Day Business Audit for a student, backed by exactly one existing coaching note.';



COMMENT ON COLUMN "public"."business_reviews"."coaching_note_id" IS 'The existing coaching note whose comments and action steps belong to this business audit.';



COMMENT ON COLUMN "public"."business_reviews"."system_scorecard_template_key" IS 'The versioned Foundation or Legends Systems Scorecard used by this audit.';



COMMENT ON COLUMN "public"."business_reviews"."meeting_id" IS 'The M2_MEETING record whose scheduled appointment owns this Business Audit.';



CREATE OR REPLACE FUNCTION "public"."create_business_review"("_user_id" "uuid", "_review_date" "date" DEFAULT CURRENT_DATE) RETURNS "public"."business_reviews"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare
  _actor_id uuid := auth.uid();
  _coaching_note_id bigint;
  _review public.business_reviews%rowtype;
begin
  if _actor_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if _user_id is null then
    raise exception 'Student id is required'
      using errcode = '22004';
  end if;

  if _review_date is null then
    raise exception 'Review date is required'
      using errcode = '22004';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = _user_id
  ) then
    raise exception 'Student not found'
      using errcode = 'P0002';
  end if;

  if not (
    exists (
      select 1
      from public.user_roles user_role
      join public.roles role
        on role.id = user_role.role_id
      where user_role.user_id = _actor_id
        and role.code = 'admin'
    )
    or (
      exists (
        select 1
        from public.user_roles user_role
        join public.roles role
          on role.id = user_role.role_id
        where user_role.user_id = _actor_id
          and role.code = 'coach'
      )
      and exists (
        select 1
        from public.user_coaches assignment
        where assignment.coach_id = _actor_id
          and assignment.user_id = _user_id
          and assignment.is_active = true
      )
    )
  ) then
    raise exception 'You do not have access to this student'
      using errcode = '42501';
  end if;

  insert into public.coaching_notes_base (
    user_id,
    coach_id
  )
  values (
    _user_id,
    _actor_id
  )
  returning id into _coaching_note_id;

  insert into public.business_reviews (
    user_id,
    coach_id,
    coaching_note_id,
    review_date
  )
  values (
    _user_id,
    _actor_id,
    _coaching_note_id,
    _review_date
  )
  returning * into _review;

  perform public.initialize_business_review_system_scorecard(_review.id);

  select *
  into _review
  from public.business_reviews
  where id = _review.id;

  return _review;
end;
$$;


ALTER FUNCTION "public"."create_business_review"("_user_id" "uuid", "_review_date" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_business_review"("_user_id" "uuid", "_review_date" "date") IS 'Atomically creates a coaching note, Business Audit, and the correct Foundation or Legends Systems Scorecard after verifying access.';



CREATE OR REPLACE FUNCTION "public"."view_user_ids_for_owner"("_owner" "uuid", "_domain" "public"."share_domain") RETURNS TABLE("user_id" "uuid")
    LANGUAGE "sql" STABLE
    AS $$
  SELECT _owner
  UNION
  SELECT pu1.user_id
  FROM public.partnerships p
  JOIN public.partnership_users pu1 ON pu1.partnership_id = p.id
  JOIN public.partnership_users pu2 ON pu2.partnership_id = p.id AND pu2.user_id = _owner
  WHERE p.is_active
    AND (
      (_domain='kpis'       AND p.shared_kpis)
   OR (_domain='attendance' AND p.shared_attendance)
   OR (_domain='notes'      AND p.shared_notes)
    );
$$;


ALTER FUNCTION "public"."view_user_ids_for_owner"("_owner" "uuid", "_domain" "public"."share_domain") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coaching_notes_base" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "coach_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "m2_meeting_id" bigint,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid"
);


ALTER TABLE "public"."coaching_notes_base" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."coaching_notes" AS
 SELECT "vu"."user_id",
    "cn"."id",
    "cn"."coach_id",
    "cn"."created_at",
    "cn"."updated_at",
    "cn"."m2_meeting_id"
   FROM ("public"."coaching_notes_base" "cn"
     JOIN LATERAL "public"."view_user_ids_for_owner"("cn"."user_id", 'notes'::"public"."share_domain") "vu"("user_id") ON (true))
  WHERE ("cn"."deleted_at" IS NULL);


ALTER VIEW "public"."coaching_notes" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_coaching_note"("_user_id" "uuid") RETURNS "public"."coaching_notes"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  _owner uuid := public.canonical_owner_for(_user_id, 'notes');
  _id    bigint;
  _coach uuid := auth.uid();
  _ts    timestamptz := now();
  v_row  public.coaching_notes%ROWTYPE;
begin
  insert into public.coaching_notes_base (user_id, coach_id, created_at, updated_at)
  values (_owner, _coach, _ts, _ts)
  returning public.coaching_notes_base.id into _id;  -- qualify to avoid ambiguity

  select * into v_row
  from public.coaching_notes
  where id = _id;  -- return the row from the VIEW (correct cols/order/types)

  return v_row;
end;
$$;


ALTER FUNCTION "public"."create_coaching_note"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_initial_monthly_kpi_record"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  _month_start date;
begin
  -- Use NEW.created_at if present, otherwise "now"
  _month_start := date_trunc('month', coalesce(NEW.created_at, now()))::date;

  insert into public.monthly_kpi_records (user_id, period_start_date)
  values (NEW.id, _month_start)
  on conflict (user_id, period_start_date) do nothing;

  return NEW;
end;
$$;


ALTER FUNCTION "public"."create_initial_monthly_kpi_record"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meetings" (
    "id" bigint NOT NULL,
    "meeting_type_id" bigint NOT NULL,
    "date" "date" NOT NULL,
    "created_by" "uuid",
    "title" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ghl_appointment_id" "text",
    "ghl_calendar_id" "text",
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "meeting_timezone" "text",
    "ghl_status" "text",
    "ghl_synced_at" timestamp with time zone
);


ALTER TABLE "public"."meetings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."meetings"."ghl_appointment_id" IS 'Stable GoHighLevel appointment identifier used for idempotent calendar synchronization.';



COMMENT ON COLUMN "public"."meetings"."meeting_timezone" IS 'IANA timezone used to derive the meeting date and schedule local-time reminders.';



CREATE OR REPLACE FUNCTION "public"."create_meeting_for_user"("_meeting_type_code" "text", "_date" "date", "_user_id" "uuid", "_title" "text" DEFAULT NULL::"text", "_created_by" "uuid" DEFAULT "auth"."uid"()) RETURNS "public"."meetings"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.create_meeting_with_attendees(
    _meeting_type_code := _meeting_type_code,
    _date              := _date,
    _user_ids          := array[_user_id],
    _title             := _title,
    _created_by        := _created_by
  );
$$;


ALTER FUNCTION "public"."create_meeting_for_user"("_meeting_type_code" "text", "_date" "date", "_user_id" "uuid", "_title" "text", "_created_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_meeting_with_attendees"("_meeting_type_code" "text", "_date" "date", "_user_ids" "uuid"[], "_title" "text" DEFAULT NULL::"text", "_created_by" "uuid" DEFAULT "auth"."uid"()) RETURNS "public"."meetings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  mt_id bigint;
  m public.meetings;
begin
  -- find meeting type
  select id into mt_id
  from public.meeting_types
  where code = _meeting_type_code
  limit 1;

  if mt_id is null then
    raise exception 'Unknown meeting_type code: %', _meeting_type_code
      using errcode = '22023';
  end if;

  -- create meeting
  insert into public.meetings (meeting_type_id, date, created_by, title)
  values (mt_id, _date, coalesce(_created_by, auth.uid()), _title)
  returning * into m;

  -- create expected attendance rows in the BASE table
  if _user_ids is not null then
    insert into public.meeting_attendance_base (meeting_id, user_id, attended)
    select m.id, uid, false
    from unnest(_user_ids) as uid
    on conflict (meeting_id, user_id) do nothing;
  end if;

  return m;
end;
$$;


ALTER FUNCTION "public"."create_meeting_with_attendees"("_meeting_type_code" "text", "_date" "date", "_user_ids" "uuid"[], "_title" "text", "_created_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_win"("_win_id" bigint) RETURNS "public"."wins"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_row public.wins;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  select *
    into v_row
  from public.wins
  where id = _win_id;

  if not found then
    raise exception 'Win not found';
  end if;

  if v_row.added_by <> v_actor and not public.has_role(array['admin','coach']) then
    raise exception 'Not permitted';
  end if;

  delete from public.wins
  where id = _win_id
  returning * into v_row;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."delete_win"("_win_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."effective_owner_id"("_user" "uuid", "_domain" "public"."share_domain") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT COALESCE(public.partnership_for_user(_user, _domain), _user);
$$;


ALTER FUNCTION "public"."effective_owner_id"("_user" "uuid", "_domain" "public"."share_domain") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."end_user_training_assignment"("p_user_id" "uuid", "p_coaching_note_id" bigint, "p_ended_by" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  changed_count integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_coaching_note_id::text, 0)
  );

  update public.user_training_assignments
  set ended_at = now(),
      ended_by = p_ended_by
  where user_id = p_user_id
    and coaching_note_id = p_coaching_note_id
    and ended_at is null;

  get diagnostics changed_count = row_count;
  return changed_count > 0;
end;
$$;


ALTER FUNCTION "public"."end_user_training_assignment"("p_user_id" "uuid", "p_coaching_note_id" bigint, "p_ended_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_content_blocks_shape"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  case new.block_type
    when 'asset' then
      -- Require a resource; forbid text/smart-doc specific fields
      if new.resource_id is null then
        raise exception 'Asset block requires resource_id';
      end if;
      if new.text_md is not null then
        raise exception 'Asset block must not set text_md';
      end if;
      if new.smart_doc_id is not null then
        raise exception 'Asset block must not set smart_doc_id';
      end if;

    when 'text' then
      -- Require text body; forbid asset/smart-doc fields & time slicing
      if new.text_md is null then
        raise exception 'Text block requires text_md';
      end if;
      if new.resource_id is not null then
        raise exception 'Text block must not set resource_id';
      end if;
      if new.smart_doc_id is not null then
        raise exception 'Text block must not set smart_doc_id';
      end if;
      if new.start_ms is not null or new.end_ms is not null then
        raise exception 'Text block must not set start_ms/end_ms';
      end if;

    when 'divider' then
      -- Must be “empty” of all content-specific fields
      if new.resource_id is not null
         or new.smart_doc_id is not null
         or new.text_md is not null
         or new.start_ms is not null
         or new.end_ms is not null then
        raise exception 'Divider block must not set content-specific fields';
      end if;

    when 'smart_doc' then
      -- Match your CHECK constraint for smart_doc
      if new.smart_doc_id is null then
        raise exception 'Smart doc block requires smart_doc_id';
      end if;
      if new.text_md is not null then
        raise exception 'Smart doc block must not set text_md';
      end if;
      if new.resource_id is not null then
        raise exception 'Smart doc block must not set resource_id';
      end if;
      if new.start_ms is not null or new.end_ms is not null then
        raise exception 'Smart doc block must not set start_ms/end_ms';
      end if;

    else
      raise exception 'Unsupported block_type: %', new.block_type;
  end case;

  return new;
end
$$;


ALTER FUNCTION "public"."enforce_content_blocks_shape"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_content_node_roles_course_only"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if not exists (
    select 1
    from public.content_nodes cn
    where cn.id = new.node_id
      and cn.node_type = 'course'
  ) then
    raise exception
      'content_node_roles.node_id must reference a course node. Got node_id=%',
      new.node_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_content_node_roles_course_only"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_node_children_rules"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare ptype text; ctype text;
begin
  select node_type into ptype from public.content_nodes where id = new.parent_id;
  select node_type into ctype from public.content_nodes where id = new.child_id;

  if not exists (
    select 1 from public.node_edge_rules
     where parent_type = ptype and child_kind = 'node' and child_type = ctype
  ) then
    raise exception 'Disallowed edge: % -> node(%).', ptype, ctype;
  end if;

  if new.child_id = new.parent_id then
    raise exception 'node_children: cannot reference self';
  end if;

  return new;
end $$;


ALTER FUNCTION "public"."enforce_node_children_rules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_playlist_published_assets"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare ntype text; rstate text;
begin
  if new.block_type = 'asset' then
    select node_type into ntype from public.content_nodes where id = new.node_id;
    if ntype = 'playlist' then
      select state into rstate from public.resources where id = new.resource_id;
      if rstate is distinct from 'published' then
        raise exception 'Playlists may include only published resources';
      end if;
    end if;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."enforce_playlist_published_assets"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_single_active_partnership_per_domain"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  conflicting record;
BEGIN
  IF tg_op = 'INSERT'
     OR (tg_op = 'UPDATE' AND NEW.partnership_id <> OLD.partnership_id) THEN

    FOR conflicting IN
      SELECT p2.id
      FROM public.partnership_users pu2
      JOIN public.partnerships p2 ON p2.id = pu2.partnership_id
      WHERE pu2.user_id = NEW.user_id
        AND p2.is_active
        AND EXISTS (
          SELECT 1
          FROM public.partnerships p_new
          WHERE p_new.id = NEW.partnership_id
            AND p_new.is_active
            AND (
              (p_new.shared_kpis        AND p2.shared_kpis) OR
              (p_new.shared_attendance  AND p2.shared_attendance) OR
              (p_new.shared_notes       AND p2.shared_notes)
            )
        )
        AND pu2.partnership_id <> NEW.partnership_id
      LIMIT 1
    LOOP
      RAISE EXCEPTION
        'User % already has an active partnership overlapping in at least one shared domain',
        NEW.user_id;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_single_active_partnership_per_domain"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_strict_sequence"("_root_id" bigint, "_on" boolean DEFAULT true) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- 1) Enable/disable sequential_unlock on all courses & lessons in the subtree
  with recursive sub as (
    select cn.id, cn.node_type
    from public.content_nodes cn
    where cn.id = _root_id
    union all
    select cn2.id, cn2.node_type
    from public.node_children nc
    join public.content_nodes cn2 on cn2.id = nc.child_id
    join sub s on s.id = nc.parent_id
  )
  update public.content_nodes cn
  set sequential_unlock = _on
  where cn.id in (
    select id from sub where node_type in ('course','lesson')
  );

  -- 2) Require/unrequire all direct children of those parents
  with recursive sub as (
    select cn.id, cn.node_type
    from public.content_nodes cn
    where cn.id = _root_id
    union all
    select cn2.id, cn2.node_type
    from public.node_children nc
    join public.content_nodes cn2 on cn2.id = nc.child_id
    join sub s on s.id = nc.parent_id
  )
  update public.node_children nc
  set is_required = _on
  where nc.parent_id in (
    select id from sub where node_type in ('course','lesson')
  );
end
$$;


ALTER FUNCTION "public"."enforce_strict_sequence"("_root_id" bigint, "_on" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_user_assistants_assistant_role"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.is_active then
    if not public.is_assistant(new.assistant_id) then
      raise exception 'assistant_id % does not have role "assistant"', new.assistant_id;
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_user_assistants_assistant_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_monthly_kpi_record_for_month"("_user_id" "uuid", "_period_start_date" "date") RETURNS TABLE("user_id" "uuid", "id" bigint, "period_start_date" "date", "last_updated_at" timestamp with time zone, "last_updated_by" "uuid")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  _owner   uuid := public.canonical_owner_for(_user_id, 'kpis');
  _period  date := date_trunc('month', _period_start_date)::date;
  _oldest  date;
  _newest  date;
  _now     timestamptz := now();
BEGIN
  -- Ensure the requested month exists first.
  INSERT INTO public.monthly_kpi_records_base (
    user_id,
    period_start_date,
    last_updated_by,
    last_updated_at
  )
  VALUES (
    _owner,
    _period,
    _user_id,
    _now
  )
  ON CONFLICT ON CONSTRAINT mkr_user_period_uniq
  DO NOTHING;

  -- Find the full month range for this KPI owner.
  SELECT
    min(date_trunc('month', m.period_start_date)::date),
    max(date_trunc('month', m.period_start_date)::date)
  INTO
    _oldest,
    _newest
  FROM public.monthly_kpi_records_base m
  WHERE m.user_id = _owner;

  -- Backfill any missing months in that range.
  IF _oldest IS NOT NULL AND _newest IS NOT NULL THEN
    INSERT INTO public.monthly_kpi_records_base (
      user_id,
      period_start_date,
      last_updated_by,
      last_updated_at
    )
    SELECT
      _owner,
      gs.period_start_date,
      _user_id,
      _now
    FROM (
      SELECT generate_series(
        _oldest::timestamp,
        _newest::timestamp,
        interval '1 month'
      )::date AS period_start_date
    ) gs
    ON CONFLICT ON CONSTRAINT mkr_user_period_uniq
    DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT
    _user_id,
    m.id,
    m.period_start_date,
    m.last_updated_at,
    m.last_updated_by
  FROM public.monthly_kpi_records_base m
  WHERE m.user_id = _owner
    AND m.period_start_date = _period;
END;
$$;


ALTER FUNCTION "public"."ensure_monthly_kpi_record_for_month"("_user_id" "uuid", "_period_start_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."export_smartdoc_answers_for_chapters"("_chapter_ids" bigint[], "_only_submitted" boolean DEFAULT false) RETURNS TABLE("course_title" "text", "lesson_title" "text", "chapter_title" "text", "content_block_id" bigint, "doc_id" bigint, "doc_title" "text", "user_id" "uuid", "user_full_name" "text", "prompt_id" bigint, "prompt_label" "text", "prompt_type" "text", "value_text" "text", "status" "text", "submitted_at" timestamp with time zone)
    LANGUAGE "sql" STABLE
    AS $$
  with tree as (
    -- course > lesson > chapter (adapt if your hierarchy differs)
    select chap.id as chapter_id, chap.title as chapter_title,
           les.id  as lesson_id,  les.title  as lesson_title,
           crs.id  as course_id,  crs.title  as course_title
    from public.content_nodes chap
    join public.node_children lc on lc.child_id = chap.id
    join public.content_nodes les on les.id = lc.parent_id
    join public.node_children cc on cc.child_id = les.id
    join public.content_nodes crs on crs.id = cc.parent_id
    where chap.node_type = 'chapter'
      and chap.id = any(_chapter_ids)
  )
  select
    t.course_title,
    t.lesson_title,
    t.chapter_title,
    cb.id as content_block_id,
    sd.id as doc_id,
    sd.title as doc_title,
    r.user_id,
    (select concat_ws(' ', p.first_name, p.last_name) from public.profiles p where p.id = r.user_id) as user_full_name,
    pmt.id as prompt_id,
    pmt.label as prompt_label,
    pmt.prompt_type,
    case
      when v.value_json is null then null
      else nullif(v.value_json #>> '{}','')
    end as value_text,
    r.status,
    r.submitted_at
  from public.content_blocks cb
  join public.smart_docs sd on sd.id = cb.smart_doc_id
  join public.smart_doc_prompts pmt on pmt.doc_id = sd.id
  left join public.smart_doc_responses r on r.content_block_id = cb.id
  left join public.smart_doc_response_values v on v.response_id = r.id and v.prompt_id = pmt.id
  join tree t on t.chapter_id = cb.node_id
  where cb.block_type = 'smart_doc'
    and (not _only_submitted or r.status = 'submitted')
  order by t.course_title, t.lesson_title, t.chapter_title, sd.title, r.user_id, pmt.position, pmt.id;
$$;


ALTER FUNCTION "public"."export_smartdoc_answers_for_chapters"("_chapter_ids" bigint[], "_only_submitted" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_all_users"("_course_id" integer DEFAULT NULL::integer) RETURNS TABLE("user_id" "uuid", "full_name" "text")
    LANGUAGE "sql" STABLE
    AS $$
  select
    u.id as user_id,
    concat_ws(' ', u.first_name, u.last_name) as full_name
  from public.profiles u
  where
    -- if a course is provided, only include users who are currently active in that course (via user_coaches)
    (
      _course_id is null
      or exists (
        select 1
        from public.user_coaches uc
        where uc.user_id = u.id
          and uc.is_active
          and uc.course_id = _course_id
      )
    )
  order by full_name;
$$;


ALTER FUNCTION "public"."get_all_users"("_course_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_available_course_ids_for_user"("p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS TABLE("course_node_id" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select c.id as course_node_id
  from public.content_nodes c
  where c.node_type = 'course'
    and public.can_user_access_course(p_user_id, c.id);
$$;


ALTER FUNCTION "public"."get_available_course_ids_for_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_available_courses_for_user"("_user_id" "uuid") RETURNS TABLE("id" bigint, "title" "text", "slug" "text", "description" "text", "hero_image" "text", "icon" "text", "objectives" "text", "metadata" "jsonb", "sequential_unlock" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    cn.id,
    cn.title,
    cn.slug,
    cn.description,
    cn.hero_image,
    cn.icon,
    cn.objectives,
    cn.metadata,
    cn.sequential_unlock
  from public.content_nodes cn
  where
    cn.node_type = 'course'
    and cn.state = 'published'
    and (
      cn.visibility = 'public'
      or (
        cn.visibility = 'limited'
        and exists (
          select 1
          from public.user_course_visibility ucv
          where ucv.course_node_id = cn.id
            and ucv.user_id = _user_id
        )
      )
    )
  order by cn.title asc nulls last, cn.id asc;
$$;


ALTER FUNCTION "public"."get_available_courses_for_user"("_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_available_courses_for_user"("_user_id" "uuid") IS 'Returns only the course content_nodes (published) that the given user is allowed to see, based on content_nodes.is_public and user_course_visibility.';



CREATE OR REPLACE FUNCTION "public"."get_child_unlock_status"("_parent_id" bigint, "_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS TABLE("child_id" bigint, "child_position" integer, "is_required" boolean, "locked" boolean, "reason" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
with parent as (
  select id, sequential_unlock
  from public.content_nodes
  where id = _parent_id
),
kids as (
  select c.child_id, c.position, coalesce(c.is_required, false) as is_required
  from public.node_children c
  join public.content_nodes cn on cn.id = c.child_id
  where c.parent_id = _parent_id
  order by c.position
),
prev_required as (
  -- For each child, collect required previous siblings (by lower position)
  select
    k.child_id,
    array_agg(pr.child_id order by pr.position)
      filter (where pr.is_required) as prev_required_children
  from kids k
  left join kids pr
    on pr.position < k.position
  group by k.child_id
),
prev_required_completion as (
  -- Correct logic:
  --   * Empty set -> TRUE  (first required item is unlocked)
  --   * Any missing/NULL progress -> treated as FALSE
  select
    pr.child_id,
    coalesce((
      select bool_and(coalesce(p.status = 'completed', false))
      from unnest(coalesce(pr.prev_required_children, '{}')) as r(child_id)
      left join public.user_node_progress p
        on p.user_id = _user_id and p.node_id = r.child_id
    ), true) as all_prev_required_completed
  from prev_required pr
)
select
  k.child_id,
  k.position as child_position,
  k.is_required,
  case
    when (select sequential_unlock from parent) = false then false
    when prc.all_prev_required_completed = true then false
    else true
  end as locked,
  case
    when (select sequential_unlock from parent) = false
      then 'sequential_unlock=false'
    when prc.all_prev_required_completed = true
      then 'all_required_previous_completed'
    else 'waiting_for_required_previous'
  end as reason
from kids k
join prev_required_completion prc using (child_id)
order by k.position;
$$;


ALTER FUNCTION "public"."get_child_unlock_status"("_parent_id" bigint, "_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_child_unlock_status_bulk"("_parent_ids" bigint[], "_user_id" "uuid") RETURNS TABLE("parent_id" bigint, "child_id" bigint, "child_position" integer, "is_required" boolean, "locked" boolean, "reason" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select
    pid as parent_id,
    s.child_id,
    s.child_position,
    s.is_required,
    s.locked,
    s.reason
  from unnest(_parent_ids) as pid
  cross join lateral (
    select child_id, child_position, is_required, locked, reason
    from public.get_child_unlock_status(pid, _user_id)
  ) as s
$$;


ALTER FUNCTION "public"."get_child_unlock_status_bulk"("_parent_ids" bigint[], "_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_coaching_private_notes_for_user"("_user_id" "uuid") RETURNS TABLE("id" bigint, "user_id" "uuid", "author_id" "uuid", "body" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin_or_coach() then
    raise exception 'not authorized';
  end if;

  return query
  select
    n.id,
    n.user_id,
    n.author_id,
    n.body,
    n.created_at
  from public.coaching_private_notes n
  where n.user_id = _user_id
  order by n.created_at desc;
end;
$$;


ALTER FUNCTION "public"."get_coaching_private_notes_for_user"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_containing_course_ids"("p_node_id" bigint) RETURNS TABLE("course_node_id" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  with recursive ancestors as (
    select cn.id
    from public.content_nodes cn
    where cn.id = p_node_id

    union

    select nc.parent_id
    from public.node_children nc
    join ancestors a
      on a.id = nc.child_id
  )
  select distinct cn.id as course_node_id
  from ancestors a
  join public.content_nodes cn
    on cn.id = a.id
   and cn.node_type = 'course';
$$;


ALTER FUNCTION "public"."get_containing_course_ids"("p_node_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_member_ids"() RETURNS TABLE("user_id" "uuid")
    LANGUAGE "sql" STABLE
    AS $$
  select ur.user_id
  from public.user_roles ur
  join public.roles member_role
    on member_role.id = ur.role_id
   and member_role.code = 'user'
  where not exists (
    select 1
    from public.user_roles past_member_assignment
    join public.roles past_member_role
      on past_member_role.id = past_member_assignment.role_id
     and past_member_role.code = 'past_member'
    where past_member_assignment.user_id = ur.user_id
  )
  order by ur.user_id;
$$;


ALTER FUNCTION "public"."get_current_member_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_looker_link_for_user"("uid" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  select looker_link
  from public.profiles
  where id = uid;
$$;


ALTER FUNCTION "public"."get_looker_link_for_user"("uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_monthly_kpi_history_for_year"("_user_id" "uuid", "_year" integer DEFAULT ("date_part"('year'::"text", "now"()))::integer) RETURNS TABLE("user_id" "uuid", "period_start_date" "date", "last_updated_at" timestamp with time zone, "kpi_values" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  _viewer uuid := auth.uid();
  _owner  uuid;
  _start  date  := make_date(_year, 1, 1);
  _end    date  := make_date(_year + 1, 1, 1);
begin
  -- Same permission gate as your other KPI functions
  if not public.can_view_domain_owner(_viewer, _user_id, 'kpis') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  _owner := public.canonical_owner_for(_user_id, 'kpis');

  return query
  select
    _user_id as user_id,
    r.period_start_date,
    r.last_updated_at,
    coalesce(
      jsonb_object_agg(mt.key, v.value) filter (where v.value is not null),
      '{}'::jsonb
    ) as kpi_values
  from public.monthly_kpi_records_base r
  left join public.monthly_kpi_values v
    on v.monthly_kpi_record_id = r.id
  left join public.kpi_metric_types mt
    on mt.id = v.metric_type_id
  where r.user_id = _owner
    and r.period_start_date >= _start
    and r.period_start_date <  _end
  group by r.period_start_date, r.last_updated_at
  order by r.period_start_date asc; -- oldest → newest
end;
$$;


ALTER FUNCTION "public"."get_monthly_kpi_history_for_year"("_user_id" "uuid", "_year" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_monthly_kpi_history_with_values"("_user_id" "uuid", "_limit" integer DEFAULT 12) RETURNS TABLE("user_id" "uuid", "period_start_date" "date", "last_updated_at" timestamp with time zone, "kpi_values" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _viewer uuid := auth.uid();
  _owner  uuid;
  _lim    integer := GREATEST(_limit, 1);
BEGIN
  IF NOT public.can_view_domain_owner(_viewer, _user_id, 'kpis') THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  _owner := public.canonical_owner_for(_user_id, 'kpis');

  RETURN QUERY
  SELECT
    _user_id AS user_id,
    r.period_start_date,
    r.last_updated_at,
    COALESCE(
      jsonb_object_agg(mt.key, v.value) FILTER (WHERE v.value IS NOT NULL),
      '{}'::jsonb
    ) AS kpi_values
  FROM public.monthly_kpi_records_base r
  LEFT JOIN public.monthly_kpi_values v
    ON v.monthly_kpi_record_id = r.id
  LEFT JOIN public.kpi_metric_types mt
    ON mt.id = v.metric_type_id
  WHERE r.user_id = _owner
  GROUP BY r.period_start_date, r.last_updated_at
  ORDER BY r.period_start_date DESC
  LIMIT _lim;
END;
$$;


ALTER FUNCTION "public"."get_monthly_kpi_history_with_values"("_user_id" "uuid", "_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_monthly_kpi_history_with_values"("_user_id" "uuid", "_limit" integer) IS 'Fetch recent monthly KPI records for a user, each with a JSON of values for quick history displays.';



CREATE OR REPLACE FUNCTION "public"."get_monthly_kpi_record_with_values"("_user_id" "uuid", "_period_start_date" "date") RETURNS TABLE("user_id" "uuid", "period_start_date" "date", "last_updated_at" timestamp with time zone, "last_updated_by" "uuid", "kpi_values" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _viewer uuid := auth.uid();
  _owner  uuid;
BEGIN
  -- Explicit permission gate: me, or coach/admin, or active KPI partnership
  IF NOT public.can_view_domain_owner(_viewer, _user_id, 'kpis') THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  _owner := public.canonical_owner_for(_user_id, 'kpis');

  RETURN QUERY
  SELECT
    _user_id                                                AS user_id,
    r.period_start_date,
    r.last_updated_at,
    r.last_updated_by,
    COALESCE(
      jsonb_object_agg(mt.key, v.value) FILTER (WHERE v.value IS NOT NULL),
      '{}'::jsonb
    )                                                       AS kpi_values
  FROM public.monthly_kpi_records_base r
  LEFT JOIN public.monthly_kpi_values v
    ON v.monthly_kpi_record_id = r.id
  LEFT JOIN public.kpi_metric_types mt
    ON mt.id = v.metric_type_id
  WHERE r.user_id = _owner
    AND r.period_start_date = _period_start_date
  GROUP BY r.period_start_date, r.last_updated_at, r.last_updated_by;
END;
$$;


ALTER FUNCTION "public"."get_monthly_kpi_record_with_values"("_user_id" "uuid", "_period_start_date" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_monthly_kpi_record_with_values"("_user_id" "uuid", "_period_start_date" "date") IS 'Fetch a single monthly KPI record plus a JSON object of values keyed by kpi_metric_types.key.';



CREATE OR REPLACE FUNCTION "public"."get_my_coach"("_course_id" bigint DEFAULT NULL::bigint) RETURNS TABLE("coach_id" "uuid", "coach_name" "text", "m2_booking_url" "text", "call15_url" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
with me as (
  select auth.uid() as uid
),
ranked as (
  select
    uco.*,
    case when _course_id is not null and uco.course_id = _course_id then 0 else 1 end as pref_exact_course,
    case when uco.course_id is null then 1 else 0 end as pref_has_course
  from public.user_coaches uco, me
  where uco.user_id = me.uid
    and uco.is_active
    and coalesce(uco.relationship_type, 'primary') = 'primary'
),
chosen as (
  select *
  from ranked
  order by
    pref_exact_course,
    pref_has_course,
    assigned_at desc,
    id desc
  limit 1
)
select
  c.id as coach_id,
  concat_ws(' ', c.first_name, c.last_name) as coach_name,
  cp.m2_booking_url,
  cp.call15_url
from chosen ch
join public.profiles c on c.id = ch.coach_id
left join public.coach_profiles cp on cp.user_id = ch.coach_id;
$$;


ALTER FUNCTION "public"."get_my_coach"("_course_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_coach_links"("_course_id" bigint DEFAULT NULL::bigint) RETURNS TABLE("coach_id" "uuid", "coach_name" "text", "m2_booking_url" "text", "call15_url" "text", "course_id" bigint, "course_name" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
with me as (
  select auth.uid() as uid
),
ranked as (
  -- Pull ALL active assignments for the user, then rank
  select
    uco.*,
    case when _course_id is not null and uco.course_id = _course_id then 0 else 1 end as pref_exact_course,
    case when uco.course_id is null then 1 else 0 end as pref_has_course
  from public.user_coaches uco, me
  where uco.user_id = me.uid
    and uco.is_active
),
chosen as (
  select *
  from ranked
  order by
    pref_exact_course,                -- 1) match requested course if possible
    pref_has_course,                  -- 2) otherwise prefer rows with course_id
    assigned_at desc,                 -- 3) newest assignment
    id desc
  limit 1
)
select
  c.id  as coach_id,
  concat_ws(' ', c.first_name, c.last_name) as coach_name,
  cp.m2_booking_url,
  cp.call15_url,
  ch.course_id,
  crs.name as course_name
from chosen ch
join public.profiles        c   on c.id = ch.coach_id
join public.coach_profiles  cp  on cp.user_id = ch.coach_id
left join public.courses    crs on crs.id = ch.course_id;
$$;


ALTER FUNCTION "public"."get_my_coach_links"("_course_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_implementation_coach"("_course_id" bigint DEFAULT NULL::bigint) RETURNS TABLE("coach_id" "uuid", "first_name" "text", "last_name" "text", "impl_booking_url" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with me as (
    select auth.uid() as uid
  ),
  ranked as (
    -- all active *implementation* assignments, then rank like get_my_coach
    select
      uc.*,
      case when _course_id is not null and uc.course_id = _course_id then 0 else 1 end as pref_exact_course,
      case when uc.course_id is null then 1 else 0 end as pref_has_course
    from public.user_coaches uc, me
    where uc.user_id = me.uid
      and uc.is_active
      and uc.relationship_type = 'implementation'
  ),
  chosen as (
    select *
    from ranked
    order by
      pref_exact_course,
      pref_has_course,
      assigned_at desc,
      id desc
    limit 1
  )
  select
    p.id as coach_id,
    p.first_name,
    p.last_name,
    cp.impl_booking_url
  from chosen ch
  join public.profiles p
    on p.id = ch.coach_id
  left join public.coach_profiles cp
    on cp.user_id = ch.coach_id;
$$;


ALTER FUNCTION "public"."get_my_implementation_coach"("_course_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_users"("_course_id" bigint DEFAULT NULL::bigint) RETURNS TABLE("user_id" "uuid", "full_name" "text")
    LANGUAGE "sql" STABLE
    AS $$
  select
    u.id,
    concat_ws(' ', u.first_name, u.last_name) as full_name
  from public.user_coaches uc
  join public.profiles u on u.id = uc.user_id
  where uc.coach_id = auth.uid()
    and uc.is_active
    and (uc.course_id is not distinct from _course_id)
  order by full_name
$$;


ALTER FUNCTION "public"."get_my_users"("_course_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_users_with_status"() RETURNS TABLE("user_id" "uuid", "full_name" "text", "email" "text", "user_status" "public"."user_attention_status", "user_status_source" "text", "user_status_manual" "public"."user_attention_status", "user_status_manual_reason" "text", "attended_count" integer, "expected_count" integer)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  with rng as (
    select (current_date - interval '2 months')::date as d_from,
           current_date::date                        as d_to
  )
  select
    p.id as user_id,
    nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '') as full_name,
    null::text as email,  -- no auth.users join in this variant
    coalesce(p.attention_status_manual, p.attention_status_auto) as user_status,
    case when p.attention_status_manual is not null then 'manual' else 'auto' end as user_status_source,
    p.attention_status_manual,
    p.attention_status_manual_reason,
    -- Attendance over the 2-month window (engagement-only)
    coalesce(c.attended_count, 0)  as attended_count,
    coalesce(c.expected_count, 0)  as expected_count
  from public.profiles p
  join public.user_roles ur
    on ur.user_id = p.id
  join public.roles r
    on r.id = ur.role_id
   and r.code = 'user'   -- keep your role filter
  -- Per-user attendance counts via LATERAL for clarity & perf
  left join lateral (
    select
      count(*) filter (
        where mt.counts_toward_engagement
          and m.date between rng.d_from and rng.d_to
      )::int as expected_count,
      count(*) filter (
        where mt.counts_toward_engagement
          and m.date between rng.d_from and rng.d_to
          and coalesce(ma.attended, false)
      )::int as attended_count
    from public.meeting_attendance ma
    join public.meetings m       on m.id = ma.meeting_id
    join public.meeting_types mt on mt.id = m.meeting_type_id
    cross join rng
    where ma.user_id = p.id
  ) as c on true
  order by full_name nulls last;
$$;


ALTER FUNCTION "public"."get_my_users_with_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_smart_doc_progress"("_content_block_id" bigint, "_user_id" "uuid") RETURNS TABLE("fields_total" integer, "fields_completed" integer)
    LANGUAGE "sql" STABLE
    AS $$
  with d as (
    select sd.id as doc_id
    from public.content_blocks cb
    join public.smart_docs sd on sd.id = cb.smart_doc_id
    where cb.id = _content_block_id
  ),
  defs as (
    select count(*)::int as total
    from public.smart_doc_prompts p
    join d on p.doc_id = d.doc_id
    where p.required = true
  ),
  completed as (
    select count(distinct p.id)::int as done
    from public.smart_doc_prompts p
    join d on p.doc_id = d.doc_id
    join public.smart_doc_responses r
      on r.content_block_id = _content_block_id and r.user_id = _user_id
    join public.smart_doc_response_values v
      on v.response_id = r.id and v.prompt_id = p.id
    where p.required = true
      and (
        p.prompt_type in ('text','textarea')
        and coalesce(nullif(v.value_json #>> '{}',''), '') <> ''
      )
      -- Future types: add completion conditions here.
  )
  select defs.total, coalesce(completed.done, 0)
  from defs left join completed on true;
$$;


ALTER FUNCTION "public"."get_smart_doc_progress"("_content_block_id" bigint, "_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_status_overview_summary"("_user_ids" "uuid"[]) RETURNS TABLE("user_id" "uuid", "last_kpi_at" timestamp with time zone, "last_one_on_one_at" "date", "last_group_at" "date", "completed_courses" integer, "total_courses" integer)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  with input_users as (
    select distinct unnest(_user_ids) as user_id
  ),
  published_courses as (
    select cn.id
    from public.content_nodes cn
    where cn.node_type = 'course'
      and cn.state = 'published'
  ),
  course_total as (
    select count(*)::int as total_courses
    from published_courses
  ),
  kpi_summary as (
    select
      mkr.user_id,
      max(mkr.last_updated_at) as last_kpi_at
    from public.monthly_kpi_records_base mkr
    join public.monthly_kpi_values mkv
      on mkv.monthly_kpi_record_id = mkr.id
    join input_users iu
      on iu.user_id = mkr.user_id
    where mkv.value is not null
    group by mkr.user_id
  ),
  meeting_summary as (
    select
      ma.user_id,
      max(m.date) filter (
        where mt.code in ('M2_MEETING', 'IMPLEMENTATION_MEETING')
      ) as last_one_on_one_at,
      max(m.date) filter (
        where mt.code in ('WEDNESDAY_SESSION', 'FRIDAY_DROPIN')
      ) as last_group_at
    from public.meeting_attendance_base ma
    join public.meetings m
      on m.id = ma.meeting_id
    join public.meeting_types mt
      on mt.id = m.meeting_type_id
    join input_users iu
      on iu.user_id = ma.user_id
    where ma.attended = true
    group by ma.user_id
  ),
  completed_course_counts as (
    select
      iu.user_id,
      count(*) filter (where coalesce(progress_row.progress, 0) >= 1)::int as completed_courses
    from input_users iu
    cross join published_courses pc
    left join lateral public.get_user_course_progress(iu.user_id, pc.id::integer) as progress_row
      on true
    group by iu.user_id
  )
  select
    iu.user_id,
    ks.last_kpi_at,
    ms.last_one_on_one_at,
    ms.last_group_at,
    coalesce(ccc.completed_courses, 0) as completed_courses,
    ct.total_courses
  from input_users iu
  cross join course_total ct
  left join kpi_summary ks
    on ks.user_id = iu.user_id
  left join meeting_summary ms
    on ms.user_id = iu.user_id
  left join completed_course_counts ccc
    on ccc.user_id = iu.user_id;
$$;


ALTER FUNCTION "public"."get_status_overview_summary"("_user_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_contact"("_user_id" "uuid") RETURNS TABLE("email" "text", "phone" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  is_admin boolean;
  is_coachs_student boolean;
begin
  -- Is caller admin?
  select exists (
    select 1
    from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.name = 'admin'
  ) into is_admin;

  -- Is caller the coach assigned to this user?
  select exists (
    select 1
    from user_coaches uc
    where uc.coach_id = auth.uid()
      and uc.user_id  = _user_id
  ) into is_coachs_student;

  if not (is_admin or is_coachs_student) then
    raise exception 'Not authorized to view this user''s contact.';
  end if;

  return query
  select u.email, u.phone
  from auth.users u
  where u.id = _user_id;
end;
$$;


ALTER FUNCTION "public"."get_user_contact"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_contact"("_user_id" "uuid", "_course_id" bigint DEFAULT NULL::bigint) RETURNS TABLE("email" "text", "phone" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Authorize if caller is the user's active coach (optionally course-scoped)…
  if not exists (
    select 1
    from public.user_coaches uc
    where uc.coach_id = auth.uid()
      and uc.user_id  = _user_id
      and uc.is_active = true
      and (_course_id is null or uc.course_id = _course_id)
  )
  -- …or caller is an admin (roles.code = 'admin' per your schema)
  and not exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.code = 'admin'
  )
  then
    raise exception 'Not authorized to view this user''s contact.';
  end if;

  -- Return from auth.users with proper type casting
  return query
  select 
    u.email::text,
    u.phone::text
  from auth.users u
  where u.id = _user_id;
end;
$$;


ALTER FUNCTION "public"."get_user_contact"("_user_id" "uuid", "_course_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_course_completion_detail"("_user_id" "uuid", "_course_id" integer) RETURNS TABLE("node_id" integer, "parent_id" integer, "node_type" "text", "title" "text", "child_position" integer, "depth" integer, "path_positions" "text", "status" "text", "is_completed" boolean)
    LANGUAGE "sql" STABLE
    AS $$
  with recursive tree as (
    -- layer 1 under the course
    select
      c.child_id        as node_id,
      c.parent_id       as parent_id,
      c.position        as child_position,
      1                 as depth,
      lpad(c.position::text, 5, '0') as path_positions
    from public.node_children c
    where c.parent_id = _course_id

    union all

    -- deeper layers
    select
      c2.child_id,
      c2.parent_id,
      c2.position      as child_position,
      t.depth + 1,
      t.path_positions || '.' || lpad(c2.position::text, 5, '0')
    from public.node_children c2
    join tree t on t.node_id = c2.parent_id
  )
  select
    t.node_id,
    t.parent_id,
    cn.node_type::text,
    cn.title,
    t.child_position,
    t.depth,
    t.path_positions,
    coalesce(p.status::text, 'not_started') as status,
    (p.status = 'completed') as is_completed
  from tree t
  join public.content_nodes cn on cn.id = t.node_id
  left join public.user_node_progress p
    on p.user_id = _user_id and p.node_id = t.node_id
  where cn.node_type in ('lesson','chapter')
  order by t.path_positions;
$$;


ALTER FUNCTION "public"."get_user_course_completion_detail"("_user_id" "uuid", "_course_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_course_progress"("_user_id" "uuid", "_course_id" integer) RETURNS TABLE("total_leaves" integer, "completed_leaves" integer, "progress" numeric)
    LANGUAGE "sql" STABLE
    AS $$
  with recursive descendants as (
    -- start: direct children of the course
    select c.child_id as node_id
    from public.node_children c
    where c.parent_id = _course_id

    union all

    -- dive: children of previous layer
    select c2.child_id
    from public.node_children c2
    join descendants d on d.node_id = c2.parent_id
  ),
  leaf_nodes as (
    select cn.id
    from public.content_nodes cn
    join descendants d on d.node_id = cn.id
    where not exists (
      select 1 from public.node_children nc where nc.parent_id = cn.id
    )
  ),
  counts as (
    select
      (select count(*) from leaf_nodes) as total_leaves,
      (
        select count(*)
        from leaf_nodes ln
        join public.user_node_progress p
          on p.node_id = ln.id
         and p.user_id = _user_id
         and p.status = 'completed'
      ) as completed_leaves
  )
  select
    counts.total_leaves,
    counts.completed_leaves,
    case
      when counts.total_leaves = 0 then 0
      else counts.completed_leaves::numeric / counts.total_leaves::numeric
    end as progress
  from counts;
$$;


ALTER FUNCTION "public"."get_user_course_progress"("_user_id" "uuid", "_course_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_engagement_summary"("_user_id" "uuid", "_from" "date" DEFAULT NULL::"date", "_to" "date" DEFAULT NULL::"date") RETURNS TABLE("expected_count" integer, "attended_count" integer)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    count(*)::int                                                   as expected_count,
    count(*) filter (where ma.attended)::int                        as attended_count
  from public.meeting_attendance ma
  join public.meetings m
    on m.id = ma.meeting_id
  join public.meeting_types mt
    on mt.id = m.meeting_type_id
  where ma.user_id = coalesce(_user_id, auth.uid())
    and mt.counts_toward_engagement = true
    and (_from is null or m.date >= _from)
    and (_to   is null or m.date <= _to);
$$;


ALTER FUNCTION "public"."get_user_engagement_summary"("_user_id" "uuid", "_from" "date", "_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_engagement_timeseries"("_user_id" "uuid", "_from" "date", "_to" "date") RETURNS TABLE("week_start" "date", "expected_count" integer, "attended_count" integer)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    date_trunc('week', m.date)::date as week_start,
    count(*)::int as expected_count,
    count(*) filter (where ma.attended)::int as attended_count
  from public.meeting_attendance ma
  join public.meetings m
    on m.id = ma.meeting_id
  join public.meeting_types mt
    on mt.id = m.meeting_type_id
  where ma.user_id = coalesce(_user_id, auth.uid())
    and mt.counts_toward_engagement = true
    and (_from is null or m.date >= _from)
    and (_to   is null or m.date <= _to)
  group by date_trunc('week', m.date)
  order by week_start;
$$;


ALTER FUNCTION "public"."get_user_engagement_timeseries"("_user_id" "uuid", "_from" "date", "_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_meetings"("_user_id" "uuid", "_from" "date" DEFAULT NULL::"date", "_to" "date" DEFAULT NULL::"date") RETURNS TABLE("meeting_id" bigint, "meeting_date" "date", "meeting_type_code" "text", "meeting_type_name" "text", "title" "text", "attended" boolean, "counts_toward_engagement" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH viewer AS (
    SELECT COALESCE(_user_id, auth.uid()) AS uid
  ),
  owner_user AS (
    -- 👇 real user_id (lowest UUID in active attendance-sharing partnership,
    --    or the user themselves if no partnership)
    SELECT public.canonical_owner_for(uid, 'attendance') AS oid
    FROM viewer
  )
  SELECT
    m.id                                        AS meeting_id,
    m.date                                      AS meeting_date,
    mt.code                                     AS meeting_type_code,
    mt.name                                     AS meeting_type_name,
    m.title                                     AS title,
    ma.attended                                 AS attended,
    COALESCE(mt.counts_toward_engagement, TRUE) AS counts_toward_engagement
  FROM public.meeting_attendance_base ma
  JOIN public.meetings m       ON m.id = ma.meeting_id
  JOIN public.meeting_types mt ON mt.id = m.meeting_type_id
  JOIN owner_user o            ON ma.user_id = o.oid
  WHERE (_from IS NULL OR m.date >= _from)
    AND (_to   IS NULL OR m.date <= _to)
  ORDER BY m.date DESC, m.id DESC;
$$;


ALTER FUNCTION "public"."get_user_meetings"("_user_id" "uuid", "_from" "date", "_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_smartdoc_answers"("_user_id" "uuid", "_content_block_id" bigint) RETURNS TABLE("doc_id" bigint, "doc_title" "text", "prompt_id" bigint, "prompt_label" "text", "prompt_type" "text", "prompt_position" integer, "value_text" "text", "value_json" "jsonb", "updated_at" timestamp with time zone, "status" "text", "submitted_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
with inst as (
  select cb.id as content_block_id, sd.id as doc_id, sd.title as doc_title
  from content_blocks cb
  join smart_docs sd on sd.id = cb.smart_doc_id
  where cb.id = _content_block_id
),
latest as (
  select r.*
  from smart_doc_responses r
  join inst i on i.content_block_id = r.content_block_id
  where r.user_id = _user_id
  order by coalesce(r.submitted_at, r.updated_at, r.started_at) desc
  limit 1
)
select
  i.doc_id,
  i.doc_title,
  p.id as prompt_id,
  p.label as prompt_label,
  p.prompt_type,
  p.position as prompt_position,  -- alias updated
  case
    when v.value_json is null then null
    else nullif(v.value_json #>> '{}','')
  end as value_text,
  v.value_json,
  coalesce(v.updated_at, l.updated_at, l.started_at) as updated_at,
  l.status,
  l.submitted_at
from inst i
join smart_doc_prompts p on p.doc_id = i.doc_id
left join latest l on true
left join smart_doc_response_values v
  on v.response_id = l.id and v.prompt_id = p.id
order by p.position nulls last, p.id;
$$;


ALTER FUNCTION "public"."get_user_smartdoc_answers"("_user_id" "uuid", "_content_block_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."grant_assigned_training_access"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.user_course_visibility (user_id, course_node_id)
  values (new.user_id, new.course_node_id)
  on conflict (user_id, course_node_id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."grant_assigned_training_access"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_codes" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.code = any (_codes)
  );
$$;


ALTER FUNCTION "public"."has_role"("_codes" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("role_code" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.code = role_code
  );
$$;


ALTER FUNCTION "public"."has_role"("role_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."initialize_business_review_system_scorecard"("_business_review_id" bigint) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare
  _review public.business_reviews%rowtype;
  _audience public.system_scorecard_audience;
  _template_key text;
begin
  select *
  into _review
  from public.business_reviews
  where id = _business_review_id
  for update;

  if not found then
    raise exception 'Business audit not found'
      using errcode = 'P0002';
  end if;

  if _review.system_scorecard_template_key is null then
    _audience := case
      when exists (
        select 1
        from public.user_roles user_role
        join public.roles role
          on role.id = user_role.role_id
        where user_role.user_id = _review.user_id
          and role.code = 'legend'
      )
      then 'legends'::public.system_scorecard_audience
      else 'foundation'::public.system_scorecard_audience
    end;

    select template.key
    into _template_key
    from public.system_scorecard_templates template
    where template.audience = _audience
      and template.is_active = true;

    if _template_key is null then
      raise exception 'No active % scorecard template found', _audience
        using errcode = 'P0002';
    end if;

    update public.business_reviews
    set system_scorecard_template_key = _template_key
    where id = _review.id;
  else
    _template_key := _review.system_scorecard_template_key;

    select template.audience
    into _audience
    from public.system_scorecard_templates template
    where template.key = _template_key;
  end if;

  insert into public.business_review_system_ratings (
    business_review_id,
    template_key,
    system_id,
    status,
    reviewed_at,
    reviewed_by,
    updated_by
  )
  select
    _review.id,
    _template_key,
    current_system.id,
    coalesce(
      previous_rating.status,
      'not_started'::public.system_scorecard_status
    ),
    null,
    null,
    null
  from public.system_scorecard_systems current_system
  left join lateral (
    select rating.status
    from public.business_review_system_ratings rating
    join public.business_reviews previous_review
      on previous_review.id = rating.business_review_id
    join public.system_scorecard_templates previous_template
      on previous_template.key = rating.template_key
    join public.system_scorecard_systems previous_system
      on previous_system.id = rating.system_id
     and previous_system.template_key = rating.template_key
    where previous_review.user_id = _review.user_id
      and previous_review.id <> _review.id
      and (
        previous_review.review_date,
        previous_review.id
      ) < (
        _review.review_date,
        _review.id
      )
      and previous_template.audience = _audience
      and previous_system.key = current_system.key
    order by
      previous_review.review_date desc,
      previous_review.id desc
    limit 1
  ) previous_rating
    on true
  where current_system.template_key = _template_key
  on conflict (business_review_id, system_id) do nothing;

  return _template_key;
end;
$$;


ALTER FUNCTION "public"."initialize_business_review_system_scorecard"("_business_review_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."initialize_business_review_system_scorecard"("_business_review_id" bigint) IS 'Attaches the appropriate active scorecard template and creates individual system rows, carrying statuses but never review timestamps forward.';



CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.code = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_or_coach"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_admin() or public.has_role('coach');
$$;


ALTER FUNCTION "public"."is_admin_or_coach"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_assistant"("_uid" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = _uid
      and r.code = 'assistant'
  );
$$;


ALTER FUNCTION "public"."is_assistant"("_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_coach"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.has_role('coach');
$$;


ALTER FUNCTION "public"."is_coach"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_user_smartdoc_instances"("_user_id" "uuid", "_course_id" bigint, "_only_submitted" boolean DEFAULT false) RETURNS TABLE("lesson_id" bigint, "lesson_title" "text", "lesson_position" integer, "chapter_id" bigint, "chapter_title" "text", "chapter_position" integer, "content_block_id" bigint, "doc_id" bigint, "doc_title" "text", "status" "text", "submitted_at" timestamp with time zone, "has_any_response" boolean, "answered_prompts" integer, "total_prompts" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
with course as (
  select id, title
  from public.content_nodes
  where id = _course_id
    and node_type = 'course'
),
walk as (
  -- Traverse ALL descendants under the course, carrying nearest lesson/chapter.
  with recursive r as (
    select
      c.id as node_id,
      0::int as depth,
      0::int as pos,

      null::bigint as lesson_id,
      null::text   as lesson_title,
      null::int    as lesson_position,

      null::bigint as chapter_id,
      null::text   as chapter_title,
      null::int    as chapter_position
    from course c

    union all

    select
      child.id as node_id,
      r.depth + 1,
      nc.position as pos,

      case when child.node_type = 'lesson' then child.id    else r.lesson_id end,
      case when child.node_type = 'lesson' then child.title else r.lesson_title end,
      case when child.node_type = 'lesson' then nc.position else r.lesson_position end,

      case
        when child.node_type = 'lesson' then null
        when child.node_type = 'chapter' then child.id
        else r.chapter_id
      end,
      case
        when child.node_type = 'lesson' then null
        when child.node_type = 'chapter' then child.title
        else r.chapter_title
      end,
      case
        when child.node_type = 'lesson' then null
        when child.node_type = 'chapter' then nc.position
        else r.chapter_position
      end
    from r
    join public.node_children nc on nc.parent_id = r.node_id
    join public.content_nodes child on child.id = nc.child_id
  )
  select * from r
),
inst as (
  -- SmartDoc placements anywhere in the subtree.
  select
    coalesce(w.lesson_id, c.id) as lesson_id,
    coalesce(w.lesson_title, c.title) as lesson_title,
    coalesce(w.lesson_position, 0) as lesson_position,

    coalesce(
      w.chapter_id,
      case when w.lesson_id is null then c.id else w.lesson_id end
    ) as chapter_id,

    coalesce(
      w.chapter_title,
      case when w.lesson_id is null then 'Course-level' else 'Lesson-level' end
    ) as chapter_title,

    coalesce(w.chapter_position, 0) as chapter_position,

    cb.id as content_block_id,
    sd.id as doc_id,
    sd.title as doc_title
  from walk w
  cross join course c
  join public.content_blocks cb
    on cb.node_id = w.node_id
   and cb.block_type = 'smart_doc'
  join public.smart_docs sd
    on sd.id = cb.smart_doc_id
),
latest as (
  -- Latest response for this user per instance, but only for instances under this course.
  select distinct on (r.content_block_id)
    r.content_block_id,
    r.id as response_id,
    r.status,
    r.submitted_at,
    coalesce(r.submitted_at, r.updated_at, r.started_at) as ts
  from public.smart_doc_responses r
  join inst i on i.content_block_id = r.content_block_id
  where r.user_id = _user_id
  order by r.content_block_id, coalesce(r.submitted_at, r.updated_at, r.started_at) desc
),
prompt_counts as (
  select p.doc_id, count(*)::int as total_prompts
  from public.smart_doc_prompts p
  group by p.doc_id
),
answered as (
  select
    i.content_block_id,
    sum(
      case
        when v.value_json is null then 0
        when nullif(v.value_json #>> '{}', '') is null then 0
        else 1
      end
    )::int as answered_prompts
  from inst i
  join latest lr on lr.content_block_id = i.content_block_id
  join public.smart_doc_prompts p on p.doc_id = i.doc_id
  left join public.smart_doc_response_values v
    on v.response_id = lr.response_id
   and v.prompt_id = p.id
  group by i.content_block_id
)
select
  i.lesson_id, i.lesson_title, i.lesson_position,
  i.chapter_id, i.chapter_title, i.chapter_position,
  i.content_block_id,
  i.doc_id, i.doc_title,
  lr.status,
  lr.submitted_at,
  (lr.response_id is not null) as has_any_response,
  coalesce(a.answered_prompts, 0) as answered_prompts,
  coalesce(pc.total_prompts, 0) as total_prompts
from inst i
left join latest lr on lr.content_block_id = i.content_block_id
left join prompt_counts pc on pc.doc_id = i.doc_id
left join answered a on a.content_block_id = i.content_block_id
where (not _only_submitted) or (lr.status = 'submitted')
order by i.lesson_position, i.chapter_position, i.doc_title, i.content_block_id;
$$;


ALTER FUNCTION "public"."list_user_smartdoc_instances"("_user_id" "uuid", "_course_id" bigint, "_only_submitted" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_completed_and_cascade"("_node_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_target_node_type text;
  v_parent_lesson_id bigint;
  v_required_count int;
  v_completed_count int;
begin
  -- 1) Mark the target node completed for the current user (idempotent)
  perform public.set_node_progress(_node_id, 'completed'::public.node_progress_status);

  -- 2) Only cascade when the target is a CHAPTER
  select cn.node_type
    into v_target_node_type
  from public.content_nodes cn
  where cn.id = _node_id;

  if not found or v_target_node_type <> 'chapter' then
    return;
  end if;

  -- 3) Find the parent lesson via node_children (tree edge)
  --    (Assumes a single parent in your course graph)
  select nc.parent_id
    into v_parent_lesson_id
  from public.node_children nc
  join public.content_nodes pn on pn.id = nc.parent_id
  where nc.child_id = _node_id
    and pn.node_type = 'lesson'
  limit 1;

  if v_parent_lesson_id is null then
    -- chapter without a lesson parent; nothing to do
    return;
  end if;

  -- 4) Count REQUIRED chapters under that lesson
  select count(*)
    into v_required_count
  from public.node_children nc
  join public.content_nodes c on c.id = nc.child_id
  where nc.parent_id = v_parent_lesson_id
    and c.node_type = 'chapter'
    and coalesce(nc.is_required, true) = true;

  -- 5) How many of those required chapters are completed by this user?
  select count(*)
    into v_completed_count
  from public.node_children nc
  join public.content_nodes c on c.id = nc.child_id
  join public.user_node_progress p
    on p.node_id = c.id
   and p.user_id = auth.uid()
   and p.status = 'completed'
  where nc.parent_id = v_parent_lesson_id
    and c.node_type = 'chapter'
    and coalesce(nc.is_required, true) = true;

  -- 6) If all required are completed → complete the LESSON
  if v_required_count > 0 and v_completed_count = v_required_count then
    perform public.set_node_progress(v_parent_lesson_id, 'completed'::public.node_progress_status);
    -- No explicit unlock write; your get_child_unlock_status will expose the next lesson as unlocked.
  end if;
end
$$;


ALTER FUNCTION "public"."mark_completed_and_cascade"("_node_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_node_completed"("_node_id" bigint) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
select public.set_node_progress(_node_id, 'completed'::public.node_progress_status);
$$;


ALTER FUNCTION "public"."mark_node_completed"("_node_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_node_started"("_node_id" bigint) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
select public.set_node_progress(_node_id, 'in_progress'::public.node_progress_status);
$$;


ALTER FUNCTION "public"."mark_node_started"("_node_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."nc_default_seq_unlock_on_attach"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_course_id bigint;
  v_seq_on boolean;
begin
  with recursive up as (
    select p.id, p.node_type
    from public.content_nodes p
    where p.id = new.parent_id
    union all
    select p2.id, p2.node_type
    from public.node_children e
    join public.content_nodes p2 on p2.id = e.parent_id
    join up u on u.id = e.child_id
  )
  select id into v_course_id from up where node_type = 'course' limit 1;

  if v_course_id is null then
    return new;
  end if;

  select sequential_unlock into v_seq_on from public.content_nodes where id = v_course_id;

  if v_seq_on then
    update public.content_nodes
      set sequential_unlock = true, updated_at = now()
      where id = new.child_id;

    update public.node_children
      set is_required = true
      where parent_id = new.parent_id and child_id = new.child_id;
  end if;

  return new;
end
$$;


ALTER FUNCTION "public"."nc_default_seq_unlock_on_attach"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."nc_enforce_sibling_slug_unique"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_slug text;
  v_dup  bigint;
begin
  -- Only enforce when the CHILD is a chapter
  select c.slug into v_slug
  from public.content_nodes c
  where c.id = new.child_id
    and c.node_type = 'chapter';

  if v_slug is null then
    return new; -- not a chapter (or missing), nothing to enforce
  end if;

  -- If the chapter has empty slug for some reason, backfill now
  if length(v_slug) = 0 then
    update public.content_nodes
      set slug = public.slugify(title), updated_at = now()
      where id = new.child_id;
    select slug into v_slug from public.content_nodes where id = new.child_id;
  end if;

  -- Look for any other chapter with the same slug under the same parent
  select c2.id into v_dup
  from public.node_children nc
  join public.content_nodes c2 on c2.id = nc.child_id
  where nc.parent_id = new.parent_id
    and c2.node_type = 'chapter'
    and c2.slug = v_slug
    and c2.id <> new.child_id
  limit 1;

  if v_dup is not null then
    raise exception
      using message = format('Duplicate chapter slug "%s" under the same parent (parent_id=%s). Please adjust the title/slug.',
                             v_slug, new.parent_id);
  end if;

  return new;
end
$$;


ALTER FUNCTION "public"."nc_enforce_sibling_slug_unique"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_user_for_bucket"("_bucket" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT owner_id
  FROM (
    -- Case 1: bucket is literally a profile id
    SELECT p.id AS owner_id
    FROM public.profiles p
    WHERE p.id = _bucket

    UNION

    -- Case 2: bucket is a partnership id: pick a stable member as canonical owner
    SELECT pu.user_id AS owner_id
    FROM public.partnership_users pu
    WHERE pu.partnership_id = _bucket
  ) s
  ORDER BY owner_id
  LIMIT 1;
$$;


ALTER FUNCTION "public"."owner_user_for_bucket"("_bucket" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."partnership_for_user"("_user" "uuid", "_domain" "public"."share_domain") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT p.id
  FROM public.partnership_users pu
  JOIN public.partnerships p ON p.id = pu.partnership_id
  WHERE pu.user_id = _user
    AND p.is_active
    AND (
      (_domain = 'kpis'       AND p.shared_kpis) OR
      (_domain = 'attendance' AND p.shared_attendance) OR
      (_domain = 'notes'      AND p.shared_notes)
    )
  LIMIT 1;
$$;


ALTER FUNCTION "public"."partnership_for_user"("_user" "uuid", "_domain" "public"."share_domain") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."propagate_scorecard_system_library_item"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.coaching_note_action_steps as action_step
  set
    library_item_id = new.library_item_id,
    updated_at = now()
  from public.business_review_system_priorities as priority
  where priority.system_id = new.id
    and action_step.id = priority.action_step_id
    and action_step.library_item_id is distinct from new.library_item_id;

  return new;
end;
$$;


ALTER FUNCTION "public"."propagate_scorecard_system_library_item"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_if_manual_cleared"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if NEW.attention_status_manual is null
     and OLD.attention_status_manual is not null then
    perform public.apply_user_attention_auto(NEW.id);
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."recompute_if_manual_cleared"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_on_meeting_attendance_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_user uuid := coalesce(NEW.user_id, OLD.user_id);
begin
  -- No user, nothing to do
  if v_user is null then
    return null;
  end if;

  -- If the profile is already gone (e.g. cascading user delete), skip
  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user
  ) then
    return null;
  end if;

  -- Normal behavior: recompute attention, but never block deletes
  begin
    perform public.apply_user_attention_auto(v_user);
  exception
    when others then
      -- Optional: log instead of aborting cascades
      raise notice 'apply_user_attention_auto failed for %: %', v_user, sqlerrm;
      return null;
  end;

  return null;
end;
$$;


ALTER FUNCTION "public"."recompute_on_meeting_attendance_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_user_attention_now"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.apply_user_attention_auto(p_user_id);
$$;


ALTER FUNCTION "public"."recompute_user_attention_now"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reconcile_user_achievements_backfill"() RETURNS bigint
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  insert into public.user_achievements (user_id, achievement_id, achieved_at, awarded_via)
  select user_id, achievement_id, achieved_at, 'reconcile'
  from public.user_achievements_missing
  on conflict (user_id, achievement_id) do nothing
  returning 1
$$;


ALTER FUNCTION "public"."reconcile_user_achievements_backfill"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reconcile_user_achievements_cleanup"() RETURNS bigint
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  delete from public.user_achievements a
  using public.user_achievements_extraneous x
  where a.user_id = x.user_id
    and a.achievement_id = x.achievement_id
  returning 1
$$;


ALTER FUNCTION "public"."reconcile_user_achievements_cleanup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_tag_text"("_resource_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare _new text;
begin
  select string_agg(lower(t.name), ' ')
    into _new
  from public.resource_tags rt
  join public.tags t on t.id = rt.tag_id
  where rt.resource_id = _resource_id;

  update public.resources
     set tag_text = _new
   where id = _resource_id;
end $$;


ALTER FUNCTION "public"."refresh_tag_text"("_resource_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_cancelled_ghl_meeting_attendance"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  _normalized_status text := lower(
    regexp_replace(coalesce(new.ghl_status, ''), '[[:space:]_-]+', '', 'g')
  );
begin
  if new.ghl_appointment_id is not null
     and _normalized_status in ('cancelled', 'canceled', 'deleted', 'invalid', 'noshow') then
    delete from public.meeting_attendance_base as attendance
    where attendance.meeting_id = new.id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."remove_cancelled_ghl_meeting_attendance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_content_node_open_path"("_node_id" bigint) RETURNS "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  with recursive chain as (
    select
      cn.id,
      cn.slug,
      cn.node_type,
      lower(cn.title) as title_lc,
      0 as depth
    from public.content_nodes cn
    where cn.id = _node_id

    union all

    select
      p.id,
      p.slug,
      p.node_type,
      lower(p.title) as title_lc,
      c.depth + 1
    from chain c
    join lateral (
      select nc.parent_id
      from public.node_children nc
      where nc.child_id = c.id
      order by nc.position asc, nc.parent_id asc
      limit 1
    ) pick on true
    join public.content_nodes p on p.id = pick.parent_id
    where c.depth < 64
  ),
  chain_slugged as (
    select *
    from chain
    where slug is not null
  ),
  agg as (
    select
      array_agg(slug order by depth desc) as slugs_root_to_leaf,
      array_agg(node_type order by depth desc) as types_root_to_leaf,
      (array_agg(title_lc order by depth desc))[1] as root_title_lc,
      lower((array_agg(slug order by depth desc))[1]) as root_slug_lc
    from chain_slugged
  ),
  course_pos as (
    select
      a.*,
      (
        select min(i)
        from generate_subscripts(a.types_root_to_leaf, 1) g(i)
        where a.types_root_to_leaf[i] = 'course'
      ) as course_idx
    from agg a
  )
  select
    case
      when slugs_root_to_leaf is null
        or array_length(slugs_root_to_leaf, 1) is null
        then null

      -- root is Library (by slug or title)
      when root_slug_lc = 'library' or root_title_lc = 'library'
        then '/library/' || slugs_root_to_leaf[array_length(slugs_root_to_leaf, 1)]

      -- course path supports nesting
      when course_idx is not null
        then '/courses/' || array_to_string(
          slugs_root_to_leaf[course_idx:array_length(slugs_root_to_leaf, 1)],
          '/'
        )

      else null
    end
  from course_pos;
$$;


ALTER FUNCTION "public"."resolve_content_node_open_path"("_node_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_achievements_on_action_step"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_user uuid;
  v_old_node bigint := OLD.library_item_id;
begin
  if v_old_node is null then
    return NEW;
  end if;

  select cn.user_id into v_user
  from public.coaching_notes cn
  where cn.id = OLD.coaching_note_id;

  if v_user is null then
    return NEW;
  end if;

  delete from public.user_achievements ua
  using public.achievement_node_map m
  where ua.user_id = v_user
    and ua.achievement_id = m.achievement_id
    and m.node_id = v_old_node
    and ua.awarded_via in ('auto','reconcile');  -- <<< keep manual/import

  return NEW;
end
$$;


ALTER FUNCTION "public"."revoke_achievements_on_action_step"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_resources"("_q" "text" DEFAULT ''::"text", "_types" "text"[] DEFAULT NULL::"text"[], "_tag_ids" bigint[] DEFAULT NULL::bigint[], "_sort" "text" DEFAULT 'relevance'::"text", "_limit" integer DEFAULT 24, "_offset" integer DEFAULT 0, "_mode" "text" DEFAULT 'balanced'::"text") RETURNS TABLE("id" bigint, "title" "text", "description" "text", "type" "text", "url" "text", "thumbnail" "text", "duration" integer, "created_at" timestamp with time zone, "tags" "jsonb", "score" real, "debug_info" "jsonb")
    LANGUAGE "sql"
    AS $$
  -- 0) normalize the query once
  with params as (
    select
      coalesce(nullif(trim(_q), ''), '')        as q_raw,
      lower(coalesce(nullif(trim(_q), ''), '')) as q_lc,
      case lower(_mode)
        when 'strict' then 0.45
        when 'loose'  then 0.20
        else              0.30   -- balanced
      end as base_limit
  ),
  -- 0b) dynamic looseness for short queries (≤6 chars)
  lim as (
    select
      case 
        when length(q_lc) <= 6 
          then least(base_limit, 0.05)
        else 
          base_limit
      end as trigram_limit,
      q_raw, q_lc
    from params
  ),
  -- 0c) set the % / word_similarity threshold (pg_trgm)
  setlim as (
    select set_limit(trigram_limit) as _
    from lim
  ),
  -- 1) base filter
  base as (
    select r.*
    from public.resources r
    where (r.state = 'published' or public.is_admin())
      and (_types   is null or r.type = any(_types))
      and (_tag_ids is null or exists (
            select 1 from public.resource_tags rt
            where rt.resource_id = r.id and rt.tag_id = any(_tag_ids)
          ))
  ),
  -- 2) build FTS vectors: english (stemmed) + simple (raw) with A/B/C weights
  fts as (
  select
    b.*           -- includes tsv_all and tsv_simple already
  from base b
),

  -- 3) split query into terms and build *two* prefix queries
  qbits as (
    select
      array_remove(regexp_split_to_array(q_lc, '\s+'), '') as terms,
      q_lc, q_raw
    from lim
  ),
  qprefix as (
    select
      case when array_length(terms,1) is null then null::tsquery
           else to_tsquery('english', array_to_string(
                  (select array_agg(quote_literal(t) || ':*') from unnest(terms) t),
                  ' & '
                ))
      end as tsq_prefix_en,
      case when array_length(terms,1) is null then null::tsquery
           else to_tsquery('simple', array_to_string(
                  (select array_agg(quote_literal(t) || ':*') from unnest(terms) t),
                  ' & '
                ))
      end as tsq_prefix_simple,
      q_lc, q_raw
    from qbits
  ),
  -- 4) rank
  ranked as (
    select
      f.*,
      q.q_lc, q.q_raw,
      qp.tsq_prefix_en,
      qp.tsq_prefix_simple,

      -- A) FTS rank with Google-like parser; guard empty string
      coalesce(ts_rank(f.tsv_all, websearch_to_tsquery('english', nullif(q.q_raw,''))), 0) as fts_rank,

      -- B) Prefix bonus if either english (stemmed) or simple (raw) prefix hits
      (case
         when (qp.tsq_prefix_en     is not null and f.tsv_all    @@ qp.tsq_prefix_en)
           or (qp.tsq_prefix_simple is not null and f.tsv_simple @@ qp.tsq_prefix_simple)
         then 0.20 else 0
       end) as prefix_bonus,

      -- C) Fuzzy boosters (pg_trgm word_similarity)
      greatest(word_similarity(lower(f.title),    q.q_lc) * 0.60, 0) as fuzzy_title,
      greatest(word_similarity(lower(f.tag_text), q.q_lc) * 0.45, 0) as fuzzy_tags,

      -- D) Explicit title nudges (exact/prefix/contains)
      case
        when q.q_lc = ''                                then 0
        when lower(f.title) = q.q_lc                    then 0.80
        when lower(f.title) like q.q_lc || '%'          then 0.60
        when lower(f.title) like '%' || q.q_lc || '%'   then 0.30
        else 0
      end as title_exactish
    from fts f
    cross join lim q
    cross join qprefix qp
    where
      -- eligible rows: empty query OR (FTS or either-prefix) OR fuzzy
      q.q_lc = '' OR
      f.tsv_all @@ websearch_to_tsquery('english', q.q_raw) OR
      ( (qp.tsq_prefix_en     is not null and f.tsv_all    @@ qp.tsq_prefix_en)
        or
        (qp.tsq_prefix_simple is not null and f.tsv_simple @@ qp.tsq_prefix_simple)
      ) OR
      similarity(lower(f.title),        q.q_lc) >= q.trigram_limit OR
      word_similarity(lower(f.tag_text), q.q_lc) >= q.trigram_limit
  ),
  -- 5) assemble score + debug
  scored as (
    select
      r.*,
      (r.fts_rank + r.prefix_bonus + r.fuzzy_title + r.fuzzy_tags + r.title_exactish) as score,
      jsonb_build_object(
        'q_raw',               r.q_raw,
        'q_lc',                r.q_lc,
        'fts_rank',            r.fts_rank,
        'prefix_hit_en',       (r.tsq_prefix_en     is not null and r.tsv_all    @@ r.tsq_prefix_en),
        'prefix_hit_simple',   (r.tsq_prefix_simple is not null and r.tsv_simple @@ r.tsq_prefix_simple),
        'fuzzy_title',         word_similarity(lower(r.title),    r.q_lc),
        'fuzzy_tags',          word_similarity(lower(r.tag_text), r.q_lc),
        'exact_title',         (lower(r.title) = r.q_lc),
        'prefix_title',        (lower(r.title) like r.q_lc || '%'),
        'contains_title',      (lower(r.title) like '%' || r.q_lc || '%')
      ) as debug_info
    from ranked r
  )
  -- 6) final select
  select
    s.id, s.title, s.description, s.type, s.url, s.thumbnail, s.duration, s.created_at,
    (
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'category', t.category))
      from public.resource_tags rt
      join public.tags t on t.id = rt.tag_id
      where rt.resource_id = s.id
    ) as tags,
    s.score,
    s.debug_info
  from scored s
  order by
    case when _sort = 'relevance'     then s.score      end desc nulls last,
    case when _sort = 'date_desc'     then s.created_at end desc,
    case when _sort = 'date_asc'      then s.created_at end asc,
    case when _sort = 'alpha_asc'     then s.title      end asc,
    case when _sort = 'alpha_desc'    then s.title      end desc,
    case when _sort = 'duration_asc'  then s.duration   end asc  nulls last,
    case when _sort = 'duration_desc' then s.duration   end desc nulls last,
    s.id desc
  limit _limit offset _offset;
$$;


ALTER FUNCTION "public"."search_resources"("_q" "text", "_types" "text"[], "_tag_ids" bigint[], "_sort" "text", "_limit" integer, "_offset" integer, "_mode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_resources"("_q" "text" DEFAULT ''::"text", "_types" "text"[] DEFAULT NULL::"text"[], "_tag_ids" bigint[] DEFAULT NULL::bigint[], "_duration" "text" DEFAULT NULL::"text", "_date_range" "text" DEFAULT NULL::"text", "_sort" "text" DEFAULT 'relevance'::"text", "_limit" integer DEFAULT 24, "_offset" integer DEFAULT 0, "_mode" "text" DEFAULT 'balanced'::"text") RETURNS TABLE("id" bigint, "title" "text", "description" "text", "type" "text", "url" "text", "thumbnail" "text", "duration" integer, "created_at" timestamp with time zone, "tags" "jsonb", "score" real, "debug_info" "jsonb")
    LANGUAGE "sql"
    AS $$
  with
  viewer as (
    select
      auth.uid() as user_id,
      public.is_admin() as is_admin
  ),
  visible_course_ids as (
    select gac.course_node_id
    from public.get_available_course_ids_for_user((select user_id from viewer)) gac
  ),
  params as (
    select
      coalesce(nullif(trim(_q), ''), '')        as q_raw,
      lower(coalesce(nullif(trim(_q), ''), '')) as q_lc,
      case lower(_mode)
        when 'strict' then 0.45
        when 'loose'  then 0.20
        else              0.30
      end as base_limit
  ),
  lim as (
    select
      case
        when length(q_lc) <= 6
          then least(base_limit, 0.10)
        else
          base_limit
      end as trigram_limit,
      q_raw, q_lc
    from params
  ),
  setlim as (
    select set_limit(trigram_limit) as _
    from lim
  ),
  base as (
    select r.*
    from public.resources r
    cross join viewer v
    cross join setlim
    where
      (r.state = 'published' or v.is_admin)
      and (
        v.is_admin

        or not exists (
          select 1
          from public.resource_block_locations rbl
          where rbl.resource_id = r.id
        )

        or exists (
          select 1
          from public.resource_block_locations rbl
          where rbl.resource_id = r.id
            and (
              not exists (
                select 1
                from public.get_containing_course_ids(rbl.node_id) gcc
              )
              or exists (
                select 1
                from public.get_containing_course_ids(rbl.node_id) gcc
                join visible_course_ids vci
                  on vci.course_node_id = gcc.course_node_id
              )
            )
        )
      )

      and (_types is null or r.type = any(_types))
      and (_tag_ids is null or exists (
            select 1
            from public.resource_tags rt
            where rt.resource_id = r.id
              and rt.tag_id = any(_tag_ids)
          ))
      and (
        _duration is null
        or (
          (_duration = 'short' and r.duration is not null and r.duration < 600)
          or (_duration = 'medium' and r.duration is not null and r.duration between 600 and 1800)
          or (_duration = 'long' and r.duration is not null and r.duration > 1800)
        )
      )
      and (
        _date_range is null
        or _date_range = 'all'
        or (_date_range = '30' and r.created_at >= now() - interval '30 days')
        or (_date_range = '90' and r.created_at >= now() - interval '90 days')
      )
  ),
  fts as (
    select b.*
    from base b
  ),
  qbits as (
    select
      array_remove(regexp_split_to_array(q_lc, '\s+'), '') as terms,
      q_lc, q_raw
    from lim
  ),
  qprefix as (
    select
      case
        when array_length(terms, 1) is null then null::tsquery
        else to_tsquery(
          'english',
          array_to_string(
            (select array_agg(quote_literal(t) || ':*') from unnest(terms) t),
            ' & '
          )
        )
      end as tsq_prefix_en,
      case
        when array_length(terms, 1) is null then null::tsquery
        else to_tsquery(
          'simple',
          array_to_string(
            (select array_agg(quote_literal(t) || ':*') from unnest(terms) t),
            ' & '
          )
        )
      end as tsq_prefix_simple,
      q_lc, q_raw
    from qbits
  ),
  ranked as (
    select
      f.*,
      q.q_lc, q.q_raw,
      qp.tsq_prefix_en,
      qp.tsq_prefix_simple,

      coalesce(ts_rank(f.tsv_all, websearch_to_tsquery('english', nullif(q.q_raw, ''))), 0) as fts_rank,

      case
        when (qp.tsq_prefix_en is not null and f.tsv_all @@ qp.tsq_prefix_en)
          or (qp.tsq_prefix_simple is not null and f.tsv_simple @@ qp.tsq_prefix_simple)
        then 0.20 else 0
      end as prefix_bonus,

      greatest(word_similarity(lower(f.title), q.q_lc) * 0.60, 0) as fuzzy_title,
      greatest(word_similarity(lower(f.tag_text), q.q_lc) * 0.45, 0) as fuzzy_tags,

      case
        when q.q_lc = ''                              then 0
        when lower(f.title) = q.q_lc                  then 0.80
        when lower(f.title) like q.q_lc || '%'        then 0.60
        when lower(f.title) like '%' || q.q_lc || '%' then 0.30
        else 0
      end as title_exactish
    from fts f
    cross join lim q
    cross join qprefix qp
    where
      q.q_lc = ''
      or f.tsv_all @@ websearch_to_tsquery('english', q.q_raw)
      or (
        (qp.tsq_prefix_en is not null and f.tsv_all @@ qp.tsq_prefix_en)
        or
        (qp.tsq_prefix_simple is not null and f.tsv_simple @@ qp.tsq_prefix_simple)
      )
      or similarity(lower(f.title), q.q_lc) >= q.trigram_limit
      or word_similarity(lower(f.tag_text), q.q_lc) >= q.trigram_limit
  ),
  scored as (
    select
      r.*,
      (r.fts_rank + r.prefix_bonus + r.fuzzy_title + r.fuzzy_tags + r.title_exactish) as score,
      jsonb_build_object(
        'q_raw', r.q_raw,
        'q_lc', r.q_lc,
        'fts_rank', r.fts_rank,
        'prefix_hit_en', (r.tsq_prefix_en is not null and r.tsv_all @@ r.tsq_prefix_en),
        'prefix_hit_simple', (r.tsq_prefix_simple is not null and r.tsv_simple @@ r.tsq_prefix_simple),
        'fuzzy_title', word_similarity(lower(r.title), r.q_lc),
        'fuzzy_tags', word_similarity(lower(r.tag_text), r.q_lc),
        'exact_title', (lower(r.title) = r.q_lc),
        'prefix_title', (lower(r.title) like r.q_lc || '%'),
        'contains_title', (lower(r.title) like '%' || r.q_lc || '%')
      ) as debug_info
    from ranked r
  )
  select
    s.id,
    s.title,
    s.description,
    s.type,
    s.url,
    s.thumbnail,
    s.duration,
    s.created_at,
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'category', t.category
        )
      )
      from public.resource_tags rt
      join public.tags t on t.id = rt.tag_id
      where rt.resource_id = s.id
    ) as tags,
    s.score,
    s.debug_info
  from scored s
  order by
    case when _sort = 'relevance'     then s.score      end desc nulls last,
    case when _sort = 'date_desc'     then s.created_at end desc,
    case when _sort = 'date_asc'      then s.created_at end asc,
    case when _sort = 'alpha_asc'     then s.title      end asc,
    case when _sort = 'alpha_desc'    then s.title      end desc,
    case when _sort = 'duration_asc'  then s.duration   end asc nulls last,
    case when _sort = 'duration_desc' then s.duration   end desc nulls last,
    s.id desc
  limit _limit offset _offset;
$$;


ALTER FUNCTION "public"."search_resources"("_q" "text", "_types" "text"[], "_tag_ids" bigint[], "_duration" "text", "_date_range" "text", "_sort" "text", "_limit" integer, "_offset" integer, "_mode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_resources_with_page"("_q" "text" DEFAULT ''::"text", "_types" "text"[] DEFAULT NULL::"text"[], "_tag_ids" bigint[] DEFAULT NULL::bigint[], "_duration" "text" DEFAULT NULL::"text", "_date_range" "text" DEFAULT NULL::"text", "_sort" "text" DEFAULT 'relevance'::"text", "_limit" integer DEFAULT 24, "_offset" integer DEFAULT 0, "_mode" "text" DEFAULT 'balanced'::"text") RETURNS TABLE("id" bigint, "title" "text", "description" "text", "type" "text", "url" "text", "thumbnail" "text", "duration" integer, "created_at" timestamp with time zone, "tags" "jsonb", "score" real, "debug_info" "jsonb", "page_slug" "text", "open_path" "text")
    LANGUAGE "sql"
    AS $$
  select
    s.id, s.title, s.description, s.type, s.url, s.thumbnail, s.duration, s.created_at,
    s.tags, s.score, s.debug_info,
    rpl.node_slug as page_slug,
    rpl.open_path as open_path
  from public.search_resources(_q, _types, _tag_ids, _duration, _date_range, _sort, _limit, _offset, _mode) s
  left join public.resource_primary_location rpl
    on rpl.resource_id = s.id
$$;


ALTER FUNCTION "public"."search_resources_with_page"("_q" "text", "_types" "text"[], "_tag_ids" bigint[], "_duration" "text", "_date_range" "text", "_sort" "text", "_limit" integer, "_offset" integer, "_mode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_business_review_system_priority"("_business_review_id" bigint, "_system_id" bigint, "_selected" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare
  _actor_id uuid := auth.uid();
  _review public.business_reviews%rowtype;
  _starting_status public.system_scorecard_status;
  _system_label text;
  _library_item_id bigint;
  _position smallint;
  _action_step_id bigint;
  _action_step_status public.action_step_status;
begin
  if _actor_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if _business_review_id is null or _system_id is null or _selected is null then
    raise exception 'Business audit, system, and selection state are required'
      using errcode = '22004';
  end if;

  select *
  into _review
  from public.business_reviews
  where id = _business_review_id
  for update;

  if not found then
    raise exception 'Business audit not found'
      using errcode = 'P0002';
  end if;

  if not (
    exists (
      select 1
      from public.user_roles user_role
      join public.roles role
        on role.id = user_role.role_id
      where user_role.user_id = _actor_id
        and role.code = 'admin'
    )
    or (
      exists (
        select 1
        from public.user_roles user_role
        join public.roles role
          on role.id = user_role.role_id
        where user_role.user_id = _actor_id
          and role.code = 'coach'
      )
      and exists (
        select 1
        from public.user_coaches assignment
        where assignment.coach_id = _actor_id
          and assignment.user_id = _review.user_id
          and assignment.is_active = true
      )
    )
  ) then
    raise exception 'You do not have access to this student'
      using errcode = '42501';
  end if;

  select
    rating.status,
    system.label,
    system.library_item_id
  into
    _starting_status,
    _system_label,
    _library_item_id
  from public.business_review_system_ratings rating
  join public.system_scorecard_systems system
    on system.id = rating.system_id
   and system.template_key = rating.template_key
  where rating.business_review_id = _review.id
    and rating.system_id = _system_id
    and rating.template_key = _review.system_scorecard_template_key;

  if not found then
    raise exception 'That system does not belong to this Business Audit'
      using errcode = '22023';
  end if;

  if _selected then
    select
      priority.position,
      priority.action_step_id
    into
      _position,
      _action_step_id
    from public.business_review_system_priorities priority
    where priority.business_review_id = _review.id
      and priority.system_id = _system_id;

    if found then
      return jsonb_build_object(
        'selected', true,
        'position', _position,
        'actionStepId', _action_step_id
      );
    end if;

    select candidate.position::smallint
    into _position
    from generate_series(1, 3) as candidate(position)
    where not exists (
      select 1
      from public.business_review_system_priorities priority
      where priority.business_review_id = _review.id
        and priority.position = candidate.position
    )
    order by candidate.position
    limit 1;

    if _position is null then
      raise exception 'A Business Audit can have at most three priority systems'
        using errcode = '23514';
    end if;

    insert into public.coaching_note_action_steps (
      coaching_note_id,
      label,
      library_item_id,
      status
    )
    values (
      _review.coaching_note_id,
      _system_label,
      _library_item_id,
      'not_started'::public.action_step_status
    )
    returning id into _action_step_id;

    insert into public.business_review_system_priorities (
      business_review_id,
      system_id,
      position,
      action_step_id,
      starting_status,
      selected_by
    )
    values (
      _review.id,
      _system_id,
      _position,
      _action_step_id,
      _starting_status,
      _actor_id
    );

    return jsonb_build_object(
      'selected', true,
      'position', _position,
      'actionStepId', _action_step_id
    );
  end if;

  select
    priority.action_step_id,
    action_step.status
  into
    _action_step_id,
    _action_step_status
  from public.business_review_system_priorities priority
  join public.coaching_note_action_steps action_step
    on action_step.id = priority.action_step_id
  where priority.business_review_id = _review.id
    and priority.system_id = _system_id;

  if not found then
    return jsonb_build_object('selected', false);
  end if;

  if _action_step_status = 'not_started'::public.action_step_status then
    -- An untouched generated step can be removed cleanly.
    delete from public.coaching_note_action_steps
    where id = _action_step_id;
  else
    -- Preserve implementation work after it has started. It becomes a normal
    -- action step and is no longer synchronized as a scorecard priority.
    delete from public.business_review_system_priorities
    where business_review_id = _review.id
      and system_id = _system_id;
  end if;

  return jsonb_build_object('selected', false);
end;
$$;


ALTER FUNCTION "public"."set_business_review_system_priority"("_business_review_id" bigint, "_system_id" bigint, "_selected" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_business_review_system_priority"("_business_review_id" bigint, "_system_id" bigint, "_selected" boolean) IS 'Selects or clears one of a Business Audit''s three implementation priorities and manages its generated coaching-note action step.';



CREATE OR REPLACE FUNCTION "public"."set_course_order"("_course_ids" bigint[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Upsert ordering
  with ord as (
    select
      x.course_id,
      x.ord - 1 as pos
    from unnest(_course_ids) with ordinality as x(course_id, ord)
  )
  insert into public.course_sort_orders (course_node_id, sort_order, updated_by)
  select course_id, pos, auth.uid()
  from ord
  on conflict (course_node_id)
  do update set
    sort_order = excluded.sort_order,
    updated_by = excluded.updated_by,
    updated_at = now();
end;
$$;


ALTER FUNCTION "public"."set_course_order"("_course_ids" bigint[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_custom_jwt_claims"("uid" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  user_role text;
begin
  select role into user_role from public.profiles where id = uid;

  if user_role is not null then
    perform
      auth.jwt_custom_claims(uid, json_build_object('role', user_role));
  end if;
end;
$$;


ALTER FUNCTION "public"."set_custom_jwt_claims"("uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_node_progress"("_node_id" bigint, "_status" "public"."node_progress_status" DEFAULT NULL::"public"."node_progress_status") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  /*
    Rules:
    - Incoming NULL => treat as 'in_progress' (your original behavior).
    - Never downgrade: keep max(existing.status, incoming.status) by enum ordering.
    - completed_at is sticky once set; only set when we (first) reach completed.
    - first_started_at set once when first reaching in_progress or completed.
  */

  insert into public.user_node_progress as up
    (user_id, node_id, status, first_started_at, completed_at, updated_at)
  values (
    auth.uid(),
    _node_id,
    coalesce(_status, 'in_progress'::public.node_progress_status),
    case
      when coalesce(_status, 'in_progress') in ('in_progress','completed') then now()
      else null
    end,
    case
      when _status = 'completed' then now()
      else null
    end,
    now()
  )
  on conflict (user_id, node_id) do update
  set
    -- Never downgrade: keep the higher of existing vs incoming by enum order.
    status = case
               when up.status = 'completed' then 'completed'
               when coalesce(excluded.status, 'in_progress') > up.status
                 then coalesce(excluded.status, 'in_progress')
               else up.status
             end,

    -- Set once when we first reach in_progress (or completed); never overwrite.
    first_started_at = coalesce(
      up.first_started_at,
      case
        when coalesce(excluded.status, 'in_progress') in ('in_progress','completed') then now()
        else null
      end
    ),

    -- completed_at is sticky: once set, keep it; when we (first) reach completed, set it.
    completed_at = case
                     when up.status = 'completed' then up.completed_at
                     when coalesce(excluded.status, 'in_progress') = 'completed'
                       then coalesce(up.completed_at, now())
                     else up.completed_at
                   end,

    updated_at = now();
end
$$;


ALTER FUNCTION "public"."set_node_progress"("_node_id" bigint, "_status" "public"."node_progress_status") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_node_state"("_node_id" bigint, "_state" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_state text := public._validate_node_state(_state);
begin
  -- subtree
  with recursive sub as (
    select cn.id
    from public.content_nodes cn
    where cn.id = _node_id
    union all
    select c2.id
    from public.node_children e
    join public.content_nodes c2 on c2.id = e.child_id
    join sub s on s.id = e.parent_id
  )
  update public.content_nodes n
  set state = v_state,
      updated_at = now()
  where n.id in (select id from sub);

  -- smart_docs under subtree
  with recursive sub as (
    select cn.id
    from public.content_nodes cn
    where cn.id = _node_id
    union all
    select c2.id
    from public.node_children e
    join public.content_nodes c2 on c2.id = e.child_id
    join sub s on s.id = e.parent_id
  ), affected_docs as (
    select distinct sd.id as doc_id
    from public.content_blocks cb
    join public.smart_docs sd on sd.id = cb.smart_doc_id
    where cb.block_type = 'smart_doc'
      and cb.node_id in (select id from sub)
  )
  update public.smart_docs d
  set is_published = (v_state = 'published'),
      updated_at   = now()
  where d.id in (select doc_id from affected_docs);
end
$$;


ALTER FUNCTION "public"."set_node_state"("_node_id" bigint, "_state" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_resources_redirect_url"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  -- INSERT: if this is storage-backed, ensure url is /r/<id>
  if tg_op = 'INSERT' then
    if new.storage_bucket is not null and new.storage_path is not null then
      -- new.id should already be populated by DEFAULT nextval, but guard just in case
      if new.id is null then
        -- Adjust seq name if different in your DB (resources_id_seq is the default from your schema)
        new.id := nextval('public.resources_id_seq');
      end if;
      new.url := '/r/' || new.id::text;
    end if;

    return new;
  end if;

  -- UPDATE: if we make/keep it storage-backed, normalize url to /r/<id>
  if tg_op = 'UPDATE' then
    if new.storage_bucket is not null and new.storage_path is not null then
      -- Only rewrite when:
      --  - url is NULL (shouldn’t happen with NOT NULL, but safe), or
      --  - url looks external (starts with http), or
      --  - storage locator changed
      if new.url is null
         or new.url ~* '^https?://'
         or (old.storage_bucket is distinct from new.storage_bucket)
         or (old.storage_path   is distinct from new.storage_path)
      then
        new.url := '/r/' || new.id::text;
      end if;
    end if;

    return new;
  end if;

  return new;
end
$$;


ALTER FUNCTION "public"."set_resources_redirect_url"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_row_who_cols"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
    begin
      if tg_op = 'INSERT' then
        if new.created_by is null then new.created_by := auth.uid(); end if;
        new.updated_by := auth.uid();
      elsif tg_op = 'UPDATE' then
        new.updated_by := auth.uid();
      end if;
      return new;
    end
    $$;


ALTER FUNCTION "public"."set_row_who_cols"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_user_attention_manual_status"("p_user_id" "uuid", "p_status" "public"."user_attention_status", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_prev_manual public.user_attention_status;
  v_prev_reason text;
begin
  -- Lock the row and capture previous manual state (for history)
  select attention_status_manual,
         attention_status_manual_reason
    into v_prev_manual,
         v_prev_reason
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'set_user_attention_manual_status: profile not found for user_id=%', p_user_id;
  end if;

  -- Update current manual status on profiles
  update public.profiles
  set attention_status_manual        = p_status,
      attention_status_manual_reason = p_reason,
      attention_status_updated_by    = auth.uid(),
      attention_status_updated_at    = now()
  where id = p_user_id;

  -- Write audit log row
  insert into public.user_attention_status_log (
    user_id,
    manual_status,
    reason,
    prev_manual_status,
    prev_reason,
    changed_by,
    change_source
  )
  values (
    p_user_id,
    p_status,
    p_reason,
    v_prev_manual,
    v_prev_reason,
    auth.uid(),
    'manual'
  );
end;
$$;


ALTER FUNCTION "public"."set_user_attention_manual_status"("p_user_id" "uuid", "p_status" "public"."user_attention_status", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_user_attention_manual_status"("p_user_id" "uuid", "p_status" "public"."user_attention_status", "p_reason" "text") IS 'Sets or clears a user''s MANUAL attention status (green/yellow/red/null) and logs the change. Coaches/admins call this from the UI.';



CREATE TABLE IF NOT EXISTS "public"."user_training_assignments" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "course_node_id" bigint NOT NULL,
    "coaching_note_id" bigint NOT NULL,
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "context_label" "text",
    "due_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "ended_by" "uuid",
    CONSTRAINT "user_training_assignments_context_label_length" CHECK ((("context_label" IS NULL) OR ("char_length"("context_label") <= 240))),
    CONSTRAINT "user_training_assignments_ended_after_assignment" CHECK ((("ended_at" IS NULL) OR ("ended_at" >= "assigned_at")))
);


ALTER TABLE "public"."user_training_assignments" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_training_assignments" IS 'A course explicitly assigned to a member for one coaching-note / 60-day cycle.';



COMMENT ON COLUMN "public"."user_training_assignments"."context_label" IS 'Optional member-facing timing note, for example "Before the next session".';



CREATE OR REPLACE FUNCTION "public"."set_user_training_assignment"("p_user_id" "uuid", "p_coaching_note_id" bigint, "p_course_node_id" bigint, "p_assigned_by" "uuid", "p_context_label" "text" DEFAULT NULL::"text", "p_due_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "public"."user_training_assignments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_assignment public.user_training_assignments;
  saved_assignment public.user_training_assignments;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_coaching_note_id::text, 0)
  );

  select assignment.*
  into current_assignment
  from public.user_training_assignments as assignment
  where assignment.user_id = p_user_id
    and assignment.coaching_note_id = p_coaching_note_id
    and assignment.ended_at is null
  for update;

  if current_assignment.id is not null
     and current_assignment.course_node_id = p_course_node_id then
    update public.user_training_assignments
    set context_label = nullif(btrim(p_context_label), ''),
        due_at = p_due_at
    where id = current_assignment.id
    returning * into saved_assignment;

    insert into public.user_course_visibility (user_id, course_node_id)
    values (p_user_id, p_course_node_id)
    on conflict (user_id, course_node_id) do nothing;

    return saved_assignment;
  end if;

  update public.user_training_assignments
  set ended_at = now(),
      ended_by = p_assigned_by
  where user_id = p_user_id
    and coaching_note_id = p_coaching_note_id
    and ended_at is null;

  insert into public.user_training_assignments (
    user_id,
    course_node_id,
    coaching_note_id,
    assigned_by,
    context_label,
    due_at
  )
  values (
    p_user_id,
    p_course_node_id,
    p_coaching_note_id,
    p_assigned_by,
    nullif(btrim(p_context_label), ''),
    p_due_at
  )
  returning * into saved_assignment;

  return saved_assignment;
end;
$$;


ALTER FUNCTION "public"."set_user_training_assignment"("p_user_id" "uuid", "p_coaching_note_id" bigint, "p_course_node_id" bigint, "p_assigned_by" "uuid", "p_context_label" "text", "p_due_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."slugify"("_txt" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $_$
  select
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(coalesce(_txt,'')), '^[\s\-_\.]+|[\s\-_\.]+$', '', 'g'),
        '[^a-z0-9]+', '-', 'g'
      ),
      '-{2,}', '-', 'g'
    )
$_$;


ALTER FUNCTION "public"."slugify"("_txt" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_smart_doc"("_content_block_id" bigint, "_user_id" "uuid") RETURNS TABLE("fields_total" integer, "fields_completed" integer, "status" "text", "submitted_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $$
declare
  _rid bigint;
  _ft int;
  _fc int;
begin
  insert into public.smart_doc_responses(content_block_id, user_id)
  values (_content_block_id, _user_id)
  on conflict (content_block_id, user_id)
    do update set updated_at = now()
  returning id into _rid;

  select fields_total, fields_completed into _ft, _fc
  from public.get_smart_doc_progress(_content_block_id, _user_id);

  if _ft > 0 and _fc < _ft then
    raise exception 'Cannot submit: required fields incomplete (% of %)', _fc, _ft;
  end if;

  update public.smart_doc_responses
     set status = 'submitted',
         submitted_at = now(),
         updated_at = now()
   where id = _rid;

  return query select _ft, _fc, 'submitted'::text, now();
end
$$;


ALTER FUNCTION "public"."submit_smart_doc"("_content_block_id" bigint, "_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_business_audit_appointment"("_ghl_appointment_id" "text", "_ghl_calendar_id" "text", "_starts_at" timestamp with time zone, "_ends_at" timestamp with time zone, "_meeting_timezone" "text", "_ghl_status" "text", "_title" "text", "_student_id" "uuid", "_coach_id" "uuid", "_review_date" "date", "_is_cancelled" boolean DEFAULT false) RETURNS TABLE("meeting_id" bigint, "business_review_id" bigint, "meeting_created" boolean, "business_review_created" boolean, "skipped_cancelled" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  _normalized_appointment_id text := nullif(btrim(_ghl_appointment_id), '');
  _meeting_type_id bigint;
  _meeting_id bigint;
  _review_id bigint;
  _coaching_note_id bigint;
  _meeting_was_created boolean := false;
  _review_was_created boolean := false;
  _previous_claim_sub text := current_setting('request.jwt.claim.sub', true);
  _previous_claims text := current_setting('request.jwt.claims', true);
begin
  if _normalized_appointment_id is null then
    raise exception 'A GHL appointment id is required.';
  end if;

  -- Serializes duplicate cron invocations for the same external appointment.
  perform pg_advisory_xact_lock(hashtextextended(_normalized_appointment_id, 0));

  if _student_id is null or _coach_id is null then
    raise exception 'A student and coach are required.';
  end if;

  if not exists (
    select 1
    from public.user_coaches as assignment
    where assignment.user_id = _student_id
      and assignment.coach_id = _coach_id
      and assignment.is_active = true
      and assignment.relationship_type::text = 'primary'
  ) then
    raise exception 'The coach is not the student''s active primary coach.';
  end if;

  select existing.id
    into _meeting_id
  from public.meetings as existing
  where existing.ghl_appointment_id = _normalized_appointment_id
  limit 1;

  -- A cancelled appointment that was never synchronized should not create
  -- either a site meeting or an empty Business Audit.
  if coalesce(_is_cancelled, false) and _meeting_id is null then
    return query
      select null::bigint, null::bigint, false, false, true;
    return;
  end if;

  if _starts_at is null or _review_date is null then
    raise exception 'An appointment start and review date are required.';
  end if;

  if nullif(btrim(_meeting_timezone), '') is null then
    raise exception 'A meeting timezone is required.';
  end if;

  if _meeting_id is null then
    select meeting_type.id
      into _meeting_type_id
    from public.meeting_types as meeting_type
    where meeting_type.code = 'M2_MEETING'
      and meeting_type.is_active = true
    limit 1;

    if _meeting_type_id is null then
      raise exception 'The active M2_MEETING meeting type was not found.';
    end if;

    insert into public.meetings (
      meeting_type_id,
      date,
      created_by,
      title,
      ghl_appointment_id,
      ghl_calendar_id,
      starts_at,
      ends_at,
      meeting_timezone,
      ghl_status,
      ghl_synced_at
    )
    values (
      _meeting_type_id,
      _review_date,
      _coach_id,
      nullif(btrim(_title), ''),
      _normalized_appointment_id,
      nullif(btrim(_ghl_calendar_id), ''),
      _starts_at,
      _ends_at,
      btrim(_meeting_timezone),
      nullif(btrim(_ghl_status), ''),
      now()
    )
    returning id into _meeting_id;

    _meeting_was_created := true;
  else
    update public.meetings as existing
    set date = _review_date,
        created_by = _coach_id,
        title = coalesce(nullif(btrim(_title), ''), existing.title),
        ghl_calendar_id = nullif(btrim(_ghl_calendar_id), ''),
        starts_at = _starts_at,
        ends_at = _ends_at,
        meeting_timezone = btrim(_meeting_timezone),
        ghl_status = nullif(btrim(_ghl_status), ''),
        ghl_synced_at = now(),
        updated_at = now()
    where existing.id = _meeting_id;
  end if;

  if coalesce(_is_cancelled, false) then
    select review.id
      into _review_id
    from public.business_reviews as review
    where review.meeting_id = _meeting_id
    limit 1;

    return query
      select _meeting_id, _review_id, false, false, false;
    return;
  end if;

  insert into public.meeting_attendance_base (
    meeting_id,
    user_id,
    attended
  )
  values (
    _meeting_id,
    _student_id,
    false
  )
  on conflict do nothing;

  select review.id, review.coaching_note_id
    into _review_id, _coaching_note_id
  from public.business_reviews as review
  where review.meeting_id = _meeting_id
  limit 1;

  -- If a coach manually created a draft before the hourly job saw the
  -- appointment, connect that draft instead of producing a duplicate audit.
  if _review_id is null then
    select review.id, review.coaching_note_id
      into _review_id, _coaching_note_id
    from public.business_reviews as review
    where review.user_id = _student_id
      and review.review_date = _review_date
      and review.status::text = 'draft'
      and review.meeting_id is null
    order by review.created_at desc, review.id desc
    limit 1;

    if _review_id is not null then
      update public.business_reviews as review
      set meeting_id = _meeting_id,
          coach_id = _coach_id,
          updated_at = now()
      where review.id = _review_id;
    end if;
  end if;

  if _review_id is null then
    -- create_business_review already owns the template-selection and
    -- coaching-note invariants. Supply the matched primary coach as the
    -- authenticated actor while this service-role-only function calls it.
    perform set_config('request.jwt.claim.sub', _coach_id::text, true);
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', _coach_id::text, 'role', 'authenticated')::text,
      true
    );

    select created.id, created.coaching_note_id
      into _review_id, _coaching_note_id
    from public.create_business_review(
      _user_id => _student_id,
      _review_date => _review_date
    ) as created
    limit 1;

    perform set_config('request.jwt.claim.sub', coalesce(_previous_claim_sub, ''), true);
    perform set_config('request.jwt.claims', coalesce(_previous_claims, '{}'), true);

    if _review_id is null then
      raise exception 'The Business Audit could not be created.';
    end if;

    update public.business_reviews as review
    set meeting_id = _meeting_id,
        updated_at = now()
    where review.id = _review_id;

    _review_was_created := true;
  else
    update public.business_reviews as review
    set review_date = case
          when review.status::text = 'draft' then _review_date
          else review.review_date
        end,
        coach_id = case
          when review.status::text = 'draft' then _coach_id
          else review.coach_id
        end,
        updated_at = case
          when review.status::text = 'draft' then now()
          else review.updated_at
        end
    where review.id = _review_id;
  end if;

  update public.coaching_notes_base as note
  set m2_meeting_id = _meeting_id,
      coach_id = coalesce(note.coach_id, _coach_id),
      updated_at = now()
  where note.id = _coaching_note_id
    and note.deleted_at is null;

  return query
    select
      _meeting_id,
      _review_id,
      _meeting_was_created,
      _review_was_created,
      false;
end;
$$;


ALTER FUNCTION "public"."sync_business_audit_appointment"("_ghl_appointment_id" "text", "_ghl_calendar_id" "text", "_starts_at" timestamp with time zone, "_ends_at" timestamp with time zone, "_meeting_timezone" "text", "_ghl_status" "text", "_title" "text", "_student_id" "uuid", "_coach_id" "uuid", "_review_date" "date", "_is_cancelled" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_business_audit_appointment"("_ghl_appointment_id" "text", "_ghl_calendar_id" "text", "_starts_at" timestamp with time zone, "_ends_at" timestamp with time zone, "_meeting_timezone" "text", "_ghl_status" "text", "_title" "text", "_student_id" "uuid", "_coach_id" "uuid", "_review_date" "date", "_is_cancelled" boolean) IS 'Idempotently synchronizes one GHL Business Audit appointment, attendance row, coaching note, and Business Audit.';



CREATE OR REPLACE FUNCTION "public"."sync_implementation_appointment"("_ghl_appointment_id" "text", "_ghl_calendar_id" "text", "_starts_at" timestamp with time zone, "_ends_at" timestamp with time zone, "_meeting_timezone" "text", "_ghl_status" "text", "_title" "text", "_student_id" "uuid", "_coach_id" "uuid", "_meeting_date" "date", "_is_cancelled" boolean DEFAULT false) RETURNS TABLE("meeting_id" bigint, "meeting_created" boolean, "skipped_cancelled" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  _normalized_appointment_id text := nullif(btrim(_ghl_appointment_id), '');
  _meeting_type_id bigint;
  _meeting_id bigint;
  _existing_meeting_type_code text;
  _manual_candidate_id bigint;
  _manual_candidate_count integer := 0;
  _meeting_was_created boolean := false;
begin
  if _normalized_appointment_id is null then
    raise exception 'A GHL appointment id is required.';
  end if;

  -- Serializes overlapping cron invocations for the same GHL appointment.
  perform pg_advisory_xact_lock(hashtextextended(_normalized_appointment_id, 0));

  if _student_id is null or _coach_id is null then
    raise exception 'A student and coach are required.';
  end if;

  if not exists (
    select 1
    from public.user_coaches as assignment
    where assignment.user_id = _student_id
      and assignment.coach_id = _coach_id
      and assignment.course_id = 2
      and assignment.is_active = true
      and assignment.relationship_type::text = 'implementation'
  ) then
    raise exception 'The coach is not the student''s active implementation coach.';
  end if;

  select existing.id, meeting_type.code
    into _meeting_id, _existing_meeting_type_code
  from public.meetings as existing
  join public.meeting_types as meeting_type
    on meeting_type.id = existing.meeting_type_id
  where existing.ghl_appointment_id = _normalized_appointment_id
  limit 1;

  -- A cancellation that was never synchronized should not create a site meeting.
  if coalesce(_is_cancelled, false) and _meeting_id is null then
    return query
      select null::bigint, false, true;
    return;
  end if;

  if _meeting_id is not null and _existing_meeting_type_code <> 'IMPLEMENTATION_MEETING' then
    raise exception
      'The GHL appointment is already connected to a % meeting.',
      _existing_meeting_type_code;
  end if;

  if _starts_at is null or _meeting_date is null then
    raise exception 'An appointment start and meeting date are required.';
  end if;

  if nullif(btrim(_meeting_timezone), '') is null then
    raise exception 'A meeting timezone is required.';
  end if;

  select meeting_type.id
    into _meeting_type_id
  from public.meeting_types as meeting_type
  where meeting_type.code = 'IMPLEMENTATION_MEETING'
    and meeting_type.is_active = true
  limit 1;

  if _meeting_type_id is null then
    raise exception 'The active IMPLEMENTATION_MEETING meeting type was not found.';
  end if;

  -- If the coach created the site slot before the hourly job saw the GHL
  -- booking, adopt the one unambiguous manual meeting instead of creating a
  -- duplicate. Shared/multi-attendee meetings are deliberately not adopted.
  if _meeting_id is null then
    perform pg_advisory_xact_lock(
      hashtextextended(_student_id::text || ':' || _meeting_date::text || ':implementation', 0)
    );

    select count(*)::integer, min(candidate.id)
      into _manual_candidate_count, _manual_candidate_id
    from public.meetings as candidate
    where candidate.meeting_type_id = _meeting_type_id
      and candidate.date = _meeting_date
      and candidate.ghl_appointment_id is null
      and candidate.starts_at is null
      and exists (
        select 1
        from public.meeting_attendance_base as attendance
        where attendance.meeting_id = candidate.id
          and attendance.user_id = _student_id
      )
      and not exists (
        select 1
        from public.meeting_attendance_base as other_attendance
        where other_attendance.meeting_id = candidate.id
          and other_attendance.user_id <> _student_id
      );

    if _manual_candidate_count = 1 then
      _meeting_id := _manual_candidate_id;
    end if;
  end if;

  if _meeting_id is null then
    insert into public.meetings (
      meeting_type_id,
      date,
      created_by,
      title,
      ghl_appointment_id,
      ghl_calendar_id,
      starts_at,
      ends_at,
      meeting_timezone,
      ghl_status,
      ghl_synced_at
    )
    values (
      _meeting_type_id,
      _meeting_date,
      _coach_id,
      nullif(btrim(_title), ''),
      _normalized_appointment_id,
      nullif(btrim(_ghl_calendar_id), ''),
      _starts_at,
      _ends_at,
      btrim(_meeting_timezone),
      nullif(btrim(_ghl_status), ''),
      now()
    )
    returning id into _meeting_id;

    _meeting_was_created := true;
  else
    update public.meetings as existing
    set date = _meeting_date,
        created_by = _coach_id,
        title = coalesce(nullif(btrim(_title), ''), existing.title),
        ghl_appointment_id = _normalized_appointment_id,
        ghl_calendar_id = nullif(btrim(_ghl_calendar_id), ''),
        starts_at = _starts_at,
        ends_at = _ends_at,
        meeting_timezone = btrim(_meeting_timezone),
        ghl_status = nullif(btrim(_ghl_status), ''),
        ghl_synced_at = now(),
        updated_at = now()
    where existing.id = _meeting_id;
  end if;

  if coalesce(_is_cancelled, false) then
    -- get_user_meetings is attendance-backed. Removing this association keeps
    -- the cancelled record for history while removing it from the student's
    -- Implementation slots. Reconfirmation inserts the association again.
    delete from public.meeting_attendance_base as attendance
    where attendance.meeting_id = _meeting_id
      and attendance.user_id = _student_id;

    return query
      select _meeting_id, false, false;
    return;
  end if;

  insert into public.meeting_attendance_base (
    meeting_id,
    user_id,
    attended
  )
  values (
    _meeting_id,
    _student_id,
    false
  )
  on conflict do nothing;

  return query
    select _meeting_id, _meeting_was_created, false;
end;
$$;


ALTER FUNCTION "public"."sync_implementation_appointment"("_ghl_appointment_id" "text", "_ghl_calendar_id" "text", "_starts_at" timestamp with time zone, "_ends_at" timestamp with time zone, "_meeting_timezone" "text", "_ghl_status" "text", "_title" "text", "_student_id" "uuid", "_coach_id" "uuid", "_meeting_date" "date", "_is_cancelled" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_implementation_appointment"("_ghl_appointment_id" "text", "_ghl_calendar_id" "text", "_starts_at" timestamp with time zone, "_ends_at" timestamp with time zone, "_meeting_timezone" "text", "_ghl_status" "text", "_title" "text", "_student_id" "uuid", "_coach_id" "uuid", "_meeting_date" "date", "_is_cancelled" boolean) IS 'Idempotently synchronizes one GHL Implementation appointment and its student attendance association.';



CREATE OR REPLACE FUNCTION "public"."sync_implementation_appointment_v2"("_ghl_appointment_id" "text", "_ghl_calendar_id" "text", "_starts_at" timestamp with time zone, "_ends_at" timestamp with time zone, "_meeting_timezone" "text", "_ghl_status" "text", "_title" "text", "_student_id" "uuid", "_coach_id" "uuid", "_meeting_date" "date", "_is_cancelled" boolean DEFAULT false) RETURNS TABLE("meeting_id" bigint, "meeting_created" boolean, "skipped_cancelled" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  _normalized_appointment_id text := nullif(btrim(_ghl_appointment_id), '');
  _meeting_type_id bigint;
  _manual_candidate_id bigint;
  _manual_candidate_count integer := 0;
begin
  if _normalized_appointment_id is null then
    raise exception 'A GHL appointment id is required.';
  end if;

  if _student_id is null or _coach_id is null then
    raise exception 'A student and coach are required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(_normalized_appointment_id, 0));

  if not coalesce(_is_cancelled, false)
     and _meeting_date is not null
     and not exists (
       select 1
       from public.meetings as existing
       where existing.ghl_appointment_id = _normalized_appointment_id
     ) then
    perform pg_advisory_xact_lock(
      hashtextextended(_student_id::text || ':' || _meeting_date::text || ':implementation', 0)
    );

    select meeting_type.id
      into _meeting_type_id
    from public.meeting_types as meeting_type
    where meeting_type.code = 'IMPLEMENTATION_MEETING'
      and meeting_type.is_active = true
    limit 1;

    if _meeting_type_id is null then
      raise exception 'The active IMPLEMENTATION_MEETING meeting type was not found.';
    end if;

    select count(*)::integer, min(candidate.id)
      into _manual_candidate_count, _manual_candidate_id
    from public.meetings as candidate
    where candidate.meeting_type_id = _meeting_type_id
      and candidate.date = _meeting_date
      and candidate.ghl_appointment_id is null
      and candidate.starts_at is null
      and exists (
        select 1
        from public.meeting_attendance_base as attendance
        where attendance.meeting_id = candidate.id
          and attendance.user_id = _student_id
      )
      and not exists (
        select 1
        from public.meeting_attendance_base as other_attendance
        where other_attendance.meeting_id = candidate.id
          and other_attendance.user_id <> _student_id
      );

    if _manual_candidate_count = 1 then
      update public.meetings as candidate
      set ghl_appointment_id = _normalized_appointment_id,
          updated_at = now()
      where candidate.id = _manual_candidate_id
        and candidate.ghl_appointment_id is null;
    end if;
  end if;

  return query
  select
    synced.meeting_id,
    synced.meeting_created,
    synced.skipped_cancelled
  from public.sync_implementation_appointment(
    _ghl_appointment_id => _normalized_appointment_id,
    _ghl_calendar_id => _ghl_calendar_id,
    _starts_at => _starts_at,
    _ends_at => _ends_at,
    _meeting_timezone => _meeting_timezone,
    _ghl_status => _ghl_status,
    _title => _title,
    _student_id => _student_id,
    _coach_id => _coach_id,
    _meeting_date => _meeting_date,
    _is_cancelled => _is_cancelled
  ) as synced;
end;
$$;


ALTER FUNCTION "public"."sync_implementation_appointment_v2"("_ghl_appointment_id" "text", "_ghl_calendar_id" "text", "_starts_at" timestamp with time zone, "_ends_at" timestamp with time zone, "_meeting_timezone" "text", "_ghl_status" "text", "_title" "text", "_student_id" "uuid", "_coach_id" "uuid", "_meeting_date" "date", "_is_cancelled" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_implementation_appointment_v2"("_ghl_appointment_id" "text", "_ghl_calendar_id" "text", "_starts_at" timestamp with time zone, "_ends_at" timestamp with time zone, "_meeting_timezone" "text", "_ghl_status" "text", "_title" "text", "_student_id" "uuid", "_coach_id" "uuid", "_meeting_date" "date", "_is_cancelled" boolean) IS 'Synchronizes one GHL Implementation appointment and safely adopts an unambiguous same-day manual meeting.';



CREATE OR REPLACE FUNCTION "public"."sync_priority_system_from_action_step_completion"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare
  _actor_id uuid := auth.uid();
begin
  update public.business_review_system_ratings rating
  set
    status = case
      when rating.status = 'consistent'::public.system_scorecard_status
        or priority.starting_status in (
          'complete'::public.system_scorecard_status,
          'consistent'::public.system_scorecard_status
        )
      then 'consistent'::public.system_scorecard_status
      else 'complete'::public.system_scorecard_status
    end,
    updated_by = coalesce(_actor_id, rating.updated_by),
    updated_at = now()
  from public.business_review_system_priorities priority
  where priority.action_step_id = new.id
    and rating.business_review_id = priority.business_review_id
    and rating.system_id = priority.system_id;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_priority_system_from_action_step_completion"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_priority_system_from_action_step_completion"() IS 'Promotes the linked system to complete, or consistent when it was already complete before the implementation cycle. Review timestamps are intentionally unchanged.';



CREATE OR REPLACE FUNCTION "public"."sync_scorecard_priority_action_step_library_item"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.coaching_note_action_steps as action_step
  set
    library_item_id = system.library_item_id,
    updated_at = now()
  from public.system_scorecard_systems as system
  where system.id = new.system_id
    and action_step.id = new.action_step_id
    and action_step.library_item_id is distinct from system.library_item_id;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_scorecard_priority_action_step_library_item"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_user_data"("_source" "uuid", "_dest" "uuid", "_options" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_started_at timestamptz := now();
  v_dry_run boolean := coalesce((_options->>'dry_run')::boolean, true);
  v_reassign_authorship boolean := coalesce((_options->>'reassign_authorship')::boolean, false);
  v_sdoc_strategy text := coalesce((_options->>'smart_doc_conflict'), 'keep_latest_submitted');
  v_progress_json_strategy text := coalesce((_options->>'progress_json_merge'), 'prefer_dest');
  v_kpi_merge_strategy text := coalesce((_options->>'kpi_merge'), 'prefer_source');

  v_log_id bigint;
  v_result jsonb := '{}'::jsonb;
  rec record;
  v_new_note_id bigint;
  v_new_response_id bigint;
  v_tmp_count bigint;

  c jsonb := '{
    "coaching_notes": {"moved":0},
    "action_steps": {"linked":0},
    "comments": {"linked":0},
    "wins": {"moved":0},
    "kpi_records": {"moved":0,"merged":0},
    "kpi_values": {"upserted":0},
    "attendance": {"moved":0,"merged":0},
    "achievements": {"moved":0,"merged":0,"skipped_dupe":0},
    "roles": {"added":0,"removed_source":0},
    "course_visibility": {"added":0,"removed_source":0},
    "user_coaches": {"moved":0,"merged":0},
    "partnership_users": {"moved":0,"skipped_dupe":0},
    "progress": {"moved":0,"merged":0},
    "smart_docs": {"reassigned":0,"drafted_older":0},
    "resource_access": {"moved":0},
    "search_analytics": {"moved":0},
    "attention_log": {"moved":0},
    "authorship": {"reassigned":0}
  }'::jsonb;
begin
  -- Guardrails
  if _source is null or _dest is null or _source = _dest then
    raise exception 'Invalid source/dest';
  end if;

  perform 1 from public.profiles where id = _source;
  if not found then raise exception 'Source profile % not found', _source; end if;

  perform 1 from public.profiles where id = _dest;
  if not found then raise exception 'Destination profile % not found', _dest; end if;

  -- Admin guard: honor skip_admin_check and allow trusted/no-JWT contexts.
  begin
    if coalesce((_options->>'skip_admin_check')::boolean, false)
       or current_user in ('postgres','service_role')
       or coalesce(nullif(current_setting('request.jwt.claims', true), ''), '') = '' then
      null; -- allowed
    else
      if not public.is_admin() then
        raise exception 'Only admins can run transfer_user_data';
      end if;
    end if;
  exception
    when undefined_function or undefined_object then
      null;
  end;

  insert into public.user_merge_log (source_user_id, dest_user_id, started_at, dry_run, options)
  values (_source, _dest, v_started_at, v_dry_run, _options)
  returning id into v_log_id;

  ----------------------------------------------------------------------
  -- 1) Coaching notes + action steps + comments (COPY)
  ----------------------------------------------------------------------
  v_tmp_count := (select count(*) from public.coaching_notes_base where user_id = _source);
  c := public._jsonb_inc(c, ARRAY['coaching_notes','moved'], v_tmp_count);

  v_tmp_count := (
    select count(*)
    from public.coaching_note_action_steps s
    join public.coaching_notes_base n on s.coaching_note_id = n.id
    where n.user_id = _source
  );
  c := public._jsonb_inc(c, ARRAY['action_steps','linked'], v_tmp_count);

  v_tmp_count := (
    select count(*)
    from public.coaching_note_comments s
    join public.coaching_notes_base n on s.coaching_note_id = n.id
    where n.user_id = _source
  );
  c := public._jsonb_inc(c, ARRAY['comments','linked'], v_tmp_count);

  if not v_dry_run then
    for rec in
      select id, coach_id, created_at, updated_at, m2_meeting_id
      from public.coaching_notes_base
      where user_id = _source
    loop
      insert into public.coaching_notes_base (user_id, coach_id, created_at, updated_at, m2_meeting_id)
      values (_dest, rec.coach_id, rec.created_at, rec.updated_at, rec.m2_meeting_id)
      returning id into v_new_note_id;

      insert into public.coaching_note_action_steps (
        coaching_note_id, label, library_item_id, status, created_at, updated_at
      )
      select
        v_new_note_id,
        s.label,
        s.library_item_id,
        s.status,
        s.created_at,
        s.updated_at
      from public.coaching_note_action_steps s
      where s.coaching_note_id = rec.id;

      insert into public.coaching_note_comments (
        coaching_note_id, author_id, body, created_at
      )
      select
        v_new_note_id,
        cmt.author_id,
        cmt.body,
        cmt.created_at
      from public.coaching_note_comments cmt
      where cmt.coaching_note_id = rec.id;
    end loop;
  end if;

  ----------------------------------------------------------------------
  -- 2) Wins (COPY)
  ----------------------------------------------------------------------
  v_tmp_count := (select count(*) from public.wins where user_id = _source);
  c := public._jsonb_inc(c, ARRAY['wins','moved'], v_tmp_count);

  if not v_dry_run then
    insert into public.wins (user_id, added_by, body, created_at)
    select _dest, added_by, body, created_at
    from public.wins
    where user_id = _source;
  end if;

  ----------------------------------------------------------------------
  -- 3) KPI: copy semantics
  --   kpi_merge = 'skip'/'none' -> don't touch tables, only report.
  --   otherwise -> wipe dest KPI and COPY source KPI over (source untouched).
  ----------------------------------------------------------------------
  if v_kpi_merge_strategy in ('skip', 'none') then
    v_tmp_count := (select count(*) from public.monthly_kpi_records_base where user_id = _source);
    c := public._jsonb_inc(c, ARRAY['kpi_records','moved'], v_tmp_count);

    v_tmp_count := (select count(*) from public.monthly_kpi_records_base where user_id = _dest);
    c := public._jsonb_inc(c, ARRAY['kpi_records','merged'], v_tmp_count);

    v_tmp_count := (
      select count(*)
      from public.monthly_kpi_values v
      join public.monthly_kpi_records_base r on v.monthly_kpi_record_id = r.id
      where r.user_id = _source
    );
    c := public._jsonb_inc(c, ARRAY['kpi_values','upserted'], v_tmp_count);

  else
    if v_dry_run then
      v_tmp_count := (select count(*) from public.monthly_kpi_records_base where user_id = _dest);
      c := public._jsonb_inc(c, ARRAY['kpi_records','merged'], v_tmp_count);

      v_tmp_count := (select count(*) from public.monthly_kpi_records_base where user_id = _source);
      c := public._jsonb_inc(c, ARRAY['kpi_records','moved'], v_tmp_count);

      v_tmp_count := (
        select count(*)
        from public.monthly_kpi_values v
        join public.monthly_kpi_records_base r on v.monthly_kpi_record_id = r.id
        where r.user_id = _source
      );
      c := public._jsonb_inc(c, ARRAY['kpi_values','upserted'], v_tmp_count);
    else
      lock table public.monthly_kpi_records_base, public.monthly_kpi_values
        in share row exclusive mode;

      delete from public.monthly_kpi_values v
       using public.monthly_kpi_records_base r
       where v.monthly_kpi_record_id = r.id
         and r.user_id = _dest;

      delete from public.monthly_kpi_records_base
       where user_id = _dest;

      insert into public.monthly_kpi_records_base (
        user_id, period_start_date, created_at, last_updated_at, last_updated_by
      )
      select
        _dest,
        period_start_date,
        created_at,
        last_updated_at,
        last_updated_by
      from public.monthly_kpi_records_base
      where user_id = _source;

      insert into public.monthly_kpi_values (monthly_kpi_record_id, metric_type_id, value)
      select
        d.id,
        v.metric_type_id,
        v.value
      from public.monthly_kpi_values v
      join public.monthly_kpi_records_base s
        on v.monthly_kpi_record_id = s.id
       and s.user_id = _source
      join public.monthly_kpi_records_base d
        on d.user_id = _dest
       and d.period_start_date = s.period_start_date;

      v_tmp_count := (select count(*) from public.monthly_kpi_records_base where user_id = _dest);
      c := public._jsonb_inc(c, ARRAY['kpi_records','moved'], v_tmp_count);

      v_tmp_count := (
        select count(*)
        from public.monthly_kpi_values v
        join public.monthly_kpi_records_base r on v.monthly_kpi_record_id = r.id
        where r.user_id = _dest
      );
      c := public._jsonb_inc(c, ARRAY['kpi_values','upserted'], v_tmp_count);
    end if;
  end if;

  ----------------------------------------------------------------------
  -- 4) Attendance (COPY)
  ----------------------------------------------------------------------
  v_tmp_count := (select count(*) from public.meeting_attendance_base where user_id = _source);
  c := public._jsonb_inc(c, ARRAY['attendance','moved'], v_tmp_count);

  v_tmp_count := (
    select count(*)
    from public.meeting_attendance_base s
    join public.meeting_attendance_base d
      on d.meeting_id = s.meeting_id
     and d.user_id = _dest
    where s.user_id = _source
  );
  c := public._jsonb_inc(c, ARRAY['attendance','merged'], v_tmp_count);

  if not v_dry_run then
    insert into public.meeting_attendance_base (meeting_id, user_id, attended, created_at, updated_at)
    select meeting_id, _dest, attended, created_at, updated_at
    from public.meeting_attendance_base
    where user_id = _source
    on conflict (meeting_id, user_id)
    do update set
      attended   = (excluded.attended or public.meeting_attendance_base.attended),
      created_at = least(public.meeting_attendance_base.created_at, excluded.created_at),
      updated_at = greatest(public.meeting_attendance_base.updated_at, excluded.updated_at);
  end if;

  ----------------------------------------------------------------------
  -- 5) Achievements (COPY)
  ----------------------------------------------------------------------
  v_tmp_count := (select count(*) from public.user_achievements where user_id = _source);
  c := public._jsonb_inc(c, ARRAY['achievements','moved'], v_tmp_count);

  v_tmp_count := (
    select count(*)
    from public.user_achievements s
    where s.user_id = _source
      and exists (
        select 1
        from public.user_achievements d
        where d.user_id = _dest
          and d.achievement_id = s.achievement_id
      )
  );
  c := public._jsonb_inc(c, ARRAY['achievements','merged'], v_tmp_count);

  if not v_dry_run then
    with overlap as (
      select s.id as s_id, d.id as d_id, s.achieved_at as s_at, d.achieved_at as d_at,
             s.awarded_via as s_via, d.awarded_via as d_via
      from public.user_achievements s
      join public.user_achievements d
        on d.user_id = _dest
       and s.user_id = _source
       and d.achievement_id = s.achievement_id
    )
    update public.user_achievements d
       set achieved_at = least(d.achieved_at, o.s_at),
           awarded_via = case
                           when d.awarded_via = o.s_via then d.awarded_via
                           else 'reconcile'
                         end
      from overlap o
     where d.id = o.d_id;

    insert into public.user_achievements (user_id, achievement_id, achieved_at, awarded_via)
    select _dest, s.achievement_id, s.achieved_at, s.awarded_via
    from public.user_achievements s
    where s.user_id = _source
      and not exists (
        select 1
        from public.user_achievements d
        where d.user_id = _dest
          and d.achievement_id = s.achievement_id
      );
  end if;

  ----------------------------------------------------------------------
  -- 6) Roles (COPY)
  ----------------------------------------------------------------------
  v_tmp_count := (
    select count(*)
    from public.user_roles s
    where s.user_id = _source
      and not exists (
        select 1
        from public.user_roles d
        where d.user_id = _dest
          and d.role_id = s.role_id
      )
  );
  c := public._jsonb_inc(c, ARRAY['roles','added'], v_tmp_count);

  if not v_dry_run then
    insert into public.user_roles (user_id, role_id)
    select _dest, role_id
    from public.user_roles s
    where s.user_id = _source
      and not exists (
        select 1
        from public.user_roles d
        where d.user_id = _dest
          and d.role_id = s.role_id
      );
  end if;

  ----------------------------------------------------------------------
  -- 7) Course visibility (COPY)
  ----------------------------------------------------------------------
  v_tmp_count := (
    select count(*)
    from public.user_course_visibility s
    where s.user_id = _source
      and not exists (
        select 1
        from public.user_course_visibility d
        where d.user_id = _dest
          and d.course_node_id = s.course_node_id
      )
  );
  c := public._jsonb_inc(c, ARRAY['course_visibility','added'], v_tmp_count);

  if not v_dry_run then
    insert into public.user_course_visibility (user_id, course_node_id)
    select _dest, course_node_id
    from public.user_course_visibility s
    where s.user_id = _source
      and not exists (
        select 1
        from public.user_course_visibility d
        where d.user_id = _dest
          and d.course_node_id = s.course_node_id
      );
  end if;

  ----------------------------------------------------------------------
  -- 8) User-coaches (COPY + merge on dest)
  ----------------------------------------------------------------------
  if v_dry_run then
    v_tmp_count := (select count(*) from public.user_coaches where user_id = _source);
    c := public._jsonb_inc(c, ARRAY['user_coaches','moved'], v_tmp_count);
  else
    for rec in
      select s.id as s_id, s.user_id, s.coach_id, s.course_id, s.relationship_type,
             s.is_active as s_active, s.assigned_at as s_assigned, s.ended_at as s_ended
      from public.user_coaches s
      where s.user_id = _source
    loop
      if exists (
        select 1
        from public.user_coaches d
        where d.user_id = _dest
          and d.coach_id = rec.coach_id
          and ( (d.course_id is null and rec.course_id is null)
                or d.course_id = rec.course_id )
          and d.relationship_type = rec.relationship_type
      ) then
        update public.user_coaches d
           set is_active  = (d.is_active or rec.s_active),
               assigned_at = least(d.assigned_at, rec.s_assigned),
               ended_at    = greatest(
                               coalesce(d.ended_at, rec.s_ended),
                               coalesce(rec.s_ended, d.ended_at)
                             )
         where d.user_id = _dest
           and d.coach_id = rec.coach_id
           and ( (d.course_id is null and rec.course_id is null)
                 or d.course_id = rec.course_id )
           and d.relationship_type = rec.relationship_type;

        c := public._jsonb_inc(c, ARRAY['user_coaches','merged'], 1);
      else
        insert into public.user_coaches (
          user_id, coach_id, is_active, assigned_at, ended_at, course_id, relationship_type
        )
        values (
          _dest,
          rec.coach_id,
          rec.s_active,
          rec.s_assigned,
          rec.s_ended,
          rec.course_id,
          rec.relationship_type
        );

        c := public._jsonb_inc(c, ARRAY['user_coaches','moved'], 1);
      end if;
    end loop;
  end if;

  ----------------------------------------------------------------------
  -- 9) Partnerships (COPY)
  ----------------------------------------------------------------------
  v_tmp_count := (select count(*) from public.partnership_users where user_id = _source);
  c := public._jsonb_inc(c, ARRAY['partnership_users','moved'], v_tmp_count);

  if not v_dry_run then
    insert into public.partnership_users (partnership_id, user_id)
    select partnership_id, _dest
    from public.partnership_users
    where user_id = _source
    on conflict (partnership_id, user_id) do nothing;
  end if;

  ----------------------------------------------------------------------
  -- 10) User node progress (COPY + merge on dest)
  ----------------------------------------------------------------------
  if v_dry_run then
    v_tmp_count := (select count(*) from public.user_node_progress where user_id = _source);
    c := public._jsonb_inc(c, ARRAY['progress','moved'], v_tmp_count);
  else
    for rec in
      select
        s.node_id,
        s.status as s_status,
        s.first_started_at as s_start,
        s.completed_at as s_complete,
        s.progress_json as s_json,
        d.status as d_status,
        d.first_started_at as d_start,
        d.completed_at as d_complete,
        d.progress_json as d_json
      from public.user_node_progress s
      left join public.user_node_progress d
        on d.user_id = _dest
       and d.node_id = s.node_id
      where s.user_id = _source
    loop
      if rec.d_status is not null then
        update public.user_node_progress up
           set status = case
                          when public._status_rank(rec.d_status) >= public._status_rank(rec.s_status)
                            then rec.d_status
                          else rec.s_status
                        end,
               first_started_at = least(
                                    coalesce(rec.d_start, rec.s_start),
                                    coalesce(rec.s_start, rec.d_start)
                                  ),
               completed_at     = greatest(
                                    coalesce(rec.d_complete, rec.s_complete),
                                    coalesce(rec.s_complete, rec.d_complete)
                                  ),
               progress_json    = case v_progress_json_strategy
                                   when 'prefer_source' then rec.s_json
                                   when 'deep_merge' then
                                     coalesce(rec.d_json, '{}'::jsonb)
                                     || coalesce(rec.s_json, '{}'::jsonb)
                                   else rec.d_json
                                 end
         where up.user_id = _dest
           and up.node_id = rec.node_id;

        c := public._jsonb_inc(c, ARRAY['progress','merged'], 1);
      else
        insert into public.user_node_progress (
          user_id, node_id, status, first_started_at, completed_at, progress_json
        )
        values (
          _dest,
          rec.node_id,
          rec.s_status,
          rec.s_start,
          rec.s_complete,
          rec.s_json
        );

        c := public._jsonb_inc(c, ARRAY['progress','moved'], 1);
      end if;
    end loop;
  end if;

  ----------------------------------------------------------------------
  -- 11) Smart doc responses (+ values) (COPY)
  ----------------------------------------------------------------------
  v_tmp_count := (select count(*) from public.smart_doc_responses where user_id = _source);
  c := public._jsonb_inc(c, ARRAY['smart_docs','reassigned'], v_tmp_count);

  if not v_dry_run then
    for rec in
      select id, content_block_id, status, started_at, submitted_at, created_by, updated_by, updated_at
      from public.smart_doc_responses
      where user_id = _source
    loop
      insert into public.smart_doc_responses (
        content_block_id,
        user_id,
        status,
        started_at,
        submitted_at,
        created_by,
        updated_by,
        updated_at
      )
      values (
        rec.content_block_id,
        _dest,
        rec.status,
        rec.started_at,
        rec.submitted_at,
        rec.created_by,
        rec.updated_by,
        rec.updated_at
      )
      returning id into v_new_response_id;

      insert into public.smart_doc_response_values (
        response_id,
        prompt_id,
        value_json,
        created_by,
        updated_by,
        updated_at
      )
      select
        v_new_response_id,
        v.prompt_id,
        v.value_json,
        v.created_by,
        v.updated_by,
        v.updated_at
      from public.smart_doc_response_values v
      where v.response_id = rec.id;
    end loop;

    with ranked as (
      select
        r.content_block_id,
        r.id,
        r.status,
        r.submitted_at,
        r.updated_at,
        row_number() over (
          partition by r.content_block_id
          order by (r.submitted_at is not null) desc,
                   r.submitted_at desc nulls last,
                   r.updated_at desc
        ) as rn
      from public.smart_doc_responses r
      where r.user_id = _dest
    ),
    pairs as (
      select
        r1.content_block_id,
        r1.id as keep_id,
        r2.id as lose_id,
        r1.status as keep_status,
        r2.status as lose_status
      from ranked r1
      join ranked r2
        on r2.content_block_id = r1.content_block_id
       and r2.rn > 1
      where r1.rn = 1
    )
    update public.smart_doc_responses s
       set status = 'draft'
      from pairs p
     where s.id = p.lose_id
       and v_sdoc_strategy = 'keep_latest_submitted'
       and p.keep_status = 'submitted'
       and p.lose_status = 'submitted';

    v_tmp_count := (
      select count(*)
      from public.smart_doc_responses r
      where r.user_id = _dest
        and r.status = 'draft'
    );
    c := public._jsonb_inc(c, ARRAY['smart_docs','drafted_older'], v_tmp_count);
  end if;

  ----------------------------------------------------------------------
  -- 12) Analytics + attention logs (COPY)
  ----------------------------------------------------------------------
  v_tmp_count := (select count(*) from public.resource_access where user_id = _source);
  c := public._jsonb_inc(c, ARRAY['resource_access','moved'], v_tmp_count);

  v_tmp_count := (select count(*) from public.search_analytics where user_id = _source);
  c := public._jsonb_inc(c, ARRAY['search_analytics','moved'], v_tmp_count);

  v_tmp_count := (select count(*) from public.user_attention_status_log where user_id = _source);
  c := public._jsonb_inc(c, ARRAY['attention_log','moved'], v_tmp_count);

  if not v_dry_run then
    insert into public.resource_access (resource_id, user_id, accessed_at, session_id)
    select resource_id, _dest, accessed_at, session_id
    from public.resource_access
    where user_id = _source;

    insert into public.search_analytics (query, results_count, user_id, searched_at, session_id)
    select query, results_count, _dest, searched_at, session_id
    from public.search_analytics
    where user_id = _source;

    insert into public.user_attention_status_log (
      user_id,
      manual_status,
      reason,
      prev_manual_status,
      prev_reason,
      changed_by,
      changed_at,
      change_source
    )
    select
      _dest,
      manual_status,
      reason,
      prev_manual_status,
      prev_reason,
      changed_by,
      changed_at,
      change_source
    from public.user_attention_status_log
    where user_id = _source;
  end if;

  ----------------------------------------------------------------------
  -- 13) Optional authorship reassignment (still MOVE semantics, opt-in)
  ----------------------------------------------------------------------
  if not v_dry_run and v_reassign_authorship then
    update public.content_nodes set owner_id  = _dest where owner_id  = _source;
    update public.content_nodes set created_by = _dest where created_by = _source;
    update public.content_nodes set updated_by = _dest where updated_by = _source;
    update public.resources     set created_by = _dest where created_by = _source;
    update public.smart_docs    set created_by = _dest where created_by = _source;
    update public.tags          set created_by = _dest where created_by = _source;

    c := public._jsonb_inc(c, ARRAY['authorship','reassigned'], 1);
  end if;

  ----------------------------------------------------------------------
  -- Finalize + log
  ----------------------------------------------------------------------
  v_result := jsonb_build_object(
    'source', _source,
    'dest', _dest,
    'dry_run', v_dry_run,
    'counts', c
  );

  update public.user_merge_log
     set finished_at = now(),
         result_json = v_result
   where id = v_log_id;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."transfer_user_data"("_source" "uuid", "_dest" "uuid", "_options" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_user_data_admin"("_source" "uuid", "_dest" "uuid", "_options" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  -- Force skip_admin_check so calls from the admin route (service role) are allowed.
  select public.transfer_user_data(
    _source,
    _dest,
    coalesce(_options, '{}'::jsonb) || jsonb_build_object('skip_admin_check', true)
  );
$$;


ALTER FUNCTION "public"."transfer_user_data_admin"("_source" "uuid", "_dest" "uuid", "_options" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_touch_user_node_progress"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end
$$;


ALTER FUNCTION "public"."trg_touch_user_node_progress"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."try_delete_user_db"("p_user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  -- delete profile explicitly (safe even if already gone)
  delete from public.profiles where id = p_user_id;

  -- delete auth user in DB (this is what you proved works)
  delete from auth.users where id = p_user_id;

  return null; -- success
exception when others then
  return sqlstate || ' | ' || sqlerrm;
end;
$$;


ALTER FUNCTION "public"."try_delete_user_db"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_win"("_win_id" bigint, "_body" "text") RETURNS "public"."wins"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_row public.wins;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if _body is null or btrim(_body) = '' then
    raise exception 'Body cannot be empty';
  end if;

  select *
    into v_row
  from public.wins
  where id = _win_id;

  if not found then
    raise exception 'Win not found';
  end if;

  if v_row.added_by <> v_actor and not public.has_role(array['admin','coach']) then
    raise exception 'Not permitted';
  end if;

  update public.wins
  set body = btrim(_body)
  where id = _win_id
  returning * into v_row;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."update_win"("_win_id" bigint, "_body" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_meeting_attendance"("_meeting_id" bigint, "_user_id" "uuid", "_attended" boolean) RETURNS TABLE("user_id" "uuid", "meeting_id" bigint, "attended" boolean, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _owner uuid := public.canonical_owner_for(_user_id, 'attendance');
  _ts    timestamptz := now();
BEGIN
  INSERT INTO public.meeting_attendance_base (meeting_id, user_id, attended, updated_at)
  VALUES (_meeting_id, _owner, _attended, _ts)
  ON CONFLICT ON CONSTRAINT meeting_attendance_unique
  DO UPDATE SET attended = EXCLUDED.attended,
                updated_at = _ts;

  RETURN QUERY SELECT _user_id, _meeting_id, _attended, _ts;
END;
$$;


ALTER FUNCTION "public"."upsert_meeting_attendance"("_meeting_id" bigint, "_user_id" "uuid", "_attended" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_monthly_kpi_record"("_user_id" "uuid", "_period_start_date" "date", "_kpi_values" "jsonb", "_actor_id" "uuid" DEFAULT "auth"."uid"()) RETURNS TABLE("user_id" "uuid", "id" bigint, "period_start_date" "date", "last_updated_at" timestamp with time zone, "last_updated_by" "uuid")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  _owner     uuid := public.canonical_owner_for(_user_id, 'kpis');
  _record_id bigint;
  _period    date;
  _lua       timestamptz;
  _lub       uuid;
  kv         record;
  _metric_id bigint;
  _value     numeric;
BEGIN
  INSERT INTO public.monthly_kpi_records_base AS m
    (user_id, period_start_date, last_updated_by, last_updated_at)
  VALUES
    (_owner, _period_start_date, COALESCE(_actor_id, _user_id), now())
  ON CONFLICT ON CONSTRAINT mkr_user_period_uniq
  DO UPDATE SET
    last_updated_by = EXCLUDED.last_updated_by,
    last_updated_at = EXCLUDED.last_updated_at
  RETURNING
    m.id, m.period_start_date, m.last_updated_at, m.last_updated_by
  INTO
    _record_id, _period, _lua, _lub;

  IF _kpi_values IS NOT NULL THEN
    FOR kv IN
      SELECT t.key, t.value FROM jsonb_each(_kpi_values) AS t(key, value)
    LOOP
      SELECT mt.id
      INTO _metric_id
      FROM public.kpi_metric_types AS mt
      WHERE mt.key = kv.key;

      IF _metric_id IS NULL THEN
        CONTINUE;
      END IF;

      IF kv.value IS NULL OR kv.value::text = 'null' THEN
        DELETE FROM public.monthly_kpi_values
        WHERE monthly_kpi_record_id = _record_id
          AND metric_type_id        = _metric_id;
      ELSE
        _value := kv.value::numeric;

        INSERT INTO public.monthly_kpi_values (
          monthly_kpi_record_id, metric_type_id, value
        ) VALUES (
          _record_id, _metric_id, _value
        )
        ON CONFLICT (monthly_kpi_record_id, metric_type_id)
        DO UPDATE SET value = EXCLUDED.value;
      END IF;
    END LOOP;
  END IF;

  RETURN QUERY
  SELECT _user_id, _record_id, _period, _lua, _lub;
END;
$$;


ALTER FUNCTION "public"."upsert_monthly_kpi_record"("_user_id" "uuid", "_period_start_date" "date", "_kpi_values" "jsonb", "_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_smart_field_value"("_content_block_id" bigint, "_prompt_id" bigint, "_user_id" "uuid", "_value" "jsonb") RETURNS TABLE("fields_total" integer, "fields_completed" integer)
    LANGUAGE "plpgsql"
    AS $$
declare
  _response_id bigint;
begin
  insert into public.smart_doc_responses(content_block_id, user_id)
  values (_content_block_id, _user_id)
  on conflict (content_block_id, user_id)
    do update set updated_at = now()
  returning id into _response_id;

  insert into public.smart_doc_response_values(response_id, prompt_id, value_json)
  values (_response_id, _prompt_id, _value)
  on conflict (response_id, prompt_id)
    do update set value_json = excluded.value_json, updated_at = now();

  return query select * from public.get_smart_doc_progress(_content_block_id, _user_id);
end
$$;


ALTER FUNCTION "public"."upsert_smart_field_value"("_content_block_id" bigint, "_prompt_id" bigint, "_user_id" "uuid", "_value" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_video_resource"("_url" "text", "_title" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_provider text;
  v_id text;
  v_embed text;
  v_res_id bigint;
BEGIN
  IF _url ~* 'youtu\.be/' THEN
    v_provider := 'youtube';
    v_id := regexp_replace(_url, '.*youtu\.be/([A-Za-z0-9_-]+).*', '\1');
  ELSIF _url ~* 'youtube\.com' THEN
    v_provider := 'youtube';
    v_id := regexp_replace(_url, '.*[?&]v=([A-Za-z0-9_-]+).*', '\1');
  ELSIF _url ~* 'vimeo\.com' THEN
    v_provider := 'vimeo';
    v_id := regexp_replace(_url, '.*vimeo\.com/(?:video/)?([0-9]+).*', '\1');
  ELSE
    RAISE EXCEPTION 'Unsupported video provider for URL: %', _url;
  END IF;

  IF v_provider = 'youtube' THEN
    v_embed := format('https://www.youtube.com/embed/%s', v_id);
  ELSE
    v_embed := format('https://player.vimeo.com/video/%s', v_id);
  END IF;

  INSERT INTO public.resources (title, type, url, source, source_id, metadata, state)
  VALUES (
    COALESCE(_title, initcap(v_provider) || ' Video'),
    'video',
    _url,
    v_provider,
    v_id,
    jsonb_build_object(
      'provider', v_provider,
      'provider_id', v_id,
      'embed_url', v_embed,
      'aspect_ratio', '16:9'
    ),
    'published'
  )
  ON CONFLICT (source, source_id) DO UPDATE
    SET url = EXCLUDED.url,
        metadata = public.resources.metadata || EXCLUDED.metadata,
        updated_at = now()
  RETURNING id INTO v_res_id;

  RETURN v_res_id;
END
$$;


ALTER FUNCTION "public"."upsert_video_resource"("_url" "text", "_title" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_role"("p_user_id" "uuid", "p_role_code" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r
      on r.id = ur.role_id
    where ur.user_id = coalesce(p_user_id, auth.uid())
      and r.code = p_role_code
  );
$$;


ALTER FUNCTION "public"."user_has_role"("p_user_id" "uuid", "p_role_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_user_training_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (
    select 1
    from public.coaching_notes_base as note
    where note.id = new.coaching_note_id
      and note.user_id = new.user_id
  ) then
    raise exception 'The coaching note does not belong to this member.'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.content_nodes as node
    where node.id = new.course_node_id
      and node.node_type::text = 'course'
      and node.state::text = 'published'
  ) then
    raise exception 'Assigned training must be a published course.'
      using errcode = '23514';
  end if;

  new.context_label := nullif(btrim(new.context_label), '');
  return new;
end;
$$;


ALTER FUNCTION "public"."validate_user_training_assignment"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."achievement_node_map" (
    "id" bigint NOT NULL,
    "achievement_id" bigint NOT NULL,
    "node_id" bigint NOT NULL
);


ALTER TABLE "public"."achievement_node_map" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."achievement_node_map_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."achievement_node_map_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."achievement_node_map_id_seq" OWNED BY "public"."achievement_node_map"."id";



CREATE TABLE IF NOT EXISTS "public"."achievements" (
    "id" bigint NOT NULL,
    "code" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text",
    "icon_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."achievements" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."achievements_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."achievements_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."achievements_id_seq" OWNED BY "public"."achievements"."id";



CREATE TABLE IF NOT EXISTS "public"."business_review_focus_values" (
    "business_review_id" bigint NOT NULL,
    "template_key" "text" NOT NULL,
    "dimension_id" bigint NOT NULL,
    "value" smallint NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "business_review_focus_values_range" CHECK ((("value" >= 1) AND ("value" <= 7)))
);


ALTER TABLE "public"."business_review_focus_values" OWNER TO "postgres";


COMMENT ON TABLE "public"."business_review_focus_values" IS 'The nine Focus Finder ratings for a business audit. Values are integers from 1 to 7.';



CREATE TABLE IF NOT EXISTS "public"."business_review_preparation_responses" (
    "business_review_id" bigint NOT NULL,
    "business_forward_wins" "text" NOT NULL,
    "personal_forward_wins" "text" NOT NULL,
    "greatest_business_challenge" "text" NOT NULL,
    "greatest_personal_challenge" "text" NOT NULL,
    "desired_call_outcome" "text" NOT NULL,
    "topics_to_discuss" "text" NOT NULL,
    "business_rating" smallint NOT NULL,
    "personal_rating" smallint NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "business_review_prep_business_challenge_required" CHECK (("btrim"("greatest_business_challenge") <> ''::"text")),
    CONSTRAINT "business_review_prep_business_forward_required" CHECK (("btrim"("business_forward_wins") <> ''::"text")),
    CONSTRAINT "business_review_prep_business_rating_valid" CHECK (((("business_rating" >= 1) AND ("business_rating" <= 10)) AND ("business_rating" <> ALL (ARRAY[5, 7])))),
    CONSTRAINT "business_review_prep_call_outcome_required" CHECK (("btrim"("desired_call_outcome") <> ''::"text")),
    CONSTRAINT "business_review_prep_personal_challenge_required" CHECK (("btrim"("greatest_personal_challenge") <> ''::"text")),
    CONSTRAINT "business_review_prep_personal_forward_required" CHECK (("btrim"("personal_forward_wins") <> ''::"text")),
    CONSTRAINT "business_review_prep_personal_rating_valid" CHECK (((("personal_rating" >= 1) AND ("personal_rating" <= 10)) AND ("personal_rating" <> ALL (ARRAY[5, 7])))),
    CONSTRAINT "business_review_prep_topics_required" CHECK (("btrim"("topics_to_discuss") <> ''::"text"))
);


ALTER TABLE "public"."business_review_preparation_responses" OWNER TO "postgres";


COMMENT ON TABLE "public"."business_review_preparation_responses" IS 'The student-submitted preparation form for one Business Audit. Ownership is derived from business_reviews.user_id.';



COMMENT ON COLUMN "public"."business_review_preparation_responses"."submitted_at" IS 'Timestamp of the most recent complete submission. Students may edit and resubmit answers.';



CREATE TABLE IF NOT EXISTS "public"."business_review_system_priorities" (
    "business_review_id" bigint NOT NULL,
    "system_id" bigint NOT NULL,
    "position" smallint NOT NULL,
    "action_step_id" bigint NOT NULL,
    "starting_status" "public"."system_scorecard_status" NOT NULL,
    "selected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "selected_by" "uuid",
    CONSTRAINT "business_review_system_priorities_position_valid" CHECK ((("position" >= 1) AND ("position" <= 3)))
);


ALTER TABLE "public"."business_review_system_priorities" OWNER TO "postgres";


COMMENT ON TABLE "public"."business_review_system_priorities" IS 'The maximum three systems selected for a Business Audit implementation cycle. Each selection creates one linked coaching-note action step.';



COMMENT ON COLUMN "public"."business_review_system_priorities"."starting_status" IS 'Snapshot of the system status when it became a priority. Completing the linked action step promotes a previously complete system to consistent.';



CREATE TABLE IF NOT EXISTS "public"."business_review_system_ratings" (
    "business_review_id" bigint NOT NULL,
    "template_key" "text" NOT NULL,
    "system_id" bigint NOT NULL,
    "status" "public"."system_scorecard_status" DEFAULT 'not_started'::"public"."system_scorecard_status" NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "business_review_system_ratings_review_actor_valid" CHECK ((("reviewed_by" IS NULL) OR ("reviewed_at" IS NOT NULL)))
);


ALTER TABLE "public"."business_review_system_ratings" OWNER TO "postgres";


COMMENT ON TABLE "public"."business_review_system_ratings" IS 'One individual system status inside one Business Audit. Categories are not reviewable entities.';



COMMENT ON COLUMN "public"."business_review_system_ratings"."reviewed_at" IS 'Null means this individual system has not yet been reviewed during this audit, even when its status was carried forward.';



ALTER TABLE "public"."business_reviews" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."business_reviews_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."coach_profiles" (
    "user_id" "uuid" NOT NULL,
    "bio" "text",
    "m2_booking_url" "text",
    "call15_url" "text",
    "coaching_dashboard_url" "text",
    "ghl_calendar_embed_url" "text",
    "coaching_notes_url" "text",
    "m2_form_url" "text",
    "impl_booking_url" "text",
    CONSTRAINT "coach_profiles_call15_url_chk" CHECK ((("call15_url" IS NULL) OR ("call15_url" ~ '^https?://'::"text"))),
    CONSTRAINT "coach_profiles_coaching_dashboard_url_check" CHECK ((("coaching_dashboard_url" ~ '^https?://'::"text") OR ("coaching_dashboard_url" IS NULL))),
    CONSTRAINT "coach_profiles_ghl_calendar_embed_url_check" CHECK ((("ghl_calendar_embed_url" ~ '^https?://'::"text") OR ("ghl_calendar_embed_url" IS NULL))),
    CONSTRAINT "coach_profiles_impl_booking_url_check" CHECK ((("impl_booking_url" IS NULL) OR ("impl_booking_url" ~ '^https?://'::"text"))),
    CONSTRAINT "coach_profiles_m2_booking_url_chk" CHECK ((("m2_booking_url" IS NULL) OR ("m2_booking_url" ~ '^https?://'::"text")))
);


ALTER TABLE "public"."coach_profiles" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."coaching_note_action_steps_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."coaching_note_action_steps_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."coaching_note_action_steps_id_seq" OWNED BY "public"."coaching_note_action_steps"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."coaching_note_comments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."coaching_note_comments_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."coaching_note_comments_id_seq" OWNED BY "public"."coaching_note_comments"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."coaching_notes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."coaching_notes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."coaching_notes_id_seq" OWNED BY "public"."coaching_notes_base"."id";



CREATE TABLE IF NOT EXISTS "public"."coaching_private_notes" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "author_id" "uuid",
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coaching_private_notes" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."coaching_private_notes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."coaching_private_notes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."coaching_private_notes_id_seq" OWNED BY "public"."coaching_private_notes"."id";



CREATE TABLE IF NOT EXISTS "public"."content_blocks" (
    "id" bigint NOT NULL,
    "node_id" bigint NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "block_type" "text" NOT NULL,
    "text_md" "text",
    "resource_id" bigint,
    "start_ms" integer,
    "end_ms" integer,
    "label" "text",
    "notes" "text",
    "settings" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "text_search" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", COALESCE("text_md", ''::"text"))) STORED,
    "data" "jsonb" DEFAULT '{}'::"jsonb",
    "smart_doc_id" bigint,
    CONSTRAINT "content_blocks_block_type_check" CHECK (("block_type" = ANY (ARRAY['text'::"text", 'asset'::"text", 'divider'::"text", 'smart_doc'::"text"]))),
    CONSTRAINT "content_blocks_clip_times" CHECK ((("start_ms" IS NULL) OR ("end_ms" IS NULL) OR ("end_ms" > "start_ms"))),
    CONSTRAINT "content_blocks_end_ms_check" CHECK ((("end_ms" IS NULL) OR ("end_ms" >= 0))),
    CONSTRAINT "content_blocks_start_ms_check" CHECK ((("start_ms" IS NULL) OR ("start_ms" >= 0)))
);


ALTER TABLE "public"."content_blocks" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."content_blocks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."content_blocks_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."content_blocks_id_seq" OWNED BY "public"."content_blocks"."id";



CREATE TABLE IF NOT EXISTS "public"."content_node_roles" (
    "node_id" bigint NOT NULL,
    "role_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."content_node_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_node_tags" (
    "node_id" bigint NOT NULL,
    "tag_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."content_node_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_nodes" (
    "id" bigint NOT NULL,
    "node_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "slug" "text",
    "state" "text" DEFAULT 'published'::"text" NOT NULL,
    "owner_id" "uuid",
    "description" "text",
    "hero_image" "text",
    "icon" "text",
    "objectives" "text",
    "metadata" "jsonb",
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sequential_unlock" boolean DEFAULT false NOT NULL,
    "visibility" "public"."course_visibility" DEFAULT 'public'::"public"."course_visibility" NOT NULL,
    "is_public" boolean DEFAULT true NOT NULL,
    CONSTRAINT "content_nodes_node_type_check" CHECK (("node_type" = ANY (ARRAY['course'::"text", 'lesson'::"text", 'chapter'::"text", 'collection'::"text", 'playlist'::"text"]))),
    CONSTRAINT "content_nodes_state_check" CHECK (("state" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."content_nodes" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."content_nodes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."content_nodes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."content_nodes_id_seq" OWNED BY "public"."content_nodes"."id";



CREATE TABLE IF NOT EXISTS "public"."course_sort_orders" (
    "course_node_id" bigint NOT NULL,
    "sort_order" integer NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."course_sort_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."courses" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" DEFAULT ''::"text",
    "start_date" "date"
);


ALTER TABLE "public"."courses" OWNER TO "postgres";


ALTER TABLE "public"."courses" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."courses_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."focus_finder_dimensions" (
    "id" bigint NOT NULL,
    "template_key" "text" NOT NULL,
    "key" "text" NOT NULL,
    "group_key" "text" NOT NULL,
    "group_label" "text" NOT NULL,
    "label" "text" NOT NULL,
    "subtitle" "text" NOT NULL,
    "position" integer NOT NULL,
    "library_item_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "focus_finder_dimensions_group_key_valid" CHECK (("group_key" = ANY (ARRAY['attract'::"text", 'follow_up'::"text", 'service'::"text", 'scale'::"text"]))),
    CONSTRAINT "focus_finder_dimensions_key_not_blank" CHECK (("btrim"("key") <> ''::"text")),
    CONSTRAINT "focus_finder_dimensions_labels_not_blank" CHECK ((("btrim"("group_label") <> ''::"text") AND ("btrim"("label") <> ''::"text") AND ("btrim"("subtitle") <> ''::"text"))),
    CONSTRAINT "focus_finder_dimensions_position_positive" CHECK (("position" > 0))
);


ALTER TABLE "public"."focus_finder_dimensions" OWNER TO "postgres";


ALTER TABLE "public"."focus_finder_dimensions" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."focus_finder_dimensions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."focus_finder_templates" (
    "key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "version" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "focus_finder_templates_key_not_blank" CHECK (("btrim"("key") <> ''::"text")),
    CONSTRAINT "focus_finder_templates_name_not_blank" CHECK (("btrim"("name") <> ''::"text")),
    CONSTRAINT "focus_finder_templates_version_positive" CHECK (("version" > 0))
);


ALTER TABLE "public"."focus_finder_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kpi_metric_types" (
    "id" bigint NOT NULL,
    "key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."kpi_metric_types" OWNER TO "postgres";


COMMENT ON TABLE "public"."kpi_metric_types" IS 'Definition of KPI metrics available in the program (Closed Deals, Gross Revenue, etc).';



COMMENT ON COLUMN "public"."kpi_metric_types"."key" IS 'Stable internal identifier (snake_case).';



COMMENT ON COLUMN "public"."kpi_metric_types"."name" IS 'Human-readable label shown in the UI.';



COMMENT ON COLUMN "public"."kpi_metric_types"."description" IS 'Short explanation of what this KPI counts.';



CREATE SEQUENCE IF NOT EXISTS "public"."kpi_metric_types_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."kpi_metric_types_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."kpi_metric_types_id_seq" OWNED BY "public"."kpi_metric_types"."id";



CREATE TABLE IF NOT EXISTS "public"."meeting_attendance_base" (
    "meeting_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "attended" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."meeting_attendance_base" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."meeting_attendance" AS
 SELECT "vu"."user_id",
    "ma"."meeting_id",
    "ma"."attended",
    "ma"."updated_at"
   FROM ("public"."meeting_attendance_base" "ma"
     JOIN LATERAL "public"."view_user_ids_for_owner"("ma"."user_id", 'attendance'::"public"."share_domain") "vu"("user_id") ON (true));


ALTER VIEW "public"."meeting_attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meeting_types" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "counts_toward_engagement" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."meeting_types" OWNER TO "postgres";


ALTER TABLE "public"."meeting_types" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."meeting_types_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."meetings" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."meetings_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."monthly_kpi_records_base" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "period_start_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_updated_by" "uuid"
);


ALTER TABLE "public"."monthly_kpi_records_base" OWNER TO "postgres";


COMMENT ON TABLE "public"."monthly_kpi_records_base" IS 'KPI snapshot per user per period (period defined by period_start_date).';



COMMENT ON COLUMN "public"."monthly_kpi_records_base"."user_id" IS 'FK to profiles.id (auth.users.id).';



COMMENT ON COLUMN "public"."monthly_kpi_records_base"."period_start_date" IS 'Start date of this KPI period for the user (their personal "month" start).';



CREATE OR REPLACE VIEW "public"."monthly_kpi_records" AS
 SELECT "vu"."user_id",
    "r"."id",
    "r"."period_start_date",
    "r"."last_updated_at",
    "r"."last_updated_by"
   FROM ("public"."monthly_kpi_records_base" "r"
     JOIN LATERAL "public"."view_user_ids_for_owner"("r"."user_id", 'kpis'::"public"."share_domain") "vu"("user_id") ON (true));


ALTER VIEW "public"."monthly_kpi_records" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."monthly_kpi_records_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."monthly_kpi_records_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."monthly_kpi_records_id_seq" OWNED BY "public"."monthly_kpi_records_base"."id";



CREATE TABLE IF NOT EXISTS "public"."monthly_kpi_values" (
    "id" bigint NOT NULL,
    "monthly_kpi_record_id" bigint NOT NULL,
    "metric_type_id" bigint NOT NULL,
    "value" numeric
);


ALTER TABLE "public"."monthly_kpi_values" OWNER TO "postgres";


COMMENT ON TABLE "public"."monthly_kpi_values" IS 'Actual numeric KPI values per (user, period, metric_type).';



CREATE SEQUENCE IF NOT EXISTS "public"."monthly_kpi_values_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."monthly_kpi_values_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."monthly_kpi_values_id_seq" OWNED BY "public"."monthly_kpi_values"."id";



CREATE OR REPLACE VIEW "public"."node_assets_v" AS
 SELECT "node_id" AS "parent_id",
    "resource_id",
    "min"("position") AS "first_position"
   FROM "public"."content_blocks" "cb"
  WHERE ("block_type" = 'asset'::"text")
  GROUP BY "node_id", "resource_id";


ALTER VIEW "public"."node_assets_v" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."node_children" (
    "parent_id" bigint NOT NULL,
    "child_id" bigint NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "is_required" boolean DEFAULT true NOT NULL,
    "label" "text",
    "notes" "text"
);


ALTER TABLE "public"."node_children" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."node_edge_rules" (
    "parent_type" "text" NOT NULL,
    "child_kind" "text" NOT NULL,
    "child_type" "text" NOT NULL,
    CONSTRAINT "node_edge_rules_child_kind_check" CHECK (("child_kind" = ANY (ARRAY['node'::"text", 'asset'::"text"]))),
    CONSTRAINT "node_edge_rules_child_type_chk" CHECK (((("child_kind" = 'asset'::"text") AND ("child_type" = 'asset'::"text")) OR (("child_kind" = 'node'::"text") AND ("child_type" = ANY (ARRAY['course'::"text", 'lesson'::"text", 'chapter'::"text", 'collection'::"text", 'playlist'::"text"]))))),
    CONSTRAINT "node_edge_rules_parent_type_check" CHECK (("parent_type" = ANY (ARRAY['course'::"text", 'lesson'::"text", 'chapter'::"text", 'collection'::"text", 'playlist'::"text"])))
);


ALTER TABLE "public"."node_edge_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partnership_users" (
    "partnership_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."partnership_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partnerships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "shared_kpis" boolean DEFAULT true NOT NULL,
    "shared_attendance" boolean DEFAULT false NOT NULL,
    "shared_notes" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."partnerships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "first_name" "text" DEFAULT ''::"text",
    "last_name" "text" DEFAULT ''::"text",
    "looker_link" "text" DEFAULT ''::"text",
    "ghl_user_id" "text",
    "attention_status_auto" "public"."user_attention_status" DEFAULT 'green'::"public"."user_attention_status" NOT NULL,
    "attention_status_manual" "public"."user_attention_status",
    "attention_status_manual_reason" "text",
    "attention_status_updated_by" "uuid",
    "attention_status_updated_at" timestamp with time zone,
    "introduced_at" timestamp with time zone,
    "ghl_contact_id" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."attention_status_auto" IS 'Automatically computed attention status (green / yellow / red) based on KPIs, attendance, etc.';



COMMENT ON COLUMN "public"."profiles"."attention_status_manual" IS 'Manual override of attention status set by coach/admin. NULL means: use automatic status.';



COMMENT ON COLUMN "public"."profiles"."attention_status_manual_reason" IS 'Optional reason text for manual status (e.g. struggling with personal issues, considering leaving, etc.).';



COMMENT ON COLUMN "public"."profiles"."attention_status_updated_by" IS 'Profile id of the user (coach/admin) who last updated the manual attention status.';



COMMENT ON COLUMN "public"."profiles"."attention_status_updated_at" IS 'Timestamp of last manual attention status update.';



CREATE TABLE IF NOT EXISTS "public"."resource_access" (
    "id" bigint NOT NULL,
    "resource_id" bigint NOT NULL,
    "user_id" "uuid",
    "accessed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "session_id" "text"
);


ALTER TABLE "public"."resource_access" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."resource_access_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."resource_access_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."resource_access_id_seq" OWNED BY "public"."resource_access"."id";



CREATE OR REPLACE VIEW "public"."resource_block_locations" AS
 SELECT "cb"."resource_id",
    "cb"."position" AS "block_position",
    "cn"."id" AS "node_id",
    "cn"."slug" AS "node_slug",
    "cn"."title" AS "node_title",
    "cn"."node_type",
    "cn"."state" AS "node_state"
   FROM ("public"."content_blocks" "cb"
     JOIN "public"."content_nodes" "cn" ON (("cn"."id" = "cb"."node_id")))
  WHERE ("cb"."block_type" = 'asset'::"text");


ALTER VIEW "public"."resource_block_locations" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."resource_primary_location" AS
 WITH "ranked" AS (
         SELECT "rbl"."resource_id",
            "rbl"."block_position",
            "rbl"."node_id",
            "rbl"."node_slug",
            "rbl"."node_title",
            "rbl"."node_type",
            "rbl"."node_state",
            "row_number"() OVER (PARTITION BY "rbl"."resource_id" ORDER BY
                CASE "rbl"."node_state"
                    WHEN 'published'::"text" THEN 0
                    ELSE 1
                END,
                CASE "rbl"."node_type"
                    WHEN 'lesson'::"text" THEN 1
                    WHEN 'chapter'::"text" THEN 2
                    WHEN 'collection'::"text" THEN 3
                    WHEN 'playlist'::"text" THEN 4
                    WHEN 'course'::"text" THEN 5
                    ELSE 9
                END, "rbl"."block_position") AS "rn"
           FROM "public"."resource_block_locations" "rbl"
        )
 SELECT "resource_id",
    "block_position",
    "node_id",
    "node_slug",
    "node_title",
    "node_type",
    "node_state",
    "rn",
    "public"."resolve_content_node_open_path"("node_id") AS "open_path"
   FROM "ranked" "r"
  WHERE ("rn" = 1);


ALTER VIEW "public"."resource_primary_location" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resource_tags" (
    "resource_id" bigint NOT NULL,
    "tag_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."resource_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resources" (
    "id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "type" "text" NOT NULL,
    "url" "text" NOT NULL,
    "thumbnail" "text",
    "duration" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "tag_text" "text",
    "state" "text" DEFAULT 'published'::"text" NOT NULL,
    "source" "text" DEFAULT 'manual'::"text",
    "source_id" "text",
    "metadata" "jsonb",
    "tsv_all" "tsvector" GENERATED ALWAYS AS ((("setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("title", ''::"text")), 'A'::"char") || "setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("tag_text", ''::"text")), 'B'::"char")) || "setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("description", ''::"text")), 'C'::"char"))) STORED,
    "tsv_simple" "tsvector" GENERATED ALWAYS AS ((("setweight"("to_tsvector"('"simple"'::"regconfig", COALESCE("title", ''::"text")), 'A'::"char") || "setweight"("to_tsvector"('"simple"'::"regconfig", COALESCE("tag_text", ''::"text")), 'B'::"char")) || "setweight"("to_tsvector"('"simple"'::"regconfig", COALESCE("description", ''::"text")), 'C'::"char"))) STORED,
    "storage_bucket" "text",
    "storage_path" "text",
    CONSTRAINT "resources_duration_nonneg" CHECK ((("duration" IS NULL) OR ("duration" >= 0))),
    CONSTRAINT "resources_source_check" CHECK (("source" = ANY (ARRAY['vimeo'::"text", 'upcoach'::"text", 'rss'::"text", 'drive'::"text", 'manual'::"text"]))),
    CONSTRAINT "resources_state_check" CHECK (("state" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"]))),
    CONSTRAINT "resources_type_check" CHECK (("type" = ANY (ARRAY['video'::"text", 'podcast'::"text", 'pdf'::"text", 'document'::"text", 'audio'::"text", 'image'::"text", 'link'::"text"])))
);


ALTER TABLE "public"."resources" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."resources_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."resources_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."resources_id_seq" OWNED BY "public"."resources"."id";



CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" bigint NOT NULL,
    "code" "text" NOT NULL
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."roles_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."roles_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."roles_id_seq" OWNED BY "public"."roles"."id";



CREATE TABLE IF NOT EXISTS "public"."search_analytics" (
    "id" bigint NOT NULL,
    "query" "text" NOT NULL,
    "results_count" integer DEFAULT 0 NOT NULL,
    "user_id" "uuid",
    "searched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "session_id" "text"
);


ALTER TABLE "public"."search_analytics" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."search_analytics_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."search_analytics_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."search_analytics_id_seq" OWNED BY "public"."search_analytics"."id";



CREATE TABLE IF NOT EXISTS "public"."site_announcements" (
    "id" bigint NOT NULL,
    "message" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "background_color" "text",
    "text_color" "text",
    "button_label" "text",
    "button_url" "text",
    "button_color" "text"
);


ALTER TABLE "public"."site_announcements" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."site_announcements_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."site_announcements_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."site_announcements_id_seq" OWNED BY "public"."site_announcements"."id";



CREATE TABLE IF NOT EXISTS "public"."smart_doc_prompts" (
    "id" bigint NOT NULL,
    "doc_id" bigint NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "label" "text" NOT NULL,
    "prompt_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "help_text" "text",
    "required" boolean DEFAULT false NOT NULL,
    "options_json" "jsonb",
    "validation_json" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sdp_position_nonneg" CHECK (("position" >= 0))
);


ALTER TABLE "public"."smart_doc_prompts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."smart_doc_prompts"."options_json" IS 'For future select/multiselect, e.g.:
    { "choices": ["Option A","Option B"], "allow_other": true }';



COMMENT ON COLUMN "public"."smart_doc_prompts"."validation_json" IS 'For future validation hints, e.g.:
    { "min_length": 10, "max_length": 500, "pattern": "^[A-Z].*" }';



CREATE SEQUENCE IF NOT EXISTS "public"."smart_doc_prompts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smart_doc_prompts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."smart_doc_prompts_id_seq" OWNED BY "public"."smart_doc_prompts"."id";



CREATE TABLE IF NOT EXISTS "public"."smart_doc_response_values" (
    "response_id" bigint NOT NULL,
    "prompt_id" bigint NOT NULL,
    "value_json" "jsonb" NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."smart_doc_response_values" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."smart_doc_responses" (
    "id" bigint NOT NULL,
    "content_block_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_at" timestamp with time zone,
    "created_by" "uuid",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."smart_doc_responses" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."smart_doc_responses_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smart_doc_responses_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."smart_doc_responses_id_seq" OWNED BY "public"."smart_doc_responses"."id";



CREATE TABLE IF NOT EXISTS "public"."smart_docs" (
    "id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "is_published" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."smart_docs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."smart_docs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smart_docs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."smart_docs_id_seq" OWNED BY "public"."smart_docs"."id";



CREATE TABLE IF NOT EXISTS "public"."system_scorecard_categories" (
    "id" bigint NOT NULL,
    "template_key" "text" NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "position" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "system_scorecard_categories_key_not_blank" CHECK (("btrim"("key") <> ''::"text")),
    CONSTRAINT "system_scorecard_categories_label_not_blank" CHECK (("btrim"("label") <> ''::"text")),
    CONSTRAINT "system_scorecard_categories_position_positive" CHECK (("position" > 0))
);


ALTER TABLE "public"."system_scorecard_categories" OWNER TO "postgres";


COMMENT ON TABLE "public"."system_scorecard_categories" IS 'Presentational groupings for scorecard systems. Categories do not carry review status or confirmation state.';



ALTER TABLE "public"."system_scorecard_categories" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."system_scorecard_categories_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."system_scorecard_systems" (
    "id" bigint NOT NULL,
    "template_key" "text" NOT NULL,
    "category_id" bigint NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "position" integer NOT NULL,
    "library_item_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "system_scorecard_systems_key_not_blank" CHECK (("btrim"("key") <> ''::"text")),
    CONSTRAINT "system_scorecard_systems_label_not_blank" CHECK (("btrim"("label") <> ''::"text")),
    CONSTRAINT "system_scorecard_systems_position_positive" CHECK (("position" > 0))
);


ALTER TABLE "public"."system_scorecard_systems" OWNER TO "postgres";


COMMENT ON COLUMN "public"."system_scorecard_systems"."key" IS 'Stable system key used to carry status between template versions.';



COMMENT ON COLUMN "public"."system_scorecard_systems"."library_item_id" IS 'Optional future link to the detailed training or SOP for this system.';



ALTER TABLE "public"."system_scorecard_systems" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."system_scorecard_systems_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."system_scorecard_templates" (
    "key" "text" NOT NULL,
    "audience" "public"."system_scorecard_audience" NOT NULL,
    "name" "text" NOT NULL,
    "version" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "system_scorecard_templates_key_not_blank" CHECK (("btrim"("key") <> ''::"text")),
    CONSTRAINT "system_scorecard_templates_name_not_blank" CHECK (("btrim"("name") <> ''::"text")),
    CONSTRAINT "system_scorecard_templates_version_positive" CHECK (("version" > 0))
);


ALTER TABLE "public"."system_scorecard_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_scorecard_version_migrations" (
    "id" bigint NOT NULL,
    "business_review_id" bigint NOT NULL,
    "from_template_key" "text" NOT NULL,
    "to_template_key" "text" NOT NULL,
    "migrated_by" "uuid",
    "resolution" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "previous_snapshot" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."system_scorecard_version_migrations" OWNER TO "postgres";


COMMENT ON TABLE "public"."system_scorecard_version_migrations" IS 'Audit trail for atomic migrations of incomplete Business Reviews between immutable Systems Scorecard versions.';



ALTER TABLE "public"."system_scorecard_version_migrations" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."system_scorecard_version_migrations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."tags" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."tags" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."tag_usage" AS
 SELECT "t"."id",
    "t"."name",
    "t"."category",
    "count"("rt"."resource_id") AS "usage_count"
   FROM ("public"."tags" "t"
     LEFT JOIN "public"."resource_tags" "rt" ON (("rt"."tag_id" = "t"."id")))
  GROUP BY "t"."id", "t"."name", "t"."category"
  WITH NO DATA;


ALTER MATERIALIZED VIEW "public"."tag_usage" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tags_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."tags_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tags_id_seq" OWNED BY "public"."tags"."id";



CREATE TABLE IF NOT EXISTS "public"."user_achievements" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "achievement_id" bigint NOT NULL,
    "achieved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "awarded_via" "text" DEFAULT 'auto'::"text" NOT NULL,
    CONSTRAINT "user_achievements_awarded_via_chk" CHECK (("awarded_via" = ANY (ARRAY['auto'::"text", 'manual'::"text", 'import'::"text", 'reconcile'::"text"])))
);


ALTER TABLE "public"."user_achievements" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."user_achievements_inferred" AS
 WITH "steps" AS (
         SELECT "s"."id",
            "s"."coaching_note_id",
            "s"."library_item_id" AS "node_id",
            "s"."updated_at" AS "step_last_update"
           FROM "public"."coaching_note_action_steps" "s"
          WHERE (("s"."status" = 'complete'::"public"."action_step_status") AND ("s"."library_item_id" IS NOT NULL))
        )
 SELECT DISTINCT "cn"."user_id",
    "m"."achievement_id",
    "min"("st"."step_last_update") AS "achieved_at"
   FROM (("steps" "st"
     JOIN "public"."coaching_notes_base" "cn" ON ((("cn"."id" = "st"."coaching_note_id") AND ("cn"."deleted_at" IS NULL))))
     JOIN "public"."achievement_node_map" "m" ON (("m"."node_id" = "st"."node_id")))
  GROUP BY "cn"."user_id", "m"."achievement_id";


ALTER VIEW "public"."user_achievements_inferred" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."user_achievements_extraneous" AS
 SELECT "a"."user_id",
    "a"."achievement_id",
    "a"."achieved_at",
    "a"."awarded_via"
   FROM ("public"."user_achievements" "a"
     LEFT JOIN "public"."user_achievements_inferred" "i" ON ((("i"."user_id" = "a"."user_id") AND ("i"."achievement_id" = "a"."achievement_id"))))
  WHERE ("i"."user_id" IS NULL);


ALTER VIEW "public"."user_achievements_extraneous" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."user_achievements_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."user_achievements_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."user_achievements_id_seq" OWNED BY "public"."user_achievements"."id";



CREATE OR REPLACE VIEW "public"."user_achievements_missing" AS
 SELECT "i"."user_id",
    "i"."achievement_id",
    "i"."achieved_at"
   FROM ("public"."user_achievements_inferred" "i"
     LEFT JOIN "public"."user_achievements" "a" ON ((("a"."user_id" = "i"."user_id") AND ("a"."achievement_id" = "i"."achievement_id"))))
  WHERE ("a"."id" IS NULL);


ALTER VIEW "public"."user_achievements_missing" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_assistants" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "assistant_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "assigned_by" "uuid",
    "notes" "text",
    CONSTRAINT "user_assistants_not_self" CHECK (("user_id" <> "assistant_id"))
);


ALTER TABLE "public"."user_assistants" OWNER TO "postgres";


ALTER TABLE "public"."user_assistants" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."user_assistants_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."user_attention_effective" AS
 SELECT "id" AS "user_id",
    COALESCE("attention_status_manual", "attention_status_auto") AS "status",
        CASE
            WHEN ("attention_status_manual" IS NOT NULL) THEN 'manual'::"text"
            ELSE 'auto'::"text"
        END AS "source",
    "attention_status_manual_reason",
    "attention_status_updated_by",
    "attention_status_updated_at"
   FROM "public"."profiles" "p";


ALTER VIEW "public"."user_attention_effective" OWNER TO "postgres";


COMMENT ON VIEW "public"."user_attention_effective" IS 'Convenience view exposing each user''s effective attention status (manual overrides automatic).';



CREATE TABLE IF NOT EXISTS "public"."user_attention_status_log" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "manual_status" "public"."user_attention_status",
    "reason" "text",
    "prev_manual_status" "public"."user_attention_status",
    "prev_reason" "text",
    "changed_by" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "change_source" "text" NOT NULL,
    CONSTRAINT "user_attention_status_log_change_source_check" CHECK (("change_source" = ANY (ARRAY['manual'::"text", 'auto'::"text"])))
);


ALTER TABLE "public"."user_attention_status_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_attention_status_log" IS 'Audit log of changes to user attention status, mainly for manual overrides by coaches/admins.';



COMMENT ON COLUMN "public"."user_attention_status_log"."manual_status" IS 'Manual status AFTER this change (green / yellow / red). NULL means the manual override was cleared.';



COMMENT ON COLUMN "public"."user_attention_status_log"."change_source" IS 'Source of change: ''manual'' (coach/admin via UI) or ''auto'' (system recomputation).';



CREATE SEQUENCE IF NOT EXISTS "public"."user_attention_status_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."user_attention_status_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."user_attention_status_log_id_seq" OWNED BY "public"."user_attention_status_log"."id";



CREATE TABLE IF NOT EXISTS "public"."user_coaches" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "course_id" bigint,
    "relationship_type" "public"."coach_relationship_type" DEFAULT 'primary'::"public"."coach_relationship_type" NOT NULL
);


ALTER TABLE "public"."user_coaches" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."user_coaches_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."user_coaches_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."user_coaches_id_seq" OWNED BY "public"."user_coaches"."id";



CREATE TABLE IF NOT EXISTS "public"."user_course_visibility" (
    "user_id" "uuid" NOT NULL,
    "course_node_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_course_visibility" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_course_visibility" IS 'Grants per-user visibility to specific course content_nodes when content_nodes.is_public = false.';



COMMENT ON COLUMN "public"."user_course_visibility"."course_node_id" IS 'References content_nodes.id where node_type = ''course''.';



CREATE TABLE IF NOT EXISTS "public"."user_merge_log" (
    "id" bigint NOT NULL,
    "source_user_id" "uuid",
    "dest_user_id" "uuid",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "dry_run" boolean DEFAULT true NOT NULL,
    "options" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "result_json" "jsonb",
    "note" "text"
);


ALTER TABLE "public"."user_merge_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."user_merge_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."user_merge_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."user_merge_log_id_seq" OWNED BY "public"."user_merge_log"."id";



CREATE TABLE IF NOT EXISTS "public"."user_node_progress" (
    "user_id" "uuid" NOT NULL,
    "node_id" bigint NOT NULL,
    "status" "public"."node_progress_status" DEFAULT 'not_started'::"public"."node_progress_status" NOT NULL,
    "first_started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "progress_json" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_node_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "user_id" "uuid" NOT NULL,
    "role_id" bigint NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."user_system_scorecard_last_reviews" WITH ("security_invoker"='true') AS
 SELECT "review"."user_id",
    "template"."audience",
    "system"."key" AS "system_key",
    "max"("rating"."reviewed_at") AS "last_reviewed_at",
    ("max"("rating"."reviewed_at") + '1 year'::interval) AS "review_due_at",
    (("max"("rating"."reviewed_at") IS NULL) OR ("max"("rating"."reviewed_at") < ("now"() - '1 year'::interval))) AS "review_overdue"
   FROM ((("public"."business_review_system_ratings" "rating"
     JOIN "public"."business_reviews" "review" ON (("review"."id" = "rating"."business_review_id")))
     JOIN "public"."system_scorecard_templates" "template" ON (("template"."key" = "rating"."template_key")))
     JOIN "public"."system_scorecard_systems" "system" ON ((("system"."id" = "rating"."system_id") AND ("system"."template_key" = "rating"."template_key"))))
  GROUP BY "review"."user_id", "template"."audience", "system"."key";


ALTER VIEW "public"."user_system_scorecard_last_reviews" OWNER TO "postgres";


COMMENT ON VIEW "public"."user_system_scorecard_last_reviews" IS 'Latest individual review date for each user and stable system key, plus a twelve-month overdue indicator.';



ALTER TABLE "public"."user_training_assignments" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."user_training_assignments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."wins_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."wins_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."wins_id_seq" OWNED BY "public"."wins"."id";



CREATE TABLE IF NOT EXISTS "public"."zoom_attendance_aliases" (
    "alias_key" "text" NOT NULL,
    "alias" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "approved_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "zoom_attendance_aliases_alias_key_not_blank" CHECK ((("btrim"("alias_key") <> ''::"text") AND ("alias_key" = "btrim"("alias_key")) AND ("alias_key" = "lower"("alias_key")))),
    CONSTRAINT "zoom_attendance_aliases_alias_not_blank" CHECK (("btrim"("alias") <> ''::"text"))
);


ALTER TABLE "public"."zoom_attendance_aliases" OWNER TO "postgres";


COMMENT ON TABLE "public"."zoom_attendance_aliases" IS 'Administrator-approved mappings from Zoom display names to website users.';



COMMENT ON COLUMN "public"."zoom_attendance_aliases"."alias_key" IS 'Normalized Zoom display name. This is globally unique so one alias cannot resolve to multiple users.';



ALTER TABLE ONLY "public"."achievement_node_map" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."achievement_node_map_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."achievements" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."achievements_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."coaching_note_action_steps" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."coaching_note_action_steps_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."coaching_note_comments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."coaching_note_comments_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."coaching_notes_base" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."coaching_notes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."coaching_private_notes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."coaching_private_notes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."content_blocks" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."content_blocks_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."content_nodes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."content_nodes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."kpi_metric_types" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."kpi_metric_types_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."monthly_kpi_records_base" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."monthly_kpi_records_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."monthly_kpi_values" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."monthly_kpi_values_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."resource_access" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."resource_access_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."resources" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."resources_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."roles" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."roles_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."search_analytics" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."search_analytics_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."site_announcements" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."site_announcements_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."smart_doc_prompts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."smart_doc_prompts_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."smart_doc_responses" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."smart_doc_responses_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."smart_docs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."smart_docs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tags" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tags_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."user_achievements" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."user_achievements_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."user_attention_status_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."user_attention_status_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."user_coaches" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."user_coaches_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."user_merge_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."user_merge_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."wins" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."wins_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."achievement_node_map"
    ADD CONSTRAINT "achievement_node_map_achievement_id_node_id_key" UNIQUE ("achievement_id", "node_id");



ALTER TABLE ONLY "public"."achievement_node_map"
    ADD CONSTRAINT "achievement_node_map_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_review_focus_values"
    ADD CONSTRAINT "business_review_focus_values_pkey" PRIMARY KEY ("business_review_id", "dimension_id");



ALTER TABLE ONLY "public"."business_review_preparation_responses"
    ADD CONSTRAINT "business_review_preparation_responses_pkey" PRIMARY KEY ("business_review_id");



ALTER TABLE ONLY "public"."business_review_system_priorities"
    ADD CONSTRAINT "business_review_system_priorities_action_step_unique" UNIQUE ("action_step_id");



ALTER TABLE ONLY "public"."business_review_system_priorities"
    ADD CONSTRAINT "business_review_system_priorities_pkey" PRIMARY KEY ("business_review_id", "system_id");



ALTER TABLE ONLY "public"."business_review_system_priorities"
    ADD CONSTRAINT "business_review_system_priorities_position_unique" UNIQUE ("business_review_id", "position");



ALTER TABLE ONLY "public"."business_review_system_ratings"
    ADD CONSTRAINT "business_review_system_ratings_pkey" PRIMARY KEY ("business_review_id", "system_id");



ALTER TABLE ONLY "public"."business_reviews"
    ADD CONSTRAINT "business_reviews_coaching_note_unique" UNIQUE ("coaching_note_id");



ALTER TABLE ONLY "public"."business_reviews"
    ADD CONSTRAINT "business_reviews_id_system_scorecard_template_unique" UNIQUE ("id", "system_scorecard_template_key");



ALTER TABLE ONLY "public"."business_reviews"
    ADD CONSTRAINT "business_reviews_id_template_unique" UNIQUE ("id", "focus_finder_template_key");



ALTER TABLE ONLY "public"."business_reviews"
    ADD CONSTRAINT "business_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_profiles"
    ADD CONSTRAINT "coach_profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."coaching_note_action_steps"
    ADD CONSTRAINT "coaching_note_action_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coaching_note_comments"
    ADD CONSTRAINT "coaching_note_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coaching_notes_base"
    ADD CONSTRAINT "coaching_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coaching_private_notes"
    ADD CONSTRAINT "coaching_private_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_blocks"
    ADD CONSTRAINT "content_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_node_roles"
    ADD CONSTRAINT "content_node_roles_pkey" PRIMARY KEY ("node_id", "role_id");



ALTER TABLE ONLY "public"."content_node_tags"
    ADD CONSTRAINT "content_node_tags_pkey" PRIMARY KEY ("node_id", "tag_id");



ALTER TABLE ONLY "public"."content_nodes"
    ADD CONSTRAINT "content_nodes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_sort_orders"
    ADD CONSTRAINT "course_sort_orders_pkey" PRIMARY KEY ("course_node_id");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."focus_finder_dimensions"
    ADD CONSTRAINT "focus_finder_dimensions_id_template_unique" UNIQUE ("id", "template_key");



ALTER TABLE ONLY "public"."focus_finder_dimensions"
    ADD CONSTRAINT "focus_finder_dimensions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."focus_finder_dimensions"
    ADD CONSTRAINT "focus_finder_dimensions_template_key_unique" UNIQUE ("template_key", "key");



ALTER TABLE ONLY "public"."focus_finder_dimensions"
    ADD CONSTRAINT "focus_finder_dimensions_template_position_unique" UNIQUE ("template_key", "position");



ALTER TABLE ONLY "public"."focus_finder_templates"
    ADD CONSTRAINT "focus_finder_templates_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."kpi_metric_types"
    ADD CONSTRAINT "kpi_metric_types_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."kpi_metric_types"
    ADD CONSTRAINT "kpi_metric_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meeting_attendance_base"
    ADD CONSTRAINT "meeting_attendance_pkey" PRIMARY KEY ("meeting_id", "user_id");



ALTER TABLE ONLY "public"."meeting_attendance_base"
    ADD CONSTRAINT "meeting_attendance_unique" UNIQUE ("meeting_id", "user_id");



ALTER TABLE ONLY "public"."meeting_types"
    ADD CONSTRAINT "meeting_types_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."meeting_types"
    ADD CONSTRAINT "meeting_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_kpi_records_base"
    ADD CONSTRAINT "mkr_user_period_uniq" UNIQUE ("user_id", "period_start_date");



ALTER TABLE ONLY "public"."monthly_kpi_records_base"
    ADD CONSTRAINT "monthly_kpi_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_kpi_records_base"
    ADD CONSTRAINT "monthly_kpi_records_user_period_uniq" UNIQUE ("user_id", "period_start_date");



ALTER TABLE ONLY "public"."monthly_kpi_values"
    ADD CONSTRAINT "monthly_kpi_values_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_kpi_values"
    ADD CONSTRAINT "monthly_kpi_values_record_metric_uniq" UNIQUE ("monthly_kpi_record_id", "metric_type_id");



ALTER TABLE ONLY "public"."node_children"
    ADD CONSTRAINT "node_children_pkey" PRIMARY KEY ("parent_id", "child_id");



ALTER TABLE ONLY "public"."node_edge_rules"
    ADD CONSTRAINT "node_edge_rules_pkey" PRIMARY KEY ("parent_type", "child_kind", "child_type");



ALTER TABLE ONLY "public"."partnership_users"
    ADD CONSTRAINT "partnership_users_pkey" PRIMARY KEY ("partnership_id", "user_id");



ALTER TABLE ONLY "public"."partnerships"
    ADD CONSTRAINT "partnerships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_key" UNIQUE ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_access"
    ADD CONSTRAINT "resource_access_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_tags"
    ADD CONSTRAINT "resource_tags_pkey" PRIMARY KEY ("resource_id", "tag_id");



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_source_unique" UNIQUE ("source", "source_id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."smart_doc_prompts"
    ADD CONSTRAINT "sdp_doc_pos_unique" UNIQUE ("doc_id", "position");



ALTER TABLE ONLY "public"."search_analytics"
    ADD CONSTRAINT "search_analytics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_announcements"
    ADD CONSTRAINT "site_announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."smart_doc_prompts"
    ADD CONSTRAINT "smart_doc_prompts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."smart_doc_response_values"
    ADD CONSTRAINT "smart_doc_response_values_pkey" PRIMARY KEY ("response_id", "prompt_id");



ALTER TABLE ONLY "public"."smart_doc_responses"
    ADD CONSTRAINT "smart_doc_responses_content_block_id_user_id_key" UNIQUE ("content_block_id", "user_id");



ALTER TABLE ONLY "public"."smart_doc_responses"
    ADD CONSTRAINT "smart_doc_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."smart_docs"
    ADD CONSTRAINT "smart_docs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_scorecard_categories"
    ADD CONSTRAINT "system_scorecard_categories_id_template_unique" UNIQUE ("id", "template_key");



ALTER TABLE ONLY "public"."system_scorecard_categories"
    ADD CONSTRAINT "system_scorecard_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_scorecard_categories"
    ADD CONSTRAINT "system_scorecard_categories_template_key_unique" UNIQUE ("template_key", "key");



ALTER TABLE ONLY "public"."system_scorecard_categories"
    ADD CONSTRAINT "system_scorecard_categories_template_position_unique" UNIQUE ("template_key", "position");



ALTER TABLE ONLY "public"."system_scorecard_systems"
    ADD CONSTRAINT "system_scorecard_systems_category_position_unique" UNIQUE ("category_id", "position");



ALTER TABLE ONLY "public"."system_scorecard_systems"
    ADD CONSTRAINT "system_scorecard_systems_id_template_unique" UNIQUE ("id", "template_key");



ALTER TABLE ONLY "public"."system_scorecard_systems"
    ADD CONSTRAINT "system_scorecard_systems_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_scorecard_systems"
    ADD CONSTRAINT "system_scorecard_systems_template_key_unique" UNIQUE ("template_key", "key");



ALTER TABLE ONLY "public"."system_scorecard_templates"
    ADD CONSTRAINT "system_scorecard_templates_audience_version_unique" UNIQUE ("audience", "version");



ALTER TABLE ONLY "public"."system_scorecard_templates"
    ADD CONSTRAINT "system_scorecard_templates_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."system_scorecard_version_migrations"
    ADD CONSTRAINT "system_scorecard_version_migr_business_review_id_to_templat_key" UNIQUE ("business_review_id", "to_template_key");



ALTER TABLE ONLY "public"."system_scorecard_version_migrations"
    ADD CONSTRAINT "system_scorecard_version_migrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_user_id_achievement_id_key" UNIQUE ("user_id", "achievement_id");



ALTER TABLE ONLY "public"."user_assistants"
    ADD CONSTRAINT "user_assistants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_attention_status_log"
    ADD CONSTRAINT "user_attention_status_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_coaches"
    ADD CONSTRAINT "user_coaches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_course_visibility"
    ADD CONSTRAINT "user_course_visibility_pkey" PRIMARY KEY ("user_id", "course_node_id");



ALTER TABLE ONLY "public"."user_merge_log"
    ADD CONSTRAINT "user_merge_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_node_progress"
    ADD CONSTRAINT "user_node_progress_pkey" PRIMARY KEY ("user_id", "node_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id", "role_id");



ALTER TABLE ONLY "public"."user_training_assignments"
    ADD CONSTRAINT "user_training_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wins"
    ADD CONSTRAINT "wins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zoom_attendance_aliases"
    ADD CONSTRAINT "zoom_attendance_aliases_pkey" PRIMARY KEY ("alias_key");



CREATE INDEX "business_review_focus_values_dimension_idx" ON "public"."business_review_focus_values" USING "btree" ("dimension_id");



CREATE INDEX "business_review_system_ratings_review_progress_idx" ON "public"."business_review_system_ratings" USING "btree" ("business_review_id", "reviewed_at");



CREATE INDEX "business_review_system_ratings_system_reviewed_idx" ON "public"."business_review_system_ratings" USING "btree" ("system_id", "reviewed_at" DESC) WHERE ("reviewed_at" IS NOT NULL);



CREATE INDEX "business_reviews_coach_date_idx" ON "public"."business_reviews" USING "btree" ("coach_id", "review_date" DESC, "id" DESC);



CREATE UNIQUE INDEX "business_reviews_meeting_id_uidx" ON "public"."business_reviews" USING "btree" ("meeting_id") WHERE ("meeting_id" IS NOT NULL);



CREATE INDEX "business_reviews_status_idx" ON "public"."business_reviews" USING "btree" ("status");



CREATE INDEX "business_reviews_user_date_idx" ON "public"."business_reviews" USING "btree" ("user_id", "review_date" DESC, "id" DESC);



CREATE INDEX "coaching_note_action_steps_note_idx" ON "public"."coaching_note_action_steps" USING "btree" ("coaching_note_id");



CREATE INDEX "coaching_note_action_steps_status_idx" ON "public"."coaching_note_action_steps" USING "btree" ("status");



CREATE INDEX "coaching_note_comments_author_idx" ON "public"."coaching_note_comments" USING "btree" ("author_id");



CREATE INDEX "coaching_note_comments_note_idx" ON "public"."coaching_note_comments" USING "btree" ("coaching_note_id");



CREATE INDEX "coaching_notes_base_active_user_created_idx" ON "public"."coaching_notes_base" USING "btree" ("user_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "coaching_notes_base_deleted_at_idx" ON "public"."coaching_notes_base" USING "btree" ("deleted_at");



CREATE INDEX "coaching_notes_coach_idx" ON "public"."coaching_notes_base" USING "btree" ("coach_id");



CREATE INDEX "coaching_notes_user_idx" ON "public"."coaching_notes_base" USING "btree" ("user_id");



CREATE INDEX "coaching_private_notes_author_idx" ON "public"."coaching_private_notes" USING "btree" ("author_id");



CREATE INDEX "coaching_private_notes_user_idx" ON "public"."coaching_private_notes" USING "btree" ("user_id");



CREATE INDEX "content_blocks_node_pos_idx" ON "public"."content_blocks" USING "btree" ("node_id", "position");



CREATE INDEX "content_blocks_resource_id_idx" ON "public"."content_blocks" USING "btree" ("resource_id") WHERE ("block_type" = 'asset'::"text");



CREATE INDEX "content_blocks_text_search_idx" ON "public"."content_blocks" USING "gin" ("text_search") WHERE ("block_type" = 'text'::"text");



CREATE INDEX "content_nodes_node_type_idx" ON "public"."content_nodes" USING "btree" ("node_type");



CREATE INDEX "content_nodes_owner_idx" ON "public"."content_nodes" USING "btree" ("owner_id");



CREATE INDEX "content_nodes_published_idx" ON "public"."content_nodes" USING "btree" ("id") WHERE ("state" = 'published'::"text");



CREATE INDEX "content_nodes_published_state_idx" ON "public"."content_nodes" USING "btree" ("id") WHERE ("state" = 'published'::"text");



CREATE INDEX "content_nodes_slug_idx" ON "public"."content_nodes" USING "btree" ("slug");



CREATE INDEX "content_nodes_state_idx" ON "public"."content_nodes" USING "btree" ("state");



CREATE INDEX "content_nodes_title_lc_idx" ON "public"."content_nodes" USING "btree" ("lower"("title"));



CREATE INDEX "idx_cn_comments_note" ON "public"."coaching_note_comments" USING "btree" ("coaching_note_id");



CREATE INDEX "idx_cn_steps_note" ON "public"."coaching_note_action_steps" USING "btree" ("coaching_note_id");



CREATE INDEX "idx_coaching_notes_coach" ON "public"."coaching_notes_base" USING "btree" ("coach_id");



CREATE INDEX "idx_coaching_notes_user" ON "public"."coaching_notes_base" USING "btree" ("user_id");



CREATE INDEX "idx_content_node_roles_node_id" ON "public"."content_node_roles" USING "btree" ("node_id");



CREATE INDEX "idx_content_node_roles_role_id" ON "public"."content_node_roles" USING "btree" ("role_id", "node_id");



CREATE INDEX "idx_content_nodes_course_visibility" ON "public"."content_nodes" USING "btree" ("node_type", "state", "visibility");



CREATE INDEX "idx_course_sort_orders_sort" ON "public"."course_sort_orders" USING "btree" ("sort_order", "course_node_id");



CREATE INDEX "idx_kpi_metric_types_key" ON "public"."kpi_metric_types" USING "btree" ("key");



CREATE INDEX "idx_meeting_attendance_meeting" ON "public"."meeting_attendance_base" USING "btree" ("meeting_id");



CREATE INDEX "idx_meeting_attendance_user" ON "public"."meeting_attendance_base" USING "btree" ("user_id");



CREATE INDEX "idx_meetings_type_date" ON "public"."meetings" USING "btree" ("meeting_type_id", "date");



CREATE INDEX "idx_mkr_period_desc" ON "public"."monthly_kpi_records_base" USING "btree" ("period_start_date" DESC);



CREATE INDEX "idx_mkr_user" ON "public"."monthly_kpi_records_base" USING "btree" ("user_id");



CREATE INDEX "idx_mkv_record" ON "public"."monthly_kpi_values" USING "btree" ("monthly_kpi_record_id");



CREATE UNIQUE INDEX "idx_monthly_kpi_values_uniq" ON "public"."monthly_kpi_values" USING "btree" ("monthly_kpi_record_id", "metric_type_id");



CREATE INDEX "idx_node_children_child_id" ON "public"."node_children" USING "btree" ("child_id");



CREATE INDEX "idx_profiles_first_name_lower" ON "public"."profiles" USING "btree" ("lower"("first_name"));



CREATE INDEX "idx_profiles_last_name_lower" ON "public"."profiles" USING "btree" ("lower"("last_name"));



CREATE INDEX "idx_resource_access_res" ON "public"."resource_access" USING "btree" ("resource_id");



CREATE INDEX "idx_resource_access_time" ON "public"."resource_access" USING "btree" ("accessed_at" DESC);



CREATE INDEX "idx_resource_tags_res_tag" ON "public"."resource_tags" USING "btree" ("resource_id", "tag_id");



CREATE INDEX "idx_resource_tags_tag_res" ON "public"."resource_tags" USING "btree" ("tag_id", "resource_id");



CREATE INDEX "idx_resources_created_at" ON "public"."resources" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_resources_storage" ON "public"."resources" USING "btree" ("storage_bucket", "storage_path");



CREATE INDEX "idx_resources_tagtext_trgm_ci" ON "public"."resources" USING "gin" ("lower"("tag_text") "public"."gin_trgm_ops");



CREATE INDEX "idx_resources_title_trgm_ci" ON "public"."resources" USING "gin" ("lower"("title") "public"."gin_trgm_ops");



CREATE INDEX "idx_resources_tsv_all_expr" ON "public"."resources" USING "gin" (((("setweight"("to_tsvector"('"simple"'::"regconfig", COALESCE("title", ''::"text")), 'A'::"char") || "setweight"("to_tsvector"('"simple"'::"regconfig", COALESCE("tag_text", ''::"text")), 'B'::"char")) || "setweight"("to_tsvector"('"simple"'::"regconfig", COALESCE("description", ''::"text")), 'C'::"char"))));



CREATE INDEX "idx_resources_type" ON "public"."resources" USING "btree" ("type");



CREATE INDEX "idx_sdp_doc_pos" ON "public"."smart_doc_prompts" USING "btree" ("doc_id", "position");



CREATE INDEX "idx_sdr_content_block" ON "public"."smart_doc_responses" USING "btree" ("content_block_id");



CREATE INDEX "idx_sdr_status_submitted" ON "public"."smart_doc_responses" USING "btree" ("status", "submitted_at") WHERE ("status" = 'submitted'::"text");



CREATE INDEX "idx_sdr_user_status" ON "public"."smart_doc_responses" USING "btree" ("user_id", "status");



CREATE INDEX "idx_sdrv_prompt" ON "public"."smart_doc_response_values" USING "btree" ("prompt_id");



CREATE INDEX "idx_sdrv_response" ON "public"."smart_doc_response_values" USING "btree" ("response_id");



CREATE INDEX "idx_search_analytics_query" ON "public"."search_analytics" USING "btree" ("query");



CREATE INDEX "idx_search_analytics_time" ON "public"."search_analytics" USING "btree" ("searched_at" DESC);



CREATE INDEX "idx_unp_node_status" ON "public"."user_node_progress" USING "btree" ("node_id", "status");



CREATE INDEX "idx_user_assistants_assistant_id" ON "public"."user_assistants" USING "btree" ("assistant_id");



CREATE INDEX "idx_user_assistants_user_id" ON "public"."user_assistants" USING "btree" ("user_id");



CREATE INDEX "idx_user_coaches_coach_user_active" ON "public"."user_coaches" USING "btree" ("coach_id", "user_id", "is_active", "ended_at");



CREATE INDEX "meeting_attendance_meeting_id_idx" ON "public"."meeting_attendance_base" USING "btree" ("meeting_id");



CREATE INDEX "meeting_attendance_user_id_idx" ON "public"."meeting_attendance_base" USING "btree" ("user_id");



CREATE INDEX "meeting_types_counts_toward_engagement_idx" ON "public"."meeting_types" USING "btree" ("counts_toward_engagement");



CREATE UNIQUE INDEX "meetings_ghl_appointment_id_uidx" ON "public"."meetings" USING "btree" ("ghl_appointment_id") WHERE ("ghl_appointment_id" IS NOT NULL);



CREATE INDEX "meetings_meeting_type_date_idx" ON "public"."meetings" USING "btree" ("meeting_type_id", "date");



CREATE INDEX "meetings_starts_at_idx" ON "public"."meetings" USING "btree" ("starts_at") WHERE ("starts_at" IS NOT NULL);



CREATE INDEX "monthly_kpi_records_last_updated_idx" ON "public"."monthly_kpi_records_base" USING "btree" ("last_updated_at" DESC);



CREATE INDEX "monthly_kpi_records_user_period_idx" ON "public"."monthly_kpi_records_base" USING "btree" ("user_id", "period_start_date" DESC);



CREATE INDEX "monthly_kpi_values_metric_idx" ON "public"."monthly_kpi_values" USING "btree" ("metric_type_id");



CREATE INDEX "monthly_kpi_values_record_idx" ON "public"."monthly_kpi_values" USING "btree" ("monthly_kpi_record_id");



CREATE INDEX "node_children_child_id_idx" ON "public"."node_children" USING "btree" ("child_id", "position", "parent_id");



CREATE INDEX "node_children_parent_pos_idx" ON "public"."node_children" USING "btree" ("parent_id", "position");



CREATE INDEX "resources_state_idx" ON "public"."resources" USING "btree" ("state");



CREATE INDEX "resources_tag_text_trgm_idx" ON "public"."resources" USING "gin" ("lower"("tag_text") "public"."gin_trgm_ops");



CREATE INDEX "resources_title_trgm_idx" ON "public"."resources" USING "gin" ("title" "public"."gin_trgm_ops");



CREATE INDEX "resources_tsv_all_idx" ON "public"."resources" USING "gin" ("tsv_all");



CREATE INDEX "resources_tsv_simple_idx" ON "public"."resources" USING "gin" ("tsv_simple");



CREATE UNIQUE INDEX "system_scorecard_templates_one_active_per_audience_idx" ON "public"."system_scorecard_templates" USING "btree" ("audience") WHERE ("is_active" = true);



CREATE UNIQUE INDEX "tags_name_lower_unique" ON "public"."tags" USING "btree" ("lower"("name"));



CREATE UNIQUE INDEX "uniq_resources_url" ON "public"."resources" USING "btree" ("url");



CREATE UNIQUE INDEX "uq_monthly_kpi_values_record_metric" ON "public"."monthly_kpi_values" USING "btree" ("monthly_kpi_record_id", "metric_type_id");



CREATE UNIQUE INDEX "uq_user_assistants_active_pair" ON "public"."user_assistants" USING "btree" ("user_id", "assistant_id") WHERE "is_active";



CREATE INDEX "user_achievements_achieved_idx" ON "public"."user_achievements" USING "btree" ("achievement_id", "achieved_at");



CREATE INDEX "user_achievements_user_idx" ON "public"."user_achievements" USING "btree" ("user_id");



CREATE INDEX "user_attention_status_log_changed_by_idx" ON "public"."user_attention_status_log" USING "btree" ("changed_by", "changed_at" DESC);



CREATE INDEX "user_attention_status_log_user_id_idx" ON "public"."user_attention_status_log" USING "btree" ("user_id", "changed_at" DESC);



CREATE INDEX "user_course_visibility_course_idx" ON "public"."user_course_visibility" USING "btree" ("course_node_id");



CREATE INDEX "user_course_visibility_user_idx" ON "public"."user_course_visibility" USING "btree" ("user_id");



CREATE INDEX "user_merge_log_dest_idx" ON "public"."user_merge_log" USING "btree" ("dest_user_id");



CREATE INDEX "user_merge_log_finished_idx" ON "public"."user_merge_log" USING "btree" ("finished_at");



CREATE INDEX "user_merge_log_source_idx" ON "public"."user_merge_log" USING "btree" ("source_user_id");



CREATE INDEX "user_merge_log_started_idx" ON "public"."user_merge_log" USING "btree" ("started_at");



CREATE INDEX "user_training_assignments_course_active" ON "public"."user_training_assignments" USING "btree" ("course_node_id", "user_id") WHERE ("ended_at" IS NULL);



CREATE INDEX "user_training_assignments_member_history" ON "public"."user_training_assignments" USING "btree" ("user_id", "assigned_at" DESC);



CREATE UNIQUE INDEX "user_training_assignments_one_active_per_cycle" ON "public"."user_training_assignments" USING "btree" ("user_id", "coaching_note_id") WHERE ("ended_at" IS NULL);



CREATE INDEX "wins_added_by_idx" ON "public"."wins" USING "btree" ("added_by");



CREATE INDEX "wins_user_idx" ON "public"."wins" USING "btree" ("user_id");



CREATE INDEX "zoom_attendance_aliases_user_id_idx" ON "public"."zoom_attendance_aliases" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "_canon_user_att" BEFORE INSERT OR UPDATE ON "public"."meeting_attendance_base" FOR EACH ROW EXECUTE FUNCTION "public"."_canon_user_att"();



CREATE OR REPLACE TRIGGER "_canon_user_kpis" BEFORE INSERT OR UPDATE ON "public"."monthly_kpi_records_base" FOR EACH ROW EXECUTE FUNCTION "public"."_canon_user_kpis"();



CREATE OR REPLACE TRIGGER "_canon_user_notes" BEFORE INSERT OR UPDATE ON "public"."coaching_notes_base" FOR EACH ROW EXECUTE FUNCTION "public"."_canon_user_notes"();



CREATE OR REPLACE TRIGGER "_v_cn_del" INSTEAD OF DELETE ON "public"."coaching_notes" FOR EACH ROW EXECUTE FUNCTION "public"."_v_cn_del"();



CREATE OR REPLACE TRIGGER "_v_cn_ins" INSTEAD OF INSERT ON "public"."coaching_notes" FOR EACH ROW EXECUTE FUNCTION "public"."_v_cn_ins"();



CREATE OR REPLACE TRIGGER "_v_cn_upd" INSTEAD OF UPDATE ON "public"."coaching_notes" FOR EACH ROW EXECUTE FUNCTION "public"."_v_cn_upd"();



CREATE OR REPLACE TRIGGER "_v_ma_del" INSTEAD OF DELETE ON "public"."meeting_attendance" FOR EACH ROW EXECUTE FUNCTION "public"."_v_ma_del"();



CREATE OR REPLACE TRIGGER "_v_ma_ins" INSTEAD OF INSERT ON "public"."meeting_attendance" FOR EACH ROW EXECUTE FUNCTION "public"."_v_ma_ins"();



CREATE OR REPLACE TRIGGER "_v_ma_upd" INSTEAD OF UPDATE ON "public"."meeting_attendance" FOR EACH ROW EXECUTE FUNCTION "public"."_v_ma_upd"();



CREATE OR REPLACE TRIGGER "_v_mkr_del" INSTEAD OF DELETE ON "public"."monthly_kpi_records" FOR EACH ROW EXECUTE FUNCTION "public"."_v_mkr_del"();



CREATE OR REPLACE TRIGGER "_v_mkr_ins" INSTEAD OF INSERT ON "public"."monthly_kpi_records" FOR EACH ROW EXECUTE FUNCTION "public"."_v_mkr_ins"();



CREATE OR REPLACE TRIGGER "_v_mkr_upd" INSTEAD OF UPDATE ON "public"."monthly_kpi_records" FOR EACH ROW EXECUTE FUNCTION "public"."_v_mkr_upd"();



CREATE OR REPLACE TRIGGER "business_review_focus_values_touch_updated_at" BEFORE UPDATE ON "public"."business_review_focus_values" FOR EACH ROW EXECUTE FUNCTION "public"."business_audit_set_updated_at_20260729"();



CREATE OR REPLACE TRIGGER "business_review_system_ratings_touch_updated_at" BEFORE UPDATE ON "public"."business_review_system_ratings" FOR EACH ROW EXECUTE FUNCTION "public"."business_audit_set_updated_at_20260729"();



CREATE OR REPLACE TRIGGER "business_reviews_touch_updated_at" BEFORE UPDATE ON "public"."business_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."business_audit_set_updated_at_20260729"();



CREATE OR REPLACE TRIGGER "coaching_note_action_step_sync_priority_completion" AFTER UPDATE OF "status" ON "public"."coaching_note_action_steps" FOR EACH ROW WHEN ((("new"."status" = 'complete'::"public"."action_step_status") AND ("old"."status" IS DISTINCT FROM "new"."status"))) EXECUTE FUNCTION "public"."sync_priority_system_from_action_step_completion"();



CREATE OR REPLACE TRIGGER "coaching_note_action_steps_touch_updated_at" BEFORE UPDATE ON "public"."coaching_note_action_steps" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "coaching_notes_touch_updated_at" BEFORE UPDATE ON "public"."coaching_notes_base" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "focus_finder_dimensions_touch_updated_at" BEFORE UPDATE ON "public"."focus_finder_dimensions" FOR EACH ROW EXECUTE FUNCTION "public"."business_audit_set_updated_at_20260729"();



CREATE OR REPLACE TRIGGER "focus_finder_templates_touch_updated_at" BEFORE UPDATE ON "public"."focus_finder_templates" FOR EACH ROW EXECUTE FUNCTION "public"."business_audit_set_updated_at_20260729"();



CREATE OR REPLACE TRIGGER "grant_assigned_training_access" AFTER INSERT ON "public"."user_training_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."grant_assigned_training_access"();



CREATE OR REPLACE TRIGGER "meetings_remove_cancelled_ghl_attendance" AFTER INSERT OR UPDATE OF "ghl_status" ON "public"."meetings" FOR EACH ROW EXECUTE FUNCTION "public"."remove_cancelled_ghl_meeting_attendance"();



CREATE OR REPLACE TRIGGER "propagate_scorecard_system_library_item" AFTER UPDATE OF "library_item_id" ON "public"."system_scorecard_systems" FOR EACH ROW WHEN (("old"."library_item_id" IS DISTINCT FROM "new"."library_item_id")) EXECUTE FUNCTION "public"."propagate_scorecard_system_library_item"();



CREATE OR REPLACE TRIGGER "sync_scorecard_priority_action_step_library_item" AFTER INSERT OR UPDATE OF "system_id", "action_step_id" ON "public"."business_review_system_priorities" FOR EACH ROW EXECUTE FUNCTION "public"."sync_scorecard_priority_action_step_library_item"();



CREATE OR REPLACE TRIGGER "system_scorecard_categories_touch_updated_at" BEFORE UPDATE ON "public"."system_scorecard_categories" FOR EACH ROW EXECUTE FUNCTION "public"."business_audit_set_updated_at_20260729"();



CREATE OR REPLACE TRIGGER "system_scorecard_systems_touch_updated_at" BEFORE UPDATE ON "public"."system_scorecard_systems" FOR EACH ROW EXECUTE FUNCTION "public"."business_audit_set_updated_at_20260729"();



CREATE OR REPLACE TRIGGER "system_scorecard_templates_touch_updated_at" BEFORE UPDATE ON "public"."system_scorecard_templates" FOR EACH ROW EXECUTE FUNCTION "public"."business_audit_set_updated_at_20260729"();



CREATE OR REPLACE TRIGGER "trg_achievements_touch_updated" BEFORE UPDATE ON "public"."achievements" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_award_on_node_swap_complete" AFTER UPDATE OF "library_item_id" ON "public"."coaching_note_action_steps" FOR EACH ROW WHEN ((("new"."status" = 'complete'::"public"."action_step_status") AND ("old"."status" = 'complete'::"public"."action_step_status") AND ("old"."library_item_id" IS DISTINCT FROM "new"."library_item_id") AND ("new"."library_item_id" IS NOT NULL))) EXECUTE FUNCTION "public"."award_achievements_on_action_step"();



CREATE OR REPLACE TRIGGER "trg_award_on_step_insert_complete" AFTER INSERT ON "public"."coaching_note_action_steps" FOR EACH ROW WHEN ((("new"."status" = 'complete'::"public"."action_step_status") AND ("new"."library_item_id" IS NOT NULL))) EXECUTE FUNCTION "public"."award_achievements_on_action_step"();



CREATE OR REPLACE TRIGGER "trg_award_on_step_update_complete" AFTER UPDATE OF "status" ON "public"."coaching_note_action_steps" FOR EACH ROW WHEN ((("new"."status" = 'complete'::"public"."action_step_status") AND ("old"."status" IS DISTINCT FROM 'complete'::"public"."action_step_status") AND ("new"."library_item_id" IS NOT NULL))) EXECUTE FUNCTION "public"."award_achievements_on_action_step"();



CREATE OR REPLACE TRIGGER "trg_cb_guard_smartdoc_publish_consistency" BEFORE INSERT OR UPDATE ON "public"."content_blocks" FOR EACH ROW EXECUTE FUNCTION "public"."cb_guard_smartdoc_publish_consistency"();



CREATE OR REPLACE TRIGGER "trg_cn_autoslug" BEFORE INSERT OR UPDATE OF "title", "slug" ON "public"."content_nodes" FOR EACH ROW EXECUTE FUNCTION "public"."cn_autoslug"();



CREATE OR REPLACE TRIGGER "trg_cn_sequential_unlock_flip" AFTER UPDATE OF "sequential_unlock" ON "public"."content_nodes" FOR EACH ROW EXECUTE FUNCTION "public"."cn_sequential_unlock_flip_trg"();



CREATE OR REPLACE TRIGGER "trg_cn_state_cascade" AFTER UPDATE OF "state" ON "public"."content_nodes" FOR EACH ROW EXECUTE FUNCTION "public"."cn_state_cascade_trg"();



CREATE OR REPLACE TRIGGER "trg_content_node_roles_course_only" BEFORE INSERT OR UPDATE ON "public"."content_node_roles" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_content_node_roles_course_only"();



CREATE OR REPLACE TRIGGER "trg_course_sort_orders_guard" BEFORE INSERT OR UPDATE ON "public"."course_sort_orders" FOR EACH ROW EXECUTE FUNCTION "public"."_course_sort_orders_guard"();



CREATE OR REPLACE TRIGGER "trg_enforce_content_blocks_shape" BEFORE INSERT OR UPDATE ON "public"."content_blocks" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_content_blocks_shape"();



CREATE OR REPLACE TRIGGER "trg_enforce_node_children_rules" BEFORE INSERT OR UPDATE ON "public"."node_children" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_node_children_rules"();



CREATE OR REPLACE TRIGGER "trg_enforce_playlist_published_assets" BEFORE INSERT OR UPDATE ON "public"."content_blocks" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_playlist_published_assets"();



CREATE OR REPLACE TRIGGER "trg_enforce_single_active_partnership_per_domain" BEFORE INSERT OR UPDATE ON "public"."partnership_users" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_single_active_partnership_per_domain"();



CREATE OR REPLACE TRIGGER "trg_meeting_attendance_set_updated_at" BEFORE UPDATE ON "public"."meeting_attendance_base" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_meeting_types_set_updated_at" BEFORE UPDATE ON "public"."meeting_types" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_meetings_set_updated_at" BEFORE UPDATE ON "public"."meetings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_nc_default_seq_unlock_on_attach" AFTER INSERT ON "public"."node_children" FOR EACH ROW EXECUTE FUNCTION "public"."nc_default_seq_unlock_on_attach"();



CREATE OR REPLACE TRIGGER "trg_nc_sibling_slug_unique" AFTER INSERT OR UPDATE OF "parent_id", "child_id" ON "public"."node_children" FOR EACH ROW EXECUTE FUNCTION "public"."nc_enforce_sibling_slug_unique"();



CREATE OR REPLACE TRIGGER "trg_recompute_attendance" AFTER INSERT OR DELETE OR UPDATE ON "public"."meeting_attendance_base" FOR EACH ROW EXECUTE FUNCTION "public"."recompute_on_meeting_attendance_change"();



CREATE OR REPLACE TRIGGER "trg_recompute_on_manual_clear" AFTER UPDATE OF "attention_status_manual" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."recompute_if_manual_cleared"();



CREATE OR REPLACE TRIGGER "trg_resources_set_redirect_url" BEFORE INSERT OR UPDATE ON "public"."resources" FOR EACH ROW EXECUTE FUNCTION "public"."set_resources_redirect_url"();



CREATE OR REPLACE TRIGGER "trg_revoke_on_node_swap_complete" AFTER UPDATE OF "library_item_id" ON "public"."coaching_note_action_steps" FOR EACH ROW WHEN ((("new"."status" = 'complete'::"public"."action_step_status") AND ("old"."status" = 'complete'::"public"."action_step_status") AND ("old"."library_item_id" IS DISTINCT FROM "new"."library_item_id") AND ("old"."library_item_id" IS NOT NULL))) EXECUTE FUNCTION "public"."revoke_achievements_on_action_step"();



CREATE OR REPLACE TRIGGER "trg_revoke_on_step_uncomplete" AFTER UPDATE OF "status" ON "public"."coaching_note_action_steps" FOR EACH ROW WHEN ((("old"."status" = 'complete'::"public"."action_step_status") AND ("new"."status" IS DISTINCT FROM 'complete'::"public"."action_step_status") AND ("old"."library_item_id" IS NOT NULL))) EXECUTE FUNCTION "public"."revoke_achievements_on_action_step"();



CREATE OR REPLACE TRIGGER "trg_rt_refresh_tag_text" AFTER INSERT OR DELETE OR UPDATE ON "public"."resource_tags" FOR EACH ROW EXECUTE FUNCTION "public"."_rt_after_change_refresh_tag_text"();



CREATE OR REPLACE TRIGGER "trg_tags_refresh_dependents" AFTER UPDATE ON "public"."tags" FOR EACH ROW EXECUTE FUNCTION "public"."_tags_after_update_refresh_dependents"();



CREATE OR REPLACE TRIGGER "trg_touch_content_blocks" BEFORE UPDATE ON "public"."content_blocks" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_touch_content_nodes" BEFORE UPDATE ON "public"."content_nodes" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_touch_sdr" BEFORE UPDATE ON "public"."smart_doc_responses" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_touch_sdrv" BEFORE UPDATE ON "public"."smart_doc_response_values" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_touch_site_announcements_updated_at" BEFORE UPDATE ON "public"."site_announcements" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_touch_smart_docs" BEFORE UPDATE ON "public"."smart_docs" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_touch_user_node_progress" BEFORE UPDATE ON "public"."user_node_progress" FOR EACH ROW EXECUTE FUNCTION "public"."trg_touch_user_node_progress"();



CREATE OR REPLACE TRIGGER "trg_user_assistants_assistant_role" BEFORE INSERT OR UPDATE OF "assistant_id", "is_active" ON "public"."user_assistants" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_user_assistants_assistant_role"();



CREATE OR REPLACE TRIGGER "trg_who_sdr" BEFORE INSERT OR UPDATE ON "public"."smart_doc_responses" FOR EACH ROW EXECUTE FUNCTION "public"."set_row_who_cols"();



CREATE OR REPLACE TRIGGER "trg_who_sdrv" BEFORE INSERT OR UPDATE ON "public"."smart_doc_response_values" FOR EACH ROW EXECUTE FUNCTION "public"."set_row_who_cols"();



CREATE OR REPLACE TRIGGER "update_resources_updated_at" BEFORE UPDATE ON "public"."resources" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "validate_user_training_assignment" BEFORE INSERT OR UPDATE OF "user_id", "course_node_id", "coaching_note_id", "context_label" ON "public"."user_training_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."validate_user_training_assignment"();



ALTER TABLE ONLY "public"."achievement_node_map"
    ADD CONSTRAINT "achievement_node_map_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."achievement_node_map"
    ADD CONSTRAINT "achievement_node_map_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "public"."content_nodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_review_focus_values"
    ADD CONSTRAINT "business_review_focus_values_dimension_template_fkey" FOREIGN KEY ("dimension_id", "template_key") REFERENCES "public"."focus_finder_dimensions"("id", "template_key") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."business_review_focus_values"
    ADD CONSTRAINT "business_review_focus_values_review_template_fkey" FOREIGN KEY ("business_review_id", "template_key") REFERENCES "public"."business_reviews"("id", "focus_finder_template_key") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_review_focus_values"
    ADD CONSTRAINT "business_review_focus_values_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."business_review_preparation_responses"
    ADD CONSTRAINT "business_review_preparation_responses_business_review_id_fkey" FOREIGN KEY ("business_review_id") REFERENCES "public"."business_reviews"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_review_system_priorities"
    ADD CONSTRAINT "business_review_system_priorities_action_step_id_fkey" FOREIGN KEY ("action_step_id") REFERENCES "public"."coaching_note_action_steps"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_review_system_priorities"
    ADD CONSTRAINT "business_review_system_priorities_rating_fkey" FOREIGN KEY ("business_review_id", "system_id") REFERENCES "public"."business_review_system_ratings"("business_review_id", "system_id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_review_system_priorities"
    ADD CONSTRAINT "business_review_system_priorities_selected_by_fkey" FOREIGN KEY ("selected_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."business_review_system_ratings"
    ADD CONSTRAINT "business_review_system_ratings_review_template_fkey" FOREIGN KEY ("business_review_id", "template_key") REFERENCES "public"."business_reviews"("id", "system_scorecard_template_key") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_review_system_ratings"
    ADD CONSTRAINT "business_review_system_ratings_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."business_review_system_ratings"
    ADD CONSTRAINT "business_review_system_ratings_system_template_fkey" FOREIGN KEY ("system_id", "template_key") REFERENCES "public"."system_scorecard_systems"("id", "template_key") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."business_review_system_ratings"
    ADD CONSTRAINT "business_review_system_ratings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."business_reviews"
    ADD CONSTRAINT "business_reviews_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."business_reviews"
    ADD CONSTRAINT "business_reviews_coaching_note_id_fkey" FOREIGN KEY ("coaching_note_id") REFERENCES "public"."coaching_notes_base"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."business_reviews"
    ADD CONSTRAINT "business_reviews_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."business_reviews"
    ADD CONSTRAINT "business_reviews_focus_finder_template_key_fkey" FOREIGN KEY ("focus_finder_template_key") REFERENCES "public"."focus_finder_templates"("key") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."business_reviews"
    ADD CONSTRAINT "business_reviews_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."business_reviews"
    ADD CONSTRAINT "business_reviews_system_scorecard_template_key_fkey" FOREIGN KEY ("system_scorecard_template_key") REFERENCES "public"."system_scorecard_templates"("key") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."business_reviews"
    ADD CONSTRAINT "business_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_profiles"
    ADD CONSTRAINT "coach_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coaching_note_action_steps"
    ADD CONSTRAINT "coaching_note_action_steps_coaching_note_id_fkey" FOREIGN KEY ("coaching_note_id") REFERENCES "public"."coaching_notes_base"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coaching_note_action_steps"
    ADD CONSTRAINT "coaching_note_action_steps_library_item_id_fkey" FOREIGN KEY ("library_item_id") REFERENCES "public"."content_nodes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coaching_note_comments"
    ADD CONSTRAINT "coaching_note_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coaching_note_comments"
    ADD CONSTRAINT "coaching_note_comments_coaching_note_id_fkey" FOREIGN KEY ("coaching_note_id") REFERENCES "public"."coaching_notes_base"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coaching_notes_base"
    ADD CONSTRAINT "coaching_notes_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coaching_notes_base"
    ADD CONSTRAINT "coaching_notes_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coaching_notes_base"
    ADD CONSTRAINT "coaching_notes_m2_meeting_id_fkey" FOREIGN KEY ("m2_meeting_id") REFERENCES "public"."meetings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coaching_notes_base"
    ADD CONSTRAINT "coaching_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coaching_private_notes"
    ADD CONSTRAINT "coaching_private_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coaching_private_notes"
    ADD CONSTRAINT "coaching_private_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_blocks"
    ADD CONSTRAINT "content_blocks_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "public"."content_nodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_blocks"
    ADD CONSTRAINT "content_blocks_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_blocks"
    ADD CONSTRAINT "content_blocks_smart_doc_id_fkey" FOREIGN KEY ("smart_doc_id") REFERENCES "public"."smart_docs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_node_roles"
    ADD CONSTRAINT "content_node_roles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_node_roles"
    ADD CONSTRAINT "content_node_roles_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "public"."content_nodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_node_roles"
    ADD CONSTRAINT "content_node_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_node_tags"
    ADD CONSTRAINT "content_node_tags_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "public"."content_nodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_node_tags"
    ADD CONSTRAINT "content_node_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_nodes"
    ADD CONSTRAINT "content_nodes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_nodes"
    ADD CONSTRAINT "content_nodes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_nodes"
    ADD CONSTRAINT "content_nodes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."course_sort_orders"
    ADD CONSTRAINT "course_sort_orders_course_node_id_fkey" FOREIGN KEY ("course_node_id") REFERENCES "public"."content_nodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_sort_orders"
    ADD CONSTRAINT "course_sort_orders_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."focus_finder_dimensions"
    ADD CONSTRAINT "focus_finder_dimensions_library_item_id_fkey" FOREIGN KEY ("library_item_id") REFERENCES "public"."content_nodes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."focus_finder_dimensions"
    ADD CONSTRAINT "focus_finder_dimensions_template_key_fkey" FOREIGN KEY ("template_key") REFERENCES "public"."focus_finder_templates"("key") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."meeting_attendance_base"
    ADD CONSTRAINT "meeting_attendance_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_attendance_base"
    ADD CONSTRAINT "meeting_attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_meeting_type_id_fkey" FOREIGN KEY ("meeting_type_id") REFERENCES "public"."meeting_types"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."monthly_kpi_records_base"
    ADD CONSTRAINT "monthly_kpi_records_last_updated_by_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."monthly_kpi_records_base"
    ADD CONSTRAINT "monthly_kpi_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."monthly_kpi_values"
    ADD CONSTRAINT "monthly_kpi_values_metric_type_id_fkey" FOREIGN KEY ("metric_type_id") REFERENCES "public"."kpi_metric_types"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."monthly_kpi_values"
    ADD CONSTRAINT "monthly_kpi_values_monthly_kpi_record_id_fkey" FOREIGN KEY ("monthly_kpi_record_id") REFERENCES "public"."monthly_kpi_records_base"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."node_children"
    ADD CONSTRAINT "node_children_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."content_nodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."node_children"
    ADD CONSTRAINT "node_children_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."content_nodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partnership_users"
    ADD CONSTRAINT "partnership_users_partnership_id_fkey" FOREIGN KEY ("partnership_id") REFERENCES "public"."partnerships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partnership_users"
    ADD CONSTRAINT "partnership_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_attention_status_updated_by_fkey" FOREIGN KEY ("attention_status_updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resource_access"
    ADD CONSTRAINT "resource_access_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resource_access"
    ADD CONSTRAINT "resource_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resource_tags"
    ADD CONSTRAINT "resource_tags_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resource_tags"
    ADD CONSTRAINT "resource_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."search_analytics"
    ADD CONSTRAINT "search_analytics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."smart_doc_prompts"
    ADD CONSTRAINT "smart_doc_prompts_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "public"."smart_docs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."smart_doc_response_values"
    ADD CONSTRAINT "smart_doc_response_values_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "public"."smart_doc_prompts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."smart_doc_response_values"
    ADD CONSTRAINT "smart_doc_response_values_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "public"."smart_doc_responses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."smart_doc_responses"
    ADD CONSTRAINT "smart_doc_responses_content_block_id_fkey" FOREIGN KEY ("content_block_id") REFERENCES "public"."content_blocks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."smart_doc_responses"
    ADD CONSTRAINT "smart_doc_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."smart_docs"
    ADD CONSTRAINT "smart_docs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."system_scorecard_categories"
    ADD CONSTRAINT "system_scorecard_categories_template_key_fkey" FOREIGN KEY ("template_key") REFERENCES "public"."system_scorecard_templates"("key") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."system_scorecard_systems"
    ADD CONSTRAINT "system_scorecard_systems_category_template_fkey" FOREIGN KEY ("category_id", "template_key") REFERENCES "public"."system_scorecard_categories"("id", "template_key") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."system_scorecard_systems"
    ADD CONSTRAINT "system_scorecard_systems_library_item_id_fkey" FOREIGN KEY ("library_item_id") REFERENCES "public"."content_nodes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."system_scorecard_systems"
    ADD CONSTRAINT "system_scorecard_systems_template_key_fkey" FOREIGN KEY ("template_key") REFERENCES "public"."system_scorecard_templates"("key") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."system_scorecard_version_migrations"
    ADD CONSTRAINT "system_scorecard_version_migrations_business_review_id_fkey" FOREIGN KEY ("business_review_id") REFERENCES "public"."business_reviews"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_scorecard_version_migrations"
    ADD CONSTRAINT "system_scorecard_version_migrations_from_template_key_fkey" FOREIGN KEY ("from_template_key") REFERENCES "public"."system_scorecard_templates"("key") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."system_scorecard_version_migrations"
    ADD CONSTRAINT "system_scorecard_version_migrations_migrated_by_fkey" FOREIGN KEY ("migrated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."system_scorecard_version_migrations"
    ADD CONSTRAINT "system_scorecard_version_migrations_to_template_key_fkey" FOREIGN KEY ("to_template_key") REFERENCES "public"."system_scorecard_templates"("key") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_assistants"
    ADD CONSTRAINT "user_assistants_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."user_assistants"
    ADD CONSTRAINT "user_assistants_assistant_id_fkey" FOREIGN KEY ("assistant_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_assistants"
    ADD CONSTRAINT "user_assistants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_attention_status_log"
    ADD CONSTRAINT "user_attention_status_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_attention_status_log"
    ADD CONSTRAINT "user_attention_status_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_coaches"
    ADD CONSTRAINT "user_coaches_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_coaches"
    ADD CONSTRAINT "user_coaches_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_coaches"
    ADD CONSTRAINT "user_coaches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_course_visibility"
    ADD CONSTRAINT "user_course_visibility_course_node_id_fkey" FOREIGN KEY ("course_node_id") REFERENCES "public"."content_nodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_course_visibility"
    ADD CONSTRAINT "user_course_visibility_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_merge_log"
    ADD CONSTRAINT "user_merge_log_dest_user_id_fkey" FOREIGN KEY ("dest_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_merge_log"
    ADD CONSTRAINT "user_merge_log_source_user_id_fkey" FOREIGN KEY ("source_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_node_progress"
    ADD CONSTRAINT "user_node_progress_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "public"."content_nodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_node_progress"
    ADD CONSTRAINT "user_node_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_training_assignments"
    ADD CONSTRAINT "user_training_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_training_assignments"
    ADD CONSTRAINT "user_training_assignments_coaching_note_id_fkey" FOREIGN KEY ("coaching_note_id") REFERENCES "public"."coaching_notes_base"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_training_assignments"
    ADD CONSTRAINT "user_training_assignments_course_node_id_fkey" FOREIGN KEY ("course_node_id") REFERENCES "public"."content_nodes"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."user_training_assignments"
    ADD CONSTRAINT "user_training_assignments_ended_by_fkey" FOREIGN KEY ("ended_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_training_assignments"
    ADD CONSTRAINT "user_training_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wins"
    ADD CONSTRAINT "wins_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wins"
    ADD CONSTRAINT "wins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zoom_attendance_aliases"
    ADD CONSTRAINT "zoom_attendance_aliases_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."zoom_attendance_aliases"
    ADD CONSTRAINT "zoom_attendance_aliases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can delete resource tags" ON "public"."resource_tags" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "Admins can delete resources" ON "public"."resources" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "Admins can delete tags" ON "public"."tags" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "Admins can insert resource tags" ON "public"."resource_tags" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can insert resources" ON "public"."resources" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can insert tags" ON "public"."tags" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage all action steps" ON "public"."coaching_note_action_steps" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."code" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."code" = 'admin'::"text")))));



CREATE POLICY "Admins can manage all coaching note comments" ON "public"."coaching_note_comments" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."code" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."code" = 'admin'::"text")))));



CREATE POLICY "Admins can manage all coaching notes" ON "public"."coaching_notes_base" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."code" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."code" = 'admin'::"text")))));



CREATE POLICY "Admins can manage all wins" ON "public"."wins" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."code" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."code" = 'admin'::"text")))));



CREATE POLICY "Admins can update resource tags" ON "public"."resource_tags" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can update resources" ON "public"."resources" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can update tags" ON "public"."tags" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage announcements (delete)" ON "public"."site_announcements" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "Admins manage announcements (insert)" ON "public"."site_announcements" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage announcements (update)" ON "public"."site_announcements" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins read resource access" ON "public"."resource_access" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins read search analytics" ON "public"."search_analytics" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Announcements are readable by all" ON "public"."site_announcements" FOR SELECT USING (true);



CREATE POLICY "Coaches can manage action steps for coachees" ON "public"."coaching_note_action_steps" USING ((EXISTS ( SELECT 1
   FROM ("public"."coaching_notes_base" "cn"
     JOIN "public"."user_coaches" "uc" ON (("uc"."user_id" = "cn"."user_id")))
  WHERE (("cn"."id" = "coaching_note_action_steps"."coaching_note_id") AND ("cn"."deleted_at" IS NULL) AND ("uc"."coach_id" = "auth"."uid"()) AND COALESCE("uc"."is_active", true) AND (("uc"."ended_at" IS NULL) OR ("uc"."ended_at" > "now"())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."coaching_notes_base" "cn"
     JOIN "public"."user_coaches" "uc" ON (("uc"."user_id" = "cn"."user_id")))
  WHERE (("cn"."id" = "coaching_note_action_steps"."coaching_note_id") AND ("cn"."deleted_at" IS NULL) AND ("uc"."coach_id" = "auth"."uid"()) AND COALESCE("uc"."is_active", true) AND (("uc"."ended_at" IS NULL) OR ("uc"."ended_at" > "now"()))))));



CREATE POLICY "Coaches can manage coaching notes for their coachees" ON "public"."coaching_notes_base" USING ((("deleted_at" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."user_coaches" "uc"
  WHERE (("uc"."coach_id" = "auth"."uid"()) AND ("uc"."user_id" = "coaching_notes_base"."user_id") AND COALESCE("uc"."is_active", true) AND (("uc"."ended_at" IS NULL) OR ("uc"."ended_at" > "now"()))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_coaches" "uc"
  WHERE (("uc"."coach_id" = "auth"."uid"()) AND ("uc"."user_id" = "coaching_notes_base"."user_id") AND COALESCE("uc"."is_active", true) AND (("uc"."ended_at" IS NULL) OR ("uc"."ended_at" > "now"()))))));



CREATE POLICY "Coaches can manage comments for coachees" ON "public"."coaching_note_comments" USING ((EXISTS ( SELECT 1
   FROM ("public"."coaching_notes_base" "cn"
     JOIN "public"."user_coaches" "uc" ON (("uc"."user_id" = "cn"."user_id")))
  WHERE (("cn"."id" = "coaching_note_comments"."coaching_note_id") AND ("cn"."deleted_at" IS NULL) AND ("uc"."coach_id" = "auth"."uid"()) AND COALESCE("uc"."is_active", true) AND (("uc"."ended_at" IS NULL) OR ("uc"."ended_at" > "now"())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."coaching_notes_base" "cn"
     JOIN "public"."user_coaches" "uc" ON (("uc"."user_id" = "cn"."user_id")))
  WHERE (("cn"."id" = "coaching_note_comments"."coaching_note_id") AND ("cn"."deleted_at" IS NULL) AND ("uc"."coach_id" = "auth"."uid"()) AND COALESCE("uc"."is_active", true) AND (("uc"."ended_at" IS NULL) OR ("uc"."ended_at" > "now"()))))));



CREATE POLICY "Coaches can manage wins for coachees" ON "public"."wins" USING ((EXISTS ( SELECT 1
   FROM "public"."user_coaches" "uc"
  WHERE (("uc"."coach_id" = "auth"."uid"()) AND ("uc"."user_id" = "wins"."user_id") AND COALESCE("uc"."is_active", true) AND (("uc"."ended_at" IS NULL) OR ("uc"."ended_at" > "now"())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_coaches" "uc"
  WHERE (("uc"."coach_id" = "auth"."uid"()) AND ("uc"."user_id" = "wins"."user_id") AND COALESCE("uc"."is_active", true) AND (("uc"."ended_at" IS NULL) OR ("uc"."ended_at" > "now"()))))));



CREATE POLICY "Everyone can view tags" ON "public"."tags" FOR SELECT USING (true);



CREATE POLICY "Members can delete their own wins" ON "public"."wins" FOR DELETE USING ((("user_id" = "auth"."uid"()) AND ("added_by" = "auth"."uid"())));



CREATE POLICY "Members can insert wins for themselves" ON "public"."wins" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ("added_by" = "auth"."uid"())));



CREATE POLICY "Members can read action steps for their notes" ON "public"."coaching_note_action_steps" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."coaching_notes_base" "cn"
  WHERE (("cn"."id" = "coaching_note_action_steps"."coaching_note_id") AND ("cn"."user_id" = "auth"."uid"()) AND ("cn"."deleted_at" IS NULL)))));



CREATE POLICY "Members can read comments for their notes" ON "public"."coaching_note_comments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."coaching_notes_base" "cn"
  WHERE (("cn"."id" = "coaching_note_comments"."coaching_note_id") AND ("cn"."user_id" = "auth"."uid"()) AND ("cn"."deleted_at" IS NULL)))));



CREATE POLICY "Members can read their own coaching notes" ON "public"."coaching_notes_base" FOR SELECT USING ((("user_id" = "auth"."uid"()) AND ("deleted_at" IS NULL)));



CREATE POLICY "Members can read their own wins" ON "public"."wins" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Members can update action steps for their notes" ON "public"."coaching_note_action_steps" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."coaching_notes_base" "cn"
  WHERE (("cn"."id" = "coaching_note_action_steps"."coaching_note_id") AND ("cn"."user_id" = "auth"."uid"()) AND ("cn"."deleted_at" IS NULL))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."coaching_notes_base" "cn"
  WHERE (("cn"."id" = "coaching_note_action_steps"."coaching_note_id") AND ("cn"."user_id" = "auth"."uid"()) AND ("cn"."deleted_at" IS NULL)))));



CREATE POLICY "Members can update their own wins" ON "public"."wins" FOR UPDATE USING ((("user_id" = "auth"."uid"()) AND ("added_by" = "auth"."uid"()))) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("added_by" = "auth"."uid"())));



CREATE POLICY "Staff manage course visibility" ON "public"."user_course_visibility" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."code" = ANY (ARRAY['admin'::"text", 'coach'::"text", 'implementation_coach'::"text", 'superadmin'::"text"]))))));



CREATE POLICY "Users can insert resource access" ON "public"."resource_access" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert search analytics" ON "public"."search_analytics" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users read own resource access" ON "public"."resource_access" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users read own search analytics" ON "public"."search_analytics" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users see their own course visibility" ON "public"."user_course_visibility" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."achievement_node_map" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."achievements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendance_access" ON "public"."meeting_attendance_base" USING ("public"."can_view_domain_owner"("auth"."uid"(), "user_id", 'attendance'::"public"."share_domain")) WITH CHECK ("public"."can_view_domain_owner"("auth"."uid"(), "user_id", 'attendance'::"public"."share_domain"));



ALTER TABLE "public"."business_review_focus_values" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."business_review_preparation_responses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."business_review_system_priorities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."business_review_system_ratings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."business_reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cblocks_admin_all" ON "public"."content_blocks" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "cblocks_members_read" ON "public"."content_blocks" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."content_nodes" "n"
  WHERE (("n"."id" = "content_blocks"."node_id") AND ((("n"."state" = 'published'::"text") AND (("n"."owner_id" IS NULL) OR ("n"."owner_id" = "auth"."uid"()))) OR (("n"."owner_id" = "auth"."uid"()) AND ("n"."node_type" = 'playlist'::"text"))))))));



CREATE POLICY "cblocks_playlist_owner_all" ON "public"."content_blocks" USING ((EXISTS ( SELECT 1
   FROM "public"."content_nodes" "n"
  WHERE (("n"."id" = "content_blocks"."node_id") AND ("n"."node_type" = 'playlist'::"text") AND ("n"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."content_nodes" "n"
  WHERE (("n"."id" = "content_blocks"."node_id") AND ("n"."node_type" = 'playlist'::"text") AND ("n"."owner_id" = "auth"."uid"())))));



CREATE POLICY "cn_admin_all" ON "public"."content_nodes" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "cn_comments_access" ON "public"."coaching_note_comments" USING ((EXISTS ( SELECT 1
   FROM "public"."coaching_notes_base" "cn"
  WHERE (("cn"."id" = "coaching_note_comments"."coaching_note_id") AND ("cn"."deleted_at" IS NULL) AND "public"."can_view_domain_owner"("auth"."uid"(), "cn"."user_id", 'notes'::"public"."share_domain"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."coaching_notes_base" "cn"
  WHERE (("cn"."id" = "coaching_note_comments"."coaching_note_id") AND ("cn"."deleted_at" IS NULL) AND "public"."can_view_domain_owner"("auth"."uid"(), "cn"."user_id", 'notes'::"public"."share_domain")))));



CREATE POLICY "cn_members_read" ON "public"."content_nodes" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND ((("state" = 'published'::"text") AND (("owner_id" IS NULL) OR ("owner_id" = "auth"."uid"()))) OR (("owner_id" = "auth"."uid"()) AND ("node_type" = 'playlist'::"text")))));



CREATE POLICY "cn_playlist_owner_delete" ON "public"."content_nodes" FOR DELETE USING ((("owner_id" = "auth"."uid"()) AND ("node_type" = 'playlist'::"text")));



CREATE POLICY "cn_playlist_owner_insert" ON "public"."content_nodes" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("owner_id" = "auth"."uid"()) AND ("node_type" = 'playlist'::"text")));



CREATE POLICY "cn_playlist_owner_update" ON "public"."content_nodes" FOR UPDATE USING ((("owner_id" = "auth"."uid"()) AND ("node_type" = 'playlist'::"text"))) WITH CHECK ((("owner_id" = "auth"."uid"()) AND ("node_type" = 'playlist'::"text")));



CREATE POLICY "cn_steps_access" ON "public"."coaching_note_action_steps" USING ((EXISTS ( SELECT 1
   FROM "public"."coaching_notes_base" "cn"
  WHERE (("cn"."id" = "coaching_note_action_steps"."coaching_note_id") AND ("cn"."deleted_at" IS NULL) AND "public"."can_view_domain_owner"("auth"."uid"(), "cn"."user_id", 'notes'::"public"."share_domain"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."coaching_notes_base" "cn"
  WHERE (("cn"."id" = "coaching_note_action_steps"."coaching_note_id") AND ("cn"."deleted_at" IS NULL) AND "public"."can_view_domain_owner"("auth"."uid"(), "cn"."user_id", 'notes'::"public"."share_domain")))));



CREATE POLICY "cntags_admin_all" ON "public"."content_node_tags" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "cntags_members_read" ON "public"."content_node_tags" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."content_nodes" "n"
  WHERE (("n"."id" = "content_node_tags"."node_id") AND ((("n"."state" = 'published'::"text") AND (("n"."owner_id" IS NULL) OR ("n"."owner_id" = "auth"."uid"()))) OR (("n"."owner_id" = "auth"."uid"()) AND ("n"."node_type" = 'playlist'::"text"))))))));



CREATE POLICY "coach/admin delete awards" ON "public"."user_achievements" FOR DELETE USING ((COALESCE("public"."is_coach"(), false) OR COALESCE("public"."is_admin"(), false)));



CREATE POLICY "coach/admin insert awards" ON "public"."user_achievements" FOR INSERT WITH CHECK ((COALESCE("public"."is_coach"(), false) OR COALESCE("public"."is_admin"(), false)));



CREATE POLICY "coach/admin read awards" ON "public"."user_achievements" FOR SELECT USING ((COALESCE("public"."is_coach"(), false) OR COALESCE("public"."is_admin"(), false)));



ALTER TABLE "public"."coach_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coaching_note_action_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coaching_note_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coaching_notes_base" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coaching_private_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coaching_private_notes_delete_admin_or_coach" ON "public"."coaching_private_notes" FOR DELETE TO "authenticated" USING ("public"."is_admin_or_coach"());



CREATE POLICY "coaching_private_notes_insert_admin_or_coach" ON "public"."coaching_private_notes" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin_or_coach"());



CREATE POLICY "coaching_private_notes_select_admin_or_coach" ON "public"."coaching_private_notes" FOR SELECT TO "authenticated" USING ("public"."is_admin_or_coach"());



CREATE POLICY "coaching_private_notes_update_admin_or_coach" ON "public"."coaching_private_notes" FOR UPDATE TO "authenticated" USING ("public"."is_admin_or_coach"()) WITH CHECK ("public"."is_admin_or_coach"());



ALTER TABLE "public"."content_blocks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."content_node_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."content_nodes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."course_sort_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "course_sort_orders admin write" ON "public"."course_sort_orders" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."code" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."code" = 'admin'::"text")))));



CREATE POLICY "course_sort_orders read" ON "public"."course_sort_orders" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."courses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cp_select_scoped" ON "public"."coach_profiles" FOR SELECT USING (("public"."has_role"('admin'::"text") OR ("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."user_coaches" "uc"
  WHERE ("uc"."is_active" AND ("uc"."coach_id" = "coach_profiles"."user_id") AND (("uc"."user_id" = "auth"."uid"()) OR ("uc"."coach_id" = "auth"."uid"())))))));



CREATE POLICY "cp_update_self_or_admin" ON "public"."coach_profiles" FOR UPDATE USING (("public"."has_role"('admin'::"text") OR ("user_id" = "auth"."uid"())));



ALTER TABLE "public"."focus_finder_dimensions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."focus_finder_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kpi_access" ON "public"."monthly_kpi_records_base" USING ("public"."can_view_domain_owner"("auth"."uid"(), "user_id", 'kpis'::"public"."share_domain")) WITH CHECK ("public"."can_view_domain_owner"("auth"."uid"(), "user_id", 'kpis'::"public"."share_domain"));



ALTER TABLE "public"."kpi_metric_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kpi_metric_types_read_auth" ON "public"."kpi_metric_types" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "kpi_values_access" ON "public"."monthly_kpi_values" USING ("public"."can_view_domain_owner"("auth"."uid"(), ( SELECT "r"."user_id"
   FROM "public"."monthly_kpi_records_base" "r"
  WHERE ("r"."id" = "monthly_kpi_values"."monthly_kpi_record_id")), 'kpis'::"public"."share_domain")) WITH CHECK ("public"."can_view_domain_owner"("auth"."uid"(), ( SELECT "r"."user_id"
   FROM "public"."monthly_kpi_records_base" "r"
  WHERE ("r"."id" = "monthly_kpi_values"."monthly_kpi_record_id")), 'kpis'::"public"."share_domain"));



CREATE POLICY "me read mine" ON "public"."user_achievements" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "meeting_attendance_admin_coach_manage" ON "public"."meeting_attendance_base" USING ("public"."is_admin_or_coach"()) WITH CHECK ("public"."is_admin_or_coach"());



ALTER TABLE "public"."meeting_attendance_base" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "meeting_attendance_select_own_or_admin_coach" ON "public"."meeting_attendance_base" FOR SELECT USING (("public"."is_admin_or_coach"() OR ("user_id" = "auth"."uid"())));



ALTER TABLE "public"."meeting_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "meeting_types_admin_manage" ON "public"."meeting_types" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "meeting_types_select_all_authenticated" ON "public"."meeting_types" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."meetings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "meetings_admin_coach_manage" ON "public"."meetings" USING ("public"."is_admin_or_coach"()) WITH CHECK ("public"."is_admin_or_coach"());



CREATE POLICY "meetings_select_for_admin_coach_or_attendee" ON "public"."meetings" FOR SELECT USING (("public"."is_admin_or_coach"() OR (EXISTS ( SELECT 1
   FROM "public"."meeting_attendance_base" "ma"
  WHERE (("ma"."meeting_id" = "meetings"."id") AND ("ma"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."monthly_kpi_records_base" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "monthly_kpi_records_coach_select" ON "public"."monthly_kpi_records_base" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_coaches" "uc"
  WHERE (("uc"."user_id" = "monthly_kpi_records_base"."user_id") AND ("uc"."coach_id" = "auth"."uid"()) AND (COALESCE("uc"."is_active", true) = true) AND (("uc"."ended_at" IS NULL) OR ("uc"."ended_at" > "now"()))))));



CREATE POLICY "monthly_kpi_records_coach_update" ON "public"."monthly_kpi_records_base" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_coaches" "uc"
  WHERE (("uc"."user_id" = "monthly_kpi_records_base"."user_id") AND ("uc"."coach_id" = "auth"."uid"()) AND (COALESCE("uc"."is_active", true) = true) AND (("uc"."ended_at" IS NULL) OR ("uc"."ended_at" > "now"())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_coaches" "uc"
  WHERE (("uc"."user_id" = "monthly_kpi_records_base"."user_id") AND ("uc"."coach_id" = "auth"."uid"()) AND (COALESCE("uc"."is_active", true) = true) AND (("uc"."ended_at" IS NULL) OR ("uc"."ended_at" > "now"()))))));



CREATE POLICY "monthly_kpi_records_user_insert" ON "public"."monthly_kpi_records_base" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "monthly_kpi_records_user_select" ON "public"."monthly_kpi_records_base" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "monthly_kpi_records_user_update" ON "public"."monthly_kpi_records_base" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."monthly_kpi_values" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "monthly_kpi_values_coach_select" ON "public"."monthly_kpi_values" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."monthly_kpi_records_base" "r"
     JOIN "public"."user_coaches" "uc" ON (("uc"."user_id" = "r"."user_id")))
  WHERE (("r"."id" = "monthly_kpi_values"."monthly_kpi_record_id") AND ("uc"."coach_id" = "auth"."uid"()) AND (COALESCE("uc"."is_active", true) = true) AND (("uc"."ended_at" IS NULL) OR ("uc"."ended_at" > "now"()))))));



CREATE POLICY "monthly_kpi_values_coach_write" ON "public"."monthly_kpi_values" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."monthly_kpi_records_base" "r"
     JOIN "public"."user_coaches" "uc" ON (("uc"."user_id" = "r"."user_id")))
  WHERE (("r"."id" = "monthly_kpi_values"."monthly_kpi_record_id") AND ("uc"."coach_id" = "auth"."uid"()) AND (COALESCE("uc"."is_active", true) = true) AND (("uc"."ended_at" IS NULL) OR ("uc"."ended_at" > "now"())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."monthly_kpi_records_base" "r"
     JOIN "public"."user_coaches" "uc" ON (("uc"."user_id" = "r"."user_id")))
  WHERE (("r"."id" = "monthly_kpi_values"."monthly_kpi_record_id") AND ("uc"."coach_id" = "auth"."uid"()) AND (COALESCE("uc"."is_active", true) = true) AND (("uc"."ended_at" IS NULL) OR ("uc"."ended_at" > "now"()))))));



CREATE POLICY "monthly_kpi_values_user_select" ON "public"."monthly_kpi_values" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."monthly_kpi_records_base" "r"
  WHERE (("r"."id" = "monthly_kpi_values"."monthly_kpi_record_id") AND ("r"."user_id" = "auth"."uid"())))));



CREATE POLICY "monthly_kpi_values_user_write" ON "public"."monthly_kpi_values" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."monthly_kpi_records_base" "r"
  WHERE (("r"."id" = "monthly_kpi_values"."monthly_kpi_record_id") AND ("r"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."monthly_kpi_records_base" "r"
  WHERE (("r"."id" = "monthly_kpi_values"."monthly_kpi_record_id") AND ("r"."user_id" = "auth"."uid"())))));



CREATE POLICY "nchild_admin_all" ON "public"."node_children" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "nchild_members_read" ON "public"."node_children" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."content_nodes" "p"
  WHERE (("p"."id" = "node_children"."parent_id") AND ((("p"."state" = 'published'::"text") AND (("p"."owner_id" IS NULL) OR ("p"."owner_id" = "auth"."uid"()))) OR (("p"."owner_id" = "auth"."uid"()) AND ("p"."node_type" = 'playlist'::"text")))))) AND (EXISTS ( SELECT 1
   FROM "public"."content_nodes" "c"
  WHERE (("c"."id" = "node_children"."child_id") AND ("c"."state" = 'published'::"text"))))));



CREATE POLICY "ner_admin_all" ON "public"."node_edge_rules" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "ner_members_read" ON "public"."node_edge_rules" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."node_children" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."node_edge_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notes_access" ON "public"."coaching_notes_base" USING ((("deleted_at" IS NULL) AND "public"."can_view_domain_owner"("auth"."uid"(), "user_id", 'notes'::"public"."share_domain"))) WITH CHECK ("public"."can_view_domain_owner"("auth"."uid"(), "user_id", 'notes'::"public"."share_domain"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_admin" ON "public"."profiles" FOR SELECT USING ("public"."has_role"('admin'::"text"));



CREATE POLICY "profiles_select_assigned_to_coach" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_coaches" "uc"
  WHERE ("uc"."is_active" AND ("uc"."coach_id" = "auth"."uid"()) AND ("uc"."user_id" = "profiles"."id")))));



CREATE POLICY "profiles_select_coach_peers" ON "public"."profiles" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."code" = 'coach'::"text")))) AND (EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur2"
     JOIN "public"."roles" "r2" ON (("r2"."id" = "ur2"."role_id")))
  WHERE (("ur2"."user_id" = "profiles"."id") AND ("r2"."code" = 'coach'::"text"))))));



CREATE POLICY "profiles_select_self" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles_update_self_or_admin" ON "public"."profiles" FOR UPDATE USING ((("id" = "auth"."uid"()) OR "public"."has_role"('admin'::"text"))) WITH CHECK ((("id" = "auth"."uid"()) OR "public"."has_role"('admin'::"text")));



CREATE POLICY "read achievement map" ON "public"."achievement_node_map" FOR SELECT USING (true);



CREATE POLICY "read achievements" ON "public"."achievements" FOR SELECT USING (true);



CREATE POLICY "read coaches assigned to me" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_coaches" "uc"
  WHERE (("uc"."user_id" = "auth"."uid"()) AND ("uc"."coach_id" = "profiles"."id") AND "uc"."is_active"))));



CREATE POLICY "read my assigned courses" ON "public"."courses" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_coaches" "uc"
  WHERE (("uc"."user_id" = "auth"."uid"()) AND ("uc"."course_id" = "courses"."id") AND "uc"."is_active"))));



ALTER TABLE "public"."resource_access" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resource_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "resource_tags_admin_all" ON "public"."resource_tags" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "resource_tags_members_read" ON "public"."resource_tags" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."resources" "r"
  WHERE (("r"."id" = "resource_tags"."resource_id") AND ("r"."state" = 'published'::"text"))))));



ALTER TABLE "public"."resources" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "resources_admin_all" ON "public"."resources" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "resources_members_read" ON "public"."resources" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND ("state" = 'published'::"text")));



ALTER TABLE "public"."search_analytics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."smart_doc_prompts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "smart_doc_prompts_admin_all" ON "public"."smart_doc_prompts" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "smart_doc_prompts_member_read" ON "public"."smart_doc_prompts" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM (("public"."smart_docs" "d"
     JOIN "public"."content_blocks" "cb" ON (("cb"."smart_doc_id" = "d"."id")))
     JOIN "public"."content_nodes" "n" ON (("n"."id" = "cb"."node_id")))
  WHERE (("d"."id" = "smart_doc_prompts"."doc_id") AND ("n"."state" = 'published'::"text")))) AND (EXISTS ( SELECT 1
   FROM "public"."smart_docs" "d2"
  WHERE (("d2"."id" = "smart_doc_prompts"."doc_id") AND ("d2"."is_published" = true))))));



ALTER TABLE "public"."smart_doc_response_values" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "smart_doc_response_values_admin_all" ON "public"."smart_doc_response_values" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "smart_doc_response_values_coach_delete" ON "public"."smart_doc_response_values" FOR DELETE USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."smart_doc_responses" "r"
     JOIN "public"."user_coaches" "uc" ON ((("uc"."user_id" = "r"."user_id") AND ("uc"."is_active" = true))))
  WHERE (("r"."id" = "smart_doc_response_values"."response_id") AND ("uc"."coach_id" = "auth"."uid"()))))));



CREATE POLICY "smart_doc_response_values_coach_read" ON "public"."smart_doc_response_values" FOR SELECT USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."smart_doc_responses" "r"
     JOIN "public"."user_coaches" "uc" ON ((("uc"."user_id" = "r"."user_id") AND ("uc"."is_active" = true))))
  WHERE (("r"."id" = "smart_doc_response_values"."response_id") AND ("uc"."coach_id" = "auth"."uid"()))))));



CREATE POLICY "smart_doc_response_values_coach_update" ON "public"."smart_doc_response_values" FOR UPDATE USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."smart_doc_responses" "r"
     JOIN "public"."user_coaches" "uc" ON ((("uc"."user_id" = "r"."user_id") AND ("uc"."is_active" = true))))
  WHERE (("r"."id" = "smart_doc_response_values"."response_id") AND ("uc"."coach_id" = "auth"."uid"())))))) WITH CHECK (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."smart_doc_responses" "r"
     JOIN "public"."user_coaches" "uc" ON ((("uc"."user_id" = "r"."user_id") AND ("uc"."is_active" = true))))
  WHERE (("r"."id" = "smart_doc_response_values"."response_id") AND ("uc"."coach_id" = "auth"."uid"()))))));



CREATE POLICY "smart_doc_response_values_user_rw" ON "public"."smart_doc_response_values" USING ((EXISTS ( SELECT 1
   FROM "public"."smart_doc_responses" "r"
  WHERE (("r"."id" = "smart_doc_response_values"."response_id") AND ("r"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."smart_doc_responses" "r"
  WHERE (("r"."id" = "smart_doc_response_values"."response_id") AND ("r"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."smart_doc_responses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "smart_doc_responses_admin_all" ON "public"."smart_doc_responses" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "smart_doc_responses_coach_read" ON "public"."smart_doc_responses" FOR SELECT USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."user_coaches" "uc"
  WHERE (("uc"."coach_id" = "auth"."uid"()) AND ("uc"."is_active" = true) AND ("uc"."user_id" = "smart_doc_responses"."user_id"))))));



CREATE POLICY "smart_doc_responses_coach_update" ON "public"."smart_doc_responses" FOR UPDATE USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."user_coaches" "uc"
  WHERE (("uc"."coach_id" = "auth"."uid"()) AND ("uc"."is_active" = true) AND ("uc"."user_id" = "smart_doc_responses"."user_id")))))) WITH CHECK (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."user_coaches" "uc"
  WHERE (("uc"."coach_id" = "auth"."uid"()) AND ("uc"."is_active" = true) AND ("uc"."user_id" = "smart_doc_responses"."user_id"))))));



CREATE POLICY "smart_doc_responses_user_rw" ON "public"."smart_doc_responses" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."smart_docs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "smart_docs_admin_all" ON "public"."smart_docs" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "smart_docs_member_read" ON "public"."smart_docs" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ("public"."content_blocks" "cb"
     JOIN "public"."content_nodes" "n" ON (("n"."id" = "cb"."node_id")))
  WHERE (("cb"."smart_doc_id" = "smart_docs"."id") AND ("n"."state" = 'published'::"text")))) AND ("is_published" = true)));



ALTER TABLE "public"."system_scorecard_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_scorecard_systems" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_scorecard_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_scorecard_version_migrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "uc_select_scoped" ON "public"."user_coaches" FOR SELECT USING (("public"."has_role"('admin'::"text") OR ("user_id" = "auth"."uid"()) OR ("coach_id" = "auth"."uid"())));



CREATE POLICY "uc_write_admin_only" ON "public"."user_coaches" USING ("public"."has_role"('admin'::"text"));



CREATE POLICY "ucv_staff_all_dml" ON "public"."user_course_visibility" USING ("public"."is_admin_or_coach"()) WITH CHECK ("public"."is_admin_or_coach"());



CREATE POLICY "ucv_staff_select_all" ON "public"."user_course_visibility" FOR SELECT USING ("public"."is_admin_or_coach"());



CREATE POLICY "ucv_user_select_own" ON "public"."user_course_visibility" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_achievements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_coaches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_course_visibility" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_node_progress" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_node_progress_admin_all" ON "public"."user_node_progress" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "user_node_progress_coach_all" ON "public"."user_node_progress" USING ("public"."is_coach"()) WITH CHECK ("public"."is_coach"());



CREATE POLICY "user_node_progress_user_rw" ON "public"."user_node_progress" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_training_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."zoom_attendance_aliases" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."__dbg_chosen_coach"() TO "anon";
GRANT ALL ON FUNCTION "public"."__dbg_chosen_coach"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."__dbg_chosen_coach"() TO "service_role";



GRANT ALL ON FUNCTION "public"."__dbg_coach_links"() TO "anon";
GRANT ALL ON FUNCTION "public"."__dbg_coach_links"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."__dbg_coach_links"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_canon_user_att"() TO "anon";
GRANT ALL ON FUNCTION "public"."_canon_user_att"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_canon_user_att"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_canon_user_kpis"() TO "anon";
GRANT ALL ON FUNCTION "public"."_canon_user_kpis"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_canon_user_kpis"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_canon_user_notes"() TO "anon";
GRANT ALL ON FUNCTION "public"."_canon_user_notes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_canon_user_notes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_course_sort_orders_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."_course_sort_orders_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_course_sort_orders_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_jsonb_inc"("c" "jsonb", "path" "text"[], "delta" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."_jsonb_inc"("c" "jsonb", "path" "text"[], "delta" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_jsonb_inc"("c" "jsonb", "path" "text"[], "delta" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."_jsonb_inc"("c" "jsonb", "path" "text"[], "delta" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."_jsonb_inc"("c" "jsonb", "path" "text"[], "delta" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_jsonb_inc"("c" "jsonb", "path" "text"[], "delta" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."_rt_after_change_refresh_tag_text"() TO "anon";
GRANT ALL ON FUNCTION "public"."_rt_after_change_refresh_tag_text"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_rt_after_change_refresh_tag_text"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_status_rank"("s" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_status_rank"("s" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_status_rank"("s" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_tags_after_update_refresh_dependents"() TO "anon";
GRANT ALL ON FUNCTION "public"."_tags_after_update_refresh_dependents"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_tags_after_update_refresh_dependents"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_v_cn_del"() TO "anon";
GRANT ALL ON FUNCTION "public"."_v_cn_del"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_v_cn_del"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_v_cn_ins"() TO "anon";
GRANT ALL ON FUNCTION "public"."_v_cn_ins"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_v_cn_ins"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_v_cn_upd"() TO "anon";
GRANT ALL ON FUNCTION "public"."_v_cn_upd"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_v_cn_upd"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_v_ma_del"() TO "anon";
GRANT ALL ON FUNCTION "public"."_v_ma_del"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_v_ma_del"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_v_ma_ins"() TO "anon";
GRANT ALL ON FUNCTION "public"."_v_ma_ins"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_v_ma_ins"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_v_ma_upd"() TO "anon";
GRANT ALL ON FUNCTION "public"."_v_ma_upd"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_v_ma_upd"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_v_mkr_del"() TO "anon";
GRANT ALL ON FUNCTION "public"."_v_mkr_del"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_v_mkr_del"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_v_mkr_ins"() TO "anon";
GRANT ALL ON FUNCTION "public"."_v_mkr_ins"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_v_mkr_ins"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_v_mkr_upd"() TO "anon";
GRANT ALL ON FUNCTION "public"."_v_mkr_upd"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_v_mkr_upd"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_validate_node_state"("_state" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_validate_node_state"("_state" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_validate_node_state"("_state" "text") TO "service_role";



GRANT ALL ON TABLE "public"."coaching_note_action_steps" TO "anon";
GRANT ALL ON TABLE "public"."coaching_note_action_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."coaching_note_action_steps" TO "service_role";



GRANT ALL ON FUNCTION "public"."add_coaching_note_action_step"("_coaching_note_id" bigint, "_label" "text", "_library_item_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."add_coaching_note_action_step"("_coaching_note_id" bigint, "_label" "text", "_library_item_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_coaching_note_action_step"("_coaching_note_id" bigint, "_label" "text", "_library_item_id" bigint) TO "service_role";



GRANT ALL ON TABLE "public"."coaching_note_comments" TO "anon";
GRANT ALL ON TABLE "public"."coaching_note_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."coaching_note_comments" TO "service_role";



GRANT ALL ON FUNCTION "public"."add_coaching_note_comment"("_coaching_note_id" bigint, "_body" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_coaching_note_comment"("_coaching_note_id" bigint, "_body" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_coaching_note_comment"("_coaching_note_id" bigint, "_body" "text") TO "service_role";



GRANT ALL ON TABLE "public"."wins" TO "anon";
GRANT ALL ON TABLE "public"."wins" TO "authenticated";
GRANT ALL ON TABLE "public"."wins" TO "service_role";



GRANT ALL ON FUNCTION "public"."add_win"("_user_id" "uuid", "_body" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_win"("_user_id" "uuid", "_body" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_win"("_user_id" "uuid", "_body" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_clone_system_scorecard_version"("_source_template_key" "text", "_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_clone_system_scorecard_version"("_source_template_key" "text", "_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_discard_system_scorecard_draft"("_template_key" "text", "_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_discard_system_scorecard_draft"("_template_key" "text", "_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_publish_system_scorecard_version"("_template_key" "text", "_actor_id" "uuid", "_resolutions" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_publish_system_scorecard_version"("_template_key" "text", "_actor_id" "uuid", "_resolutions" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_replace_system_scorecard_draft"("_template_key" "text", "_name" "text", "_categories" "jsonb", "_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_replace_system_scorecard_draft"("_template_key" "text", "_name" "text", "_categories" "jsonb", "_actor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_user_attention_auto"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_user_attention_auto"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_user_attention_auto"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."award_achievements_on_action_step"() TO "anon";
GRANT ALL ON FUNCTION "public"."award_achievements_on_action_step"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."award_achievements_on_action_step"() TO "service_role";



GRANT ALL ON FUNCTION "public"."business_audit_set_updated_at_20260729"() TO "anon";
GRANT ALL ON FUNCTION "public"."business_audit_set_updated_at_20260729"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."business_audit_set_updated_at_20260729"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_owner"("_viewer" "uuid", "_owner" "uuid", "_domain" "public"."share_domain") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_owner"("_viewer" "uuid", "_owner" "uuid", "_domain" "public"."share_domain") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_owner"("_viewer" "uuid", "_owner" "uuid", "_domain" "public"."share_domain") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_user_access_course"("p_user_id" "uuid", "p_course_node_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."can_user_access_course"("p_user_id" "uuid", "p_course_node_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_user_access_course"("p_user_id" "uuid", "p_course_node_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."can_user_access_node_via_course"("p_user_id" "uuid", "p_node_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."can_user_access_node_via_course"("p_user_id" "uuid", "p_node_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_user_access_node_via_course"("p_user_id" "uuid", "p_node_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_domain_owner"("_viewer" "uuid", "_owner" "uuid", "_domain" "public"."share_domain") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_domain_owner"("_viewer" "uuid", "_owner" "uuid", "_domain" "public"."share_domain") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_domain_owner"("_viewer" "uuid", "_owner" "uuid", "_domain" "public"."share_domain") TO "service_role";



GRANT ALL ON FUNCTION "public"."canonical_owner_for"("_user" "uuid", "_domain" "public"."share_domain") TO "anon";
GRANT ALL ON FUNCTION "public"."canonical_owner_for"("_user" "uuid", "_domain" "public"."share_domain") TO "authenticated";
GRANT ALL ON FUNCTION "public"."canonical_owner_for"("_user" "uuid", "_domain" "public"."share_domain") TO "service_role";



GRANT ALL ON FUNCTION "public"."cb_guard_smartdoc_publish_consistency"() TO "anon";
GRANT ALL ON FUNCTION "public"."cb_guard_smartdoc_publish_consistency"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cb_guard_smartdoc_publish_consistency"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cn_autoslug"() TO "anon";
GRANT ALL ON FUNCTION "public"."cn_autoslug"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cn_autoslug"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cn_sequential_unlock_flip_trg"() TO "anon";
GRANT ALL ON FUNCTION "public"."cn_sequential_unlock_flip_trg"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cn_sequential_unlock_flip_trg"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cn_state_cascade_trg"() TO "anon";
GRANT ALL ON FUNCTION "public"."cn_state_cascade_trg"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cn_state_cascade_trg"() TO "service_role";



GRANT ALL ON FUNCTION "public"."coach_clear_field"("_content_block_id" bigint, "_user_id" "uuid", "_prompt_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."coach_clear_field"("_content_block_id" bigint, "_user_id" "uuid", "_prompt_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."coach_clear_field"("_content_block_id" bigint, "_user_id" "uuid", "_prompt_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."coach_reset_doc"("_content_block_id" bigint, "_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."coach_reset_doc"("_content_block_id" bigint, "_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."coach_reset_doc"("_content_block_id" bigint, "_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."compute_user_attention_auto_from_attendance"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_user_attention_auto_from_attendance"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_user_attention_auto_from_attendance"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."business_reviews" TO "anon";
GRANT ALL ON TABLE "public"."business_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."business_reviews" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_business_review"("_user_id" "uuid", "_review_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_business_review"("_user_id" "uuid", "_review_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_business_review"("_user_id" "uuid", "_review_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."view_user_ids_for_owner"("_owner" "uuid", "_domain" "public"."share_domain") TO "anon";
GRANT ALL ON FUNCTION "public"."view_user_ids_for_owner"("_owner" "uuid", "_domain" "public"."share_domain") TO "authenticated";
GRANT ALL ON FUNCTION "public"."view_user_ids_for_owner"("_owner" "uuid", "_domain" "public"."share_domain") TO "service_role";



GRANT ALL ON TABLE "public"."coaching_notes_base" TO "anon";
GRANT ALL ON TABLE "public"."coaching_notes_base" TO "authenticated";
GRANT ALL ON TABLE "public"."coaching_notes_base" TO "service_role";



GRANT ALL ON TABLE "public"."coaching_notes" TO "anon";
GRANT ALL ON TABLE "public"."coaching_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."coaching_notes" TO "service_role";



GRANT ALL ON FUNCTION "public"."create_coaching_note"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_coaching_note"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_coaching_note"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_initial_monthly_kpi_record"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_initial_monthly_kpi_record"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_initial_monthly_kpi_record"() TO "service_role";



GRANT ALL ON TABLE "public"."meetings" TO "anon";
GRANT ALL ON TABLE "public"."meetings" TO "authenticated";
GRANT ALL ON TABLE "public"."meetings" TO "service_role";



GRANT ALL ON FUNCTION "public"."create_meeting_for_user"("_meeting_type_code" "text", "_date" "date", "_user_id" "uuid", "_title" "text", "_created_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_meeting_for_user"("_meeting_type_code" "text", "_date" "date", "_user_id" "uuid", "_title" "text", "_created_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_meeting_for_user"("_meeting_type_code" "text", "_date" "date", "_user_id" "uuid", "_title" "text", "_created_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_meeting_with_attendees"("_meeting_type_code" "text", "_date" "date", "_user_ids" "uuid"[], "_title" "text", "_created_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_meeting_with_attendees"("_meeting_type_code" "text", "_date" "date", "_user_ids" "uuid"[], "_title" "text", "_created_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_meeting_with_attendees"("_meeting_type_code" "text", "_date" "date", "_user_ids" "uuid"[], "_title" "text", "_created_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_win"("_win_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."delete_win"("_win_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_win"("_win_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."effective_owner_id"("_user" "uuid", "_domain" "public"."share_domain") TO "anon";
GRANT ALL ON FUNCTION "public"."effective_owner_id"("_user" "uuid", "_domain" "public"."share_domain") TO "authenticated";
GRANT ALL ON FUNCTION "public"."effective_owner_id"("_user" "uuid", "_domain" "public"."share_domain") TO "service_role";



REVOKE ALL ON FUNCTION "public"."end_user_training_assignment"("p_user_id" "uuid", "p_coaching_note_id" bigint, "p_ended_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."end_user_training_assignment"("p_user_id" "uuid", "p_coaching_note_id" bigint, "p_ended_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_content_blocks_shape"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_content_blocks_shape"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_content_blocks_shape"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_content_node_roles_course_only"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_content_node_roles_course_only"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_content_node_roles_course_only"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_node_children_rules"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_node_children_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_node_children_rules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_playlist_published_assets"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_playlist_published_assets"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_playlist_published_assets"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_single_active_partnership_per_domain"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_single_active_partnership_per_domain"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_single_active_partnership_per_domain"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_strict_sequence"("_root_id" bigint, "_on" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_strict_sequence"("_root_id" bigint, "_on" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_strict_sequence"("_root_id" bigint, "_on" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_user_assistants_assistant_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_user_assistants_assistant_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_user_assistants_assistant_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_monthly_kpi_record_for_month"("_user_id" "uuid", "_period_start_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_monthly_kpi_record_for_month"("_user_id" "uuid", "_period_start_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_monthly_kpi_record_for_month"("_user_id" "uuid", "_period_start_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."export_smartdoc_answers_for_chapters"("_chapter_ids" bigint[], "_only_submitted" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."export_smartdoc_answers_for_chapters"("_chapter_ids" bigint[], "_only_submitted" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."export_smartdoc_answers_for_chapters"("_chapter_ids" bigint[], "_only_submitted" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_all_users"("_course_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_all_users"("_course_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_all_users"("_course_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_available_course_ids_for_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_available_course_ids_for_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_course_ids_for_user"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_available_courses_for_user"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_available_courses_for_user"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_courses_for_user"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_child_unlock_status"("_parent_id" bigint, "_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_child_unlock_status"("_parent_id" bigint, "_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_child_unlock_status"("_parent_id" bigint, "_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_child_unlock_status_bulk"("_parent_ids" bigint[], "_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_child_unlock_status_bulk"("_parent_ids" bigint[], "_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_child_unlock_status_bulk"("_parent_ids" bigint[], "_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_coaching_private_notes_for_user"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_coaching_private_notes_for_user"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_coaching_private_notes_for_user"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_coaching_private_notes_for_user"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_containing_course_ids"("p_node_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_containing_course_ids"("p_node_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_containing_course_ids"("p_node_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_current_member_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_current_member_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_looker_link_for_user"("uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_looker_link_for_user"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_looker_link_for_user"("uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_monthly_kpi_history_for_year"("_user_id" "uuid", "_year" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_monthly_kpi_history_for_year"("_user_id" "uuid", "_year" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_monthly_kpi_history_for_year"("_user_id" "uuid", "_year" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_monthly_kpi_history_with_values"("_user_id" "uuid", "_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_monthly_kpi_history_with_values"("_user_id" "uuid", "_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_monthly_kpi_history_with_values"("_user_id" "uuid", "_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_monthly_kpi_record_with_values"("_user_id" "uuid", "_period_start_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_monthly_kpi_record_with_values"("_user_id" "uuid", "_period_start_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_monthly_kpi_record_with_values"("_user_id" "uuid", "_period_start_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_coach"("_course_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_coach"("_course_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_coach"("_course_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_coach_links"("_course_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_coach_links"("_course_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_coach_links"("_course_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_implementation_coach"("_course_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_implementation_coach"("_course_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_implementation_coach"("_course_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_users"("_course_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_users"("_course_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_users"("_course_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_users_with_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_users_with_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_users_with_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_smart_doc_progress"("_content_block_id" bigint, "_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_smart_doc_progress"("_content_block_id" bigint, "_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_smart_doc_progress"("_content_block_id" bigint, "_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_status_overview_summary"("_user_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_status_overview_summary"("_user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_status_overview_summary"("_user_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_contact"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_contact"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_contact"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_contact"("_user_id" "uuid", "_course_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_contact"("_user_id" "uuid", "_course_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_contact"("_user_id" "uuid", "_course_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_course_completion_detail"("_user_id" "uuid", "_course_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_course_completion_detail"("_user_id" "uuid", "_course_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_course_completion_detail"("_user_id" "uuid", "_course_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_course_progress"("_user_id" "uuid", "_course_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_course_progress"("_user_id" "uuid", "_course_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_course_progress"("_user_id" "uuid", "_course_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_engagement_summary"("_user_id" "uuid", "_from" "date", "_to" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_engagement_summary"("_user_id" "uuid", "_from" "date", "_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_engagement_summary"("_user_id" "uuid", "_from" "date", "_to" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_engagement_timeseries"("_user_id" "uuid", "_from" "date", "_to" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_engagement_timeseries"("_user_id" "uuid", "_from" "date", "_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_engagement_timeseries"("_user_id" "uuid", "_from" "date", "_to" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_meetings"("_user_id" "uuid", "_from" "date", "_to" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_meetings"("_user_id" "uuid", "_from" "date", "_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_meetings"("_user_id" "uuid", "_from" "date", "_to" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_smartdoc_answers"("_user_id" "uuid", "_content_block_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_smartdoc_answers"("_user_id" "uuid", "_content_block_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_smartdoc_answers"("_user_id" "uuid", "_content_block_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."grant_assigned_training_access"() TO "anon";
GRANT ALL ON FUNCTION "public"."grant_assigned_training_access"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."grant_assigned_training_access"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("_codes" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("_codes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_codes" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("role_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("role_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("role_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."initialize_business_review_system_scorecard"("_business_review_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."initialize_business_review_system_scorecard"("_business_review_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_or_coach"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_or_coach"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_or_coach"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_assistant"("_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_assistant"("_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_assistant"("_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_coach"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_coach"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_coach"() TO "service_role";



GRANT ALL ON FUNCTION "public"."list_user_smartdoc_instances"("_user_id" "uuid", "_course_id" bigint, "_only_submitted" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."list_user_smartdoc_instances"("_user_id" "uuid", "_course_id" bigint, "_only_submitted" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_user_smartdoc_instances"("_user_id" "uuid", "_course_id" bigint, "_only_submitted" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_completed_and_cascade"("_node_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."mark_completed_and_cascade"("_node_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_completed_and_cascade"("_node_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_node_completed"("_node_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."mark_node_completed"("_node_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_node_completed"("_node_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_node_started"("_node_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."mark_node_started"("_node_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_node_started"("_node_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."nc_default_seq_unlock_on_attach"() TO "anon";
GRANT ALL ON FUNCTION "public"."nc_default_seq_unlock_on_attach"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."nc_default_seq_unlock_on_attach"() TO "service_role";



GRANT ALL ON FUNCTION "public"."nc_enforce_sibling_slug_unique"() TO "anon";
GRANT ALL ON FUNCTION "public"."nc_enforce_sibling_slug_unique"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."nc_enforce_sibling_slug_unique"() TO "service_role";



GRANT ALL ON FUNCTION "public"."owner_user_for_bucket"("_bucket" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."owner_user_for_bucket"("_bucket" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."owner_user_for_bucket"("_bucket" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."partnership_for_user"("_user" "uuid", "_domain" "public"."share_domain") TO "anon";
GRANT ALL ON FUNCTION "public"."partnership_for_user"("_user" "uuid", "_domain" "public"."share_domain") TO "authenticated";
GRANT ALL ON FUNCTION "public"."partnership_for_user"("_user" "uuid", "_domain" "public"."share_domain") TO "service_role";



REVOKE ALL ON FUNCTION "public"."propagate_scorecard_system_library_item"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."propagate_scorecard_system_library_item"() TO "anon";
GRANT ALL ON FUNCTION "public"."propagate_scorecard_system_library_item"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."propagate_scorecard_system_library_item"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_if_manual_cleared"() TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_if_manual_cleared"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_if_manual_cleared"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_on_meeting_attendance_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_on_meeting_attendance_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_on_meeting_attendance_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_user_attention_now"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_user_attention_now"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_user_attention_now"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."reconcile_user_achievements_backfill"() TO "anon";
GRANT ALL ON FUNCTION "public"."reconcile_user_achievements_backfill"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reconcile_user_achievements_backfill"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reconcile_user_achievements_cleanup"() TO "anon";
GRANT ALL ON FUNCTION "public"."reconcile_user_achievements_cleanup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reconcile_user_achievements_cleanup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_tag_text"("_resource_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_tag_text"("_resource_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_tag_text"("_resource_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_cancelled_ghl_meeting_attendance"() TO "anon";
GRANT ALL ON FUNCTION "public"."remove_cancelled_ghl_meeting_attendance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_cancelled_ghl_meeting_attendance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_content_node_open_path"("_node_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_content_node_open_path"("_node_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_content_node_open_path"("_node_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."revoke_achievements_on_action_step"() TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_achievements_on_action_step"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_achievements_on_action_step"() TO "service_role";



GRANT ALL ON FUNCTION "public"."search_resources"("_q" "text", "_types" "text"[], "_tag_ids" bigint[], "_sort" "text", "_limit" integer, "_offset" integer, "_mode" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_resources"("_q" "text", "_types" "text"[], "_tag_ids" bigint[], "_sort" "text", "_limit" integer, "_offset" integer, "_mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_resources"("_q" "text", "_types" "text"[], "_tag_ids" bigint[], "_sort" "text", "_limit" integer, "_offset" integer, "_mode" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."search_resources"("_q" "text", "_types" "text"[], "_tag_ids" bigint[], "_duration" "text", "_date_range" "text", "_sort" "text", "_limit" integer, "_offset" integer, "_mode" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_resources"("_q" "text", "_types" "text"[], "_tag_ids" bigint[], "_duration" "text", "_date_range" "text", "_sort" "text", "_limit" integer, "_offset" integer, "_mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_resources"("_q" "text", "_types" "text"[], "_tag_ids" bigint[], "_duration" "text", "_date_range" "text", "_sort" "text", "_limit" integer, "_offset" integer, "_mode" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."search_resources_with_page"("_q" "text", "_types" "text"[], "_tag_ids" bigint[], "_duration" "text", "_date_range" "text", "_sort" "text", "_limit" integer, "_offset" integer, "_mode" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_resources_with_page"("_q" "text", "_types" "text"[], "_tag_ids" bigint[], "_duration" "text", "_date_range" "text", "_sort" "text", "_limit" integer, "_offset" integer, "_mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_resources_with_page"("_q" "text", "_types" "text"[], "_tag_ids" bigint[], "_duration" "text", "_date_range" "text", "_sort" "text", "_limit" integer, "_offset" integer, "_mode" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_business_review_system_priority"("_business_review_id" bigint, "_system_id" bigint, "_selected" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_business_review_system_priority"("_business_review_id" bigint, "_system_id" bigint, "_selected" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_business_review_system_priority"("_business_review_id" bigint, "_system_id" bigint, "_selected" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_course_order"("_course_ids" bigint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_course_order"("_course_ids" bigint[]) TO "anon";
GRANT ALL ON FUNCTION "public"."set_course_order"("_course_ids" bigint[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_course_order"("_course_ids" bigint[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_custom_jwt_claims"("uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_custom_jwt_claims"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_custom_jwt_claims"("uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_node_progress"("_node_id" bigint, "_status" "public"."node_progress_status") TO "anon";
GRANT ALL ON FUNCTION "public"."set_node_progress"("_node_id" bigint, "_status" "public"."node_progress_status") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_node_progress"("_node_id" bigint, "_status" "public"."node_progress_status") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_node_state"("_node_id" bigint, "_state" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_node_state"("_node_id" bigint, "_state" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_node_state"("_node_id" bigint, "_state" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_resources_redirect_url"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_resources_redirect_url"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_resources_redirect_url"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_row_who_cols"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_row_who_cols"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_row_who_cols"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_user_attention_manual_status"("p_user_id" "uuid", "p_status" "public"."user_attention_status", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_user_attention_manual_status"("p_user_id" "uuid", "p_status" "public"."user_attention_status", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_user_attention_manual_status"("p_user_id" "uuid", "p_status" "public"."user_attention_status", "p_reason" "text") TO "service_role";



GRANT ALL ON TABLE "public"."user_training_assignments" TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_user_training_assignment"("p_user_id" "uuid", "p_coaching_note_id" bigint, "p_course_node_id" bigint, "p_assigned_by" "uuid", "p_context_label" "text", "p_due_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_user_training_assignment"("p_user_id" "uuid", "p_coaching_note_id" bigint, "p_course_node_id" bigint, "p_assigned_by" "uuid", "p_context_label" "text", "p_due_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."slugify"("_txt" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."slugify"("_txt" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."slugify"("_txt" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_smart_doc"("_content_block_id" bigint, "_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_smart_doc"("_content_block_id" bigint, "_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_smart_doc"("_content_block_id" bigint, "_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_business_audit_appointment"("_ghl_appointment_id" "text", "_ghl_calendar_id" "text", "_starts_at" timestamp with time zone, "_ends_at" timestamp with time zone, "_meeting_timezone" "text", "_ghl_status" "text", "_title" "text", "_student_id" "uuid", "_coach_id" "uuid", "_review_date" "date", "_is_cancelled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_business_audit_appointment"("_ghl_appointment_id" "text", "_ghl_calendar_id" "text", "_starts_at" timestamp with time zone, "_ends_at" timestamp with time zone, "_meeting_timezone" "text", "_ghl_status" "text", "_title" "text", "_student_id" "uuid", "_coach_id" "uuid", "_review_date" "date", "_is_cancelled" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_implementation_appointment"("_ghl_appointment_id" "text", "_ghl_calendar_id" "text", "_starts_at" timestamp with time zone, "_ends_at" timestamp with time zone, "_meeting_timezone" "text", "_ghl_status" "text", "_title" "text", "_student_id" "uuid", "_coach_id" "uuid", "_meeting_date" "date", "_is_cancelled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_implementation_appointment"("_ghl_appointment_id" "text", "_ghl_calendar_id" "text", "_starts_at" timestamp with time zone, "_ends_at" timestamp with time zone, "_meeting_timezone" "text", "_ghl_status" "text", "_title" "text", "_student_id" "uuid", "_coach_id" "uuid", "_meeting_date" "date", "_is_cancelled" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_implementation_appointment_v2"("_ghl_appointment_id" "text", "_ghl_calendar_id" "text", "_starts_at" timestamp with time zone, "_ends_at" timestamp with time zone, "_meeting_timezone" "text", "_ghl_status" "text", "_title" "text", "_student_id" "uuid", "_coach_id" "uuid", "_meeting_date" "date", "_is_cancelled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_implementation_appointment_v2"("_ghl_appointment_id" "text", "_ghl_calendar_id" "text", "_starts_at" timestamp with time zone, "_ends_at" timestamp with time zone, "_meeting_timezone" "text", "_ghl_status" "text", "_title" "text", "_student_id" "uuid", "_coach_id" "uuid", "_meeting_date" "date", "_is_cancelled" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_priority_system_from_action_step_completion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_priority_system_from_action_step_completion"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_scorecard_priority_action_step_library_item"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_scorecard_priority_action_step_library_item"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_scorecard_priority_action_step_library_item"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_scorecard_priority_action_step_library_item"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."transfer_user_data"("_source" "uuid", "_dest" "uuid", "_options" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."transfer_user_data"("_source" "uuid", "_dest" "uuid", "_options" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_user_data"("_source" "uuid", "_dest" "uuid", "_options" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."transfer_user_data_admin"("_source" "uuid", "_dest" "uuid", "_options" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."transfer_user_data_admin"("_source" "uuid", "_dest" "uuid", "_options" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_user_data_admin"("_source" "uuid", "_dest" "uuid", "_options" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_touch_user_node_progress"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_touch_user_node_progress"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_touch_user_node_progress"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."try_delete_user_db"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."try_delete_user_db"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."try_delete_user_db"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."try_delete_user_db"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_win"("_win_id" bigint, "_body" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_win"("_win_id" bigint, "_body" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_win"("_win_id" bigint, "_body" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_meeting_attendance"("_meeting_id" bigint, "_user_id" "uuid", "_attended" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_meeting_attendance"("_meeting_id" bigint, "_user_id" "uuid", "_attended" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_meeting_attendance"("_meeting_id" bigint, "_user_id" "uuid", "_attended" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_monthly_kpi_record"("_user_id" "uuid", "_period_start_date" "date", "_kpi_values" "jsonb", "_actor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_monthly_kpi_record"("_user_id" "uuid", "_period_start_date" "date", "_kpi_values" "jsonb", "_actor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_monthly_kpi_record"("_user_id" "uuid", "_period_start_date" "date", "_kpi_values" "jsonb", "_actor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_smart_field_value"("_content_block_id" bigint, "_prompt_id" bigint, "_user_id" "uuid", "_value" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_smart_field_value"("_content_block_id" bigint, "_prompt_id" bigint, "_user_id" "uuid", "_value" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_smart_field_value"("_content_block_id" bigint, "_prompt_id" bigint, "_user_id" "uuid", "_value" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_video_resource"("_url" "text", "_title" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_video_resource"("_url" "text", "_title" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_video_resource"("_url" "text", "_title" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_has_role"("p_user_id" "uuid", "p_role_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."user_has_role"("p_user_id" "uuid", "p_role_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_role"("p_user_id" "uuid", "p_role_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_user_training_assignment"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_user_training_assignment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_user_training_assignment"() TO "service_role";



GRANT ALL ON TABLE "public"."achievement_node_map" TO "anon";
GRANT ALL ON TABLE "public"."achievement_node_map" TO "authenticated";
GRANT ALL ON TABLE "public"."achievement_node_map" TO "service_role";



GRANT ALL ON SEQUENCE "public"."achievement_node_map_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."achievement_node_map_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."achievement_node_map_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."achievements" TO "anon";
GRANT ALL ON TABLE "public"."achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."achievements" TO "service_role";



GRANT ALL ON SEQUENCE "public"."achievements_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."achievements_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."achievements_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."business_review_focus_values" TO "anon";
GRANT ALL ON TABLE "public"."business_review_focus_values" TO "authenticated";
GRANT ALL ON TABLE "public"."business_review_focus_values" TO "service_role";



GRANT ALL ON TABLE "public"."business_review_preparation_responses" TO "service_role";



GRANT ALL ON TABLE "public"."business_review_system_priorities" TO "anon";
GRANT ALL ON TABLE "public"."business_review_system_priorities" TO "authenticated";
GRANT ALL ON TABLE "public"."business_review_system_priorities" TO "service_role";



GRANT ALL ON TABLE "public"."business_review_system_ratings" TO "anon";
GRANT ALL ON TABLE "public"."business_review_system_ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."business_review_system_ratings" TO "service_role";



GRANT ALL ON SEQUENCE "public"."business_reviews_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."business_reviews_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."business_reviews_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."coach_profiles" TO "anon";
GRANT ALL ON TABLE "public"."coach_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_profiles" TO "service_role";



GRANT ALL ON SEQUENCE "public"."coaching_note_action_steps_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."coaching_note_action_steps_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."coaching_note_action_steps_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."coaching_note_comments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."coaching_note_comments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."coaching_note_comments_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."coaching_notes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."coaching_notes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."coaching_notes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."coaching_private_notes" TO "anon";
GRANT ALL ON TABLE "public"."coaching_private_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."coaching_private_notes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."coaching_private_notes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."coaching_private_notes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."coaching_private_notes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."content_blocks" TO "anon";
GRANT ALL ON TABLE "public"."content_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."content_blocks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."content_blocks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."content_blocks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."content_blocks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."content_node_roles" TO "anon";
GRANT ALL ON TABLE "public"."content_node_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."content_node_roles" TO "service_role";



GRANT ALL ON TABLE "public"."content_node_tags" TO "anon";
GRANT ALL ON TABLE "public"."content_node_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."content_node_tags" TO "service_role";



GRANT ALL ON TABLE "public"."content_nodes" TO "anon";
GRANT ALL ON TABLE "public"."content_nodes" TO "authenticated";
GRANT ALL ON TABLE "public"."content_nodes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."content_nodes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."content_nodes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."content_nodes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."course_sort_orders" TO "anon";
GRANT ALL ON TABLE "public"."course_sort_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."course_sort_orders" TO "service_role";



GRANT ALL ON TABLE "public"."courses" TO "anon";
GRANT ALL ON TABLE "public"."courses" TO "authenticated";
GRANT ALL ON TABLE "public"."courses" TO "service_role";



GRANT ALL ON SEQUENCE "public"."courses_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."courses_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."courses_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."focus_finder_dimensions" TO "anon";
GRANT ALL ON TABLE "public"."focus_finder_dimensions" TO "authenticated";
GRANT ALL ON TABLE "public"."focus_finder_dimensions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."focus_finder_dimensions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."focus_finder_dimensions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."focus_finder_dimensions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."focus_finder_templates" TO "anon";
GRANT ALL ON TABLE "public"."focus_finder_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."focus_finder_templates" TO "service_role";



GRANT ALL ON TABLE "public"."kpi_metric_types" TO "anon";
GRANT ALL ON TABLE "public"."kpi_metric_types" TO "authenticated";
GRANT ALL ON TABLE "public"."kpi_metric_types" TO "service_role";



GRANT ALL ON SEQUENCE "public"."kpi_metric_types_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."kpi_metric_types_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."kpi_metric_types_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."meeting_attendance_base" TO "anon";
GRANT ALL ON TABLE "public"."meeting_attendance_base" TO "authenticated";
GRANT ALL ON TABLE "public"."meeting_attendance_base" TO "service_role";



GRANT ALL ON TABLE "public"."meeting_attendance" TO "anon";
GRANT ALL ON TABLE "public"."meeting_attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."meeting_attendance" TO "service_role";



GRANT ALL ON TABLE "public"."meeting_types" TO "anon";
GRANT ALL ON TABLE "public"."meeting_types" TO "authenticated";
GRANT ALL ON TABLE "public"."meeting_types" TO "service_role";



GRANT ALL ON SEQUENCE "public"."meeting_types_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."meeting_types_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."meeting_types_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."meetings_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."meetings_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."meetings_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."monthly_kpi_records_base" TO "anon";
GRANT ALL ON TABLE "public"."monthly_kpi_records_base" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_kpi_records_base" TO "service_role";



GRANT ALL ON TABLE "public"."monthly_kpi_records" TO "anon";
GRANT ALL ON TABLE "public"."monthly_kpi_records" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_kpi_records" TO "service_role";



GRANT ALL ON SEQUENCE "public"."monthly_kpi_records_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."monthly_kpi_records_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."monthly_kpi_records_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."monthly_kpi_values" TO "anon";
GRANT ALL ON TABLE "public"."monthly_kpi_values" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_kpi_values" TO "service_role";



GRANT ALL ON SEQUENCE "public"."monthly_kpi_values_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."monthly_kpi_values_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."monthly_kpi_values_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."node_assets_v" TO "anon";
GRANT ALL ON TABLE "public"."node_assets_v" TO "authenticated";
GRANT ALL ON TABLE "public"."node_assets_v" TO "service_role";



GRANT ALL ON TABLE "public"."node_children" TO "anon";
GRANT ALL ON TABLE "public"."node_children" TO "authenticated";
GRANT ALL ON TABLE "public"."node_children" TO "service_role";



GRANT ALL ON TABLE "public"."node_edge_rules" TO "anon";
GRANT ALL ON TABLE "public"."node_edge_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."node_edge_rules" TO "service_role";



GRANT ALL ON TABLE "public"."partnership_users" TO "anon";
GRANT ALL ON TABLE "public"."partnership_users" TO "authenticated";
GRANT ALL ON TABLE "public"."partnership_users" TO "service_role";



GRANT ALL ON TABLE "public"."partnerships" TO "anon";
GRANT ALL ON TABLE "public"."partnerships" TO "authenticated";
GRANT ALL ON TABLE "public"."partnerships" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."resource_access" TO "anon";
GRANT ALL ON TABLE "public"."resource_access" TO "authenticated";
GRANT ALL ON TABLE "public"."resource_access" TO "service_role";



GRANT ALL ON SEQUENCE "public"."resource_access_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."resource_access_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."resource_access_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."resource_block_locations" TO "anon";
GRANT ALL ON TABLE "public"."resource_block_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."resource_block_locations" TO "service_role";



GRANT ALL ON TABLE "public"."resource_primary_location" TO "anon";
GRANT ALL ON TABLE "public"."resource_primary_location" TO "authenticated";
GRANT ALL ON TABLE "public"."resource_primary_location" TO "service_role";



GRANT ALL ON TABLE "public"."resource_tags" TO "anon";
GRANT ALL ON TABLE "public"."resource_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."resource_tags" TO "service_role";



GRANT ALL ON TABLE "public"."resources" TO "anon";
GRANT ALL ON TABLE "public"."resources" TO "authenticated";
GRANT ALL ON TABLE "public"."resources" TO "service_role";



GRANT ALL ON SEQUENCE "public"."resources_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."resources_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."resources_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON SEQUENCE "public"."roles_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."roles_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."roles_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."search_analytics" TO "anon";
GRANT ALL ON TABLE "public"."search_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."search_analytics" TO "service_role";



GRANT ALL ON SEQUENCE "public"."search_analytics_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."search_analytics_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."search_analytics_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."site_announcements" TO "anon";
GRANT ALL ON TABLE "public"."site_announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."site_announcements" TO "service_role";



GRANT ALL ON SEQUENCE "public"."site_announcements_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."site_announcements_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."site_announcements_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."smart_doc_prompts" TO "anon";
GRANT ALL ON TABLE "public"."smart_doc_prompts" TO "authenticated";
GRANT ALL ON TABLE "public"."smart_doc_prompts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smart_doc_prompts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smart_doc_prompts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smart_doc_prompts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."smart_doc_response_values" TO "anon";
GRANT ALL ON TABLE "public"."smart_doc_response_values" TO "authenticated";
GRANT ALL ON TABLE "public"."smart_doc_response_values" TO "service_role";



GRANT ALL ON TABLE "public"."smart_doc_responses" TO "anon";
GRANT ALL ON TABLE "public"."smart_doc_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."smart_doc_responses" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smart_doc_responses_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smart_doc_responses_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smart_doc_responses_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."smart_docs" TO "anon";
GRANT ALL ON TABLE "public"."smart_docs" TO "authenticated";
GRANT ALL ON TABLE "public"."smart_docs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smart_docs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smart_docs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smart_docs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."system_scorecard_categories" TO "anon";
GRANT ALL ON TABLE "public"."system_scorecard_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."system_scorecard_categories" TO "service_role";



GRANT ALL ON SEQUENCE "public"."system_scorecard_categories_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."system_scorecard_categories_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."system_scorecard_categories_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."system_scorecard_systems" TO "anon";
GRANT ALL ON TABLE "public"."system_scorecard_systems" TO "authenticated";
GRANT ALL ON TABLE "public"."system_scorecard_systems" TO "service_role";



GRANT ALL ON SEQUENCE "public"."system_scorecard_systems_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."system_scorecard_systems_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."system_scorecard_systems_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."system_scorecard_templates" TO "anon";
GRANT ALL ON TABLE "public"."system_scorecard_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."system_scorecard_templates" TO "service_role";



GRANT ALL ON TABLE "public"."system_scorecard_version_migrations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."system_scorecard_version_migrations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."system_scorecard_version_migrations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."system_scorecard_version_migrations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tags" TO "anon";
GRANT ALL ON TABLE "public"."tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tags" TO "service_role";



GRANT ALL ON TABLE "public"."tag_usage" TO "anon";
GRANT ALL ON TABLE "public"."tag_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."tag_usage" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tags_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tags_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tags_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_achievements" TO "anon";
GRANT ALL ON TABLE "public"."user_achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."user_achievements" TO "service_role";



GRANT ALL ON TABLE "public"."user_achievements_inferred" TO "anon";
GRANT ALL ON TABLE "public"."user_achievements_inferred" TO "authenticated";
GRANT ALL ON TABLE "public"."user_achievements_inferred" TO "service_role";



GRANT ALL ON TABLE "public"."user_achievements_extraneous" TO "anon";
GRANT ALL ON TABLE "public"."user_achievements_extraneous" TO "authenticated";
GRANT ALL ON TABLE "public"."user_achievements_extraneous" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_achievements_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_achievements_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_achievements_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_achievements_missing" TO "anon";
GRANT ALL ON TABLE "public"."user_achievements_missing" TO "authenticated";
GRANT ALL ON TABLE "public"."user_achievements_missing" TO "service_role";



GRANT ALL ON TABLE "public"."user_assistants" TO "anon";
GRANT ALL ON TABLE "public"."user_assistants" TO "authenticated";
GRANT ALL ON TABLE "public"."user_assistants" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_assistants_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_assistants_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_assistants_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_attention_effective" TO "anon";
GRANT ALL ON TABLE "public"."user_attention_effective" TO "authenticated";
GRANT ALL ON TABLE "public"."user_attention_effective" TO "service_role";



GRANT ALL ON TABLE "public"."user_attention_status_log" TO "anon";
GRANT ALL ON TABLE "public"."user_attention_status_log" TO "authenticated";
GRANT ALL ON TABLE "public"."user_attention_status_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_attention_status_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_attention_status_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_attention_status_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_coaches" TO "anon";
GRANT ALL ON TABLE "public"."user_coaches" TO "authenticated";
GRANT ALL ON TABLE "public"."user_coaches" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_coaches_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_coaches_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_coaches_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_course_visibility" TO "anon";
GRANT ALL ON TABLE "public"."user_course_visibility" TO "authenticated";
GRANT ALL ON TABLE "public"."user_course_visibility" TO "service_role";



GRANT ALL ON TABLE "public"."user_merge_log" TO "anon";
GRANT ALL ON TABLE "public"."user_merge_log" TO "authenticated";
GRANT ALL ON TABLE "public"."user_merge_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_merge_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_merge_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_merge_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_node_progress" TO "anon";
GRANT ALL ON TABLE "public"."user_node_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."user_node_progress" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."user_system_scorecard_last_reviews" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_training_assignments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_training_assignments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_training_assignments_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."wins_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."wins_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."wins_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."zoom_attendance_aliases" TO "anon";
GRANT ALL ON TABLE "public"."zoom_attendance_aliases" TO "authenticated";
GRANT ALL ON TABLE "public"."zoom_attendance_aliases" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";





