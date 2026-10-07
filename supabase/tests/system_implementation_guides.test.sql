-- Local-only fixture suite; all data and role changes are rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, raw_app_meta_data, raw_user_meta_data)
select ('00000000-0000-0000-0000-00000000096' || n)::uuid, '{}', '{}'
from generate_series(1, 5) n;
insert into public.profiles (id, first_name)
select ('00000000-0000-0000-0000-00000000096' || n)::uuid, 'Guide fixture ' || n
from generate_series(1, 5) n;
insert into public.roles (code)
select wanted.code from unnest(array['admin', 'superadmin', 'coach', 'implementation_coach']) wanted(code)
where not exists (select 1 from public.roles r where r.code = wanted.code);
insert into public.user_roles (user_id, role_id)
select ('00000000-0000-0000-0000-00000000096' || x.n)::uuid, r.id
from (values (1, 'admin'), (2, 'superadmin'), (3, 'coach'), (4, 'implementation_coach')) x(n, code)
join public.roles r on r.code = x.code;

-- Independent active fixtures avoid depending on production scorecard content.
update public.system_scorecard_templates set is_active = false where is_active;
insert into public.system_scorecard_templates (key, audience, name, version, is_active)
select 'guide_test_foundation_v' || n, 'foundation', 'Guide fixture',
  coalesce((select max(version) from public.system_scorecard_templates where audience = 'foundation'), 0) + n,
  n = 1
from generate_series(1, 2) n;
insert into public.system_scorecard_templates (key, audience, name, version, is_active)
select 'guide_test_legends', 'legends', 'Guide fixture',
  coalesce((select max(version) from public.system_scorecard_templates where audience = 'legends'), 0) + 1, true;
insert into public.system_scorecard_categories (id, template_key, key, label, position)
values (961001, 'guide_test_foundation_v1', 'guide_fixture', 'Fixture', 1),
       (961002, 'guide_test_foundation_v2', 'guide_fixture', 'Fixture', 1),
       (961003, 'guide_test_legends', 'guide_fixture', 'Fixture', 1);
insert into public.system_scorecard_systems (id, template_key, category_id, key, label, position)
values (961011, 'guide_test_foundation_v1', 961001, 'guide_fixture', 'Original label', 1),
       (961012, 'guide_test_foundation_v2', 961002, 'guide_fixture', 'Renamed label', 1),
       (961013, 'guide_test_foundation_v2', 961002, 'inactive_only', 'Inactive only', 2),
       (961014, 'guide_test_legends', 961003, 'guide_fixture', 'Same key, Legends', 1);
insert into public.resources (id, title, type, url, state)
values (961101, 'Guide PDF fixture', 'pdf', 'https://example.invalid/guide.pdf', 'published'),
       (961102, 'Guide video fixture', 'video', 'https://example.invalid/guide-video', 'draft');

create function pg_temp.guide_fixture_steps() returns jsonb language sql immutable as $$
  select jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-000000000a01',
      'title', '  First step  ', 'description', E'  First line\nSecond line  ',
      'resources', jsonb_build_array(jsonb_build_object('resourceId', 961101, 'pageStart', 2, 'pageEnd', 3))),
    jsonb_build_object('id', '00000000-0000-0000-0000-000000000a02',
      'title', 'Second step', 'description', 'Second description',
      'resources', jsonb_build_array(jsonb_build_object('resourceId', 961102)))
  );
$$;

select ok(not has_table_privilege('authenticated', 'public.system_implementation_guides', 'INSERT'), 'Clients cannot create headers directly');
select ok(not has_table_privilege('authenticated', 'public.system_implementation_guides', 'UPDATE'), 'Clients cannot bypass header revision control');
select ok(not has_table_privilege('authenticated', 'public.system_implementation_guide_versions', 'INSERT'), 'Clients cannot append unvalidated revisions directly');
select ok(not has_table_privilege('authenticated', 'public.system_implementation_guide_versions', 'UPDATE'), 'Clients cannot rewrite old revisions');
select ok(not has_table_privilege('authenticated', 'public.system_implementation_guide_versions', 'DELETE'), 'Clients cannot delete revision history');
select ok(not has_table_privilege('service_role', 'public.system_implementation_guide_versions', 'UPDATE'), 'Service role also cannot rewrite revision history');
select ok(not has_table_privilege('anon', 'public.system_implementation_guides', 'SELECT'), 'Anonymous clients cannot read the staff guide library');
select ok(not has_function_privilege('anon', 'public.save_system_implementation_guide(public.system_scorecard_audience,text,integer,jsonb)', 'EXECUTE'), 'Anonymous clients cannot execute save');
select ok(not has_function_privilege('authenticated', 'public.normalize_system_implementation_guide_steps(jsonb)', 'EXECUTE'), 'Internal validator is not a public endpoint');

set local request.jwt.claim.sub = '';
select throws_ok($$select * from public.save_system_implementation_guide('foundation','guide_fixture',0,pg_temp.guide_fixture_steps())$$,
  '42501', null, 'A missing authenticated actor cannot save even through a privileged connection');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000965';
select throws_ok($$select * from public.save_system_implementation_guide('foundation','guide_fixture',0,pg_temp.guide_fixture_steps())$$,
  '42501', null, 'A member cannot save');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000963';
select throws_ok($$select * from public.save_system_implementation_guide('foundation','guide_fixture',0,pg_temp.guide_fixture_steps())$$,
  '42501', null, 'A coach cannot edit the shared guide library');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000964';
select throws_ok($$select * from public.save_system_implementation_guide('foundation','guide_fixture',0,pg_temp.guide_fixture_steps())$$,
  '42501', null, 'An implementation coach cannot edit the shared guide library');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000961';
select lives_ok($$select * from public.save_system_implementation_guide('foundation','guide_fixture',0,pg_temp.guide_fixture_steps())$$,
  'An admin creates a guide with a PDF and a non-PDF resource');
select is((select current_revision from public.system_implementation_guides where audience='foundation' and system_key='guide_fixture'), 1, 'First save creates revision 1');
select is((select steps->0->>'title' from public.system_implementation_guide_versions v join public.system_implementation_guides g on g.id=v.guide_id where g.audience='foundation' and g.system_key='guide_fixture'), 'First step', 'Outer whitespace is trimmed');
select is((select steps->0->>'description' from public.system_implementation_guide_versions v join public.system_implementation_guides g on g.id=v.guide_id where g.audience='foundation' and g.system_key='guide_fixture'), E'First line\nSecond line', 'Multiline descriptions retain their internal line breaks');
select is((select steps->1->'resources'->0 from public.system_implementation_guide_versions v join public.system_implementation_guides g on g.id=v.guide_id where g.audience='foundation' and g.system_key='guide_fixture'), '{"resourceId":961102,"pageStart":null,"pageEnd":null}'::jsonb, 'Optional page numbers have a canonical null representation');
select is((select updated_by from public.system_implementation_guides where audience='foundation' and system_key='guide_fixture'), '00000000-0000-0000-0000-000000000961'::uuid, 'Server records the authenticated editor');
select throws_ok($$select * from public.save_system_implementation_guide('foundation','guide_fixture',0,pg_temp.guide_fixture_steps())$$,
  '40001', null, 'A competing first-save/stale editor cannot overwrite the winning revision');
select throws_ok($$select * from public.save_system_implementation_guide('foundation','inactive_only',0,'[]')$$,
  '22023', null, 'A system that only exists in an inactive version cannot be edited');
select throws_ok($$select * from public.save_system_implementation_guide('legends','inactive_only',0,'[]')$$,
  '22023', null, 'A key from another audience does not qualify');
select throws_ok($$select * from public.save_system_implementation_guide('foundation','guide_fixture',-1,'[]')$$,
  '22023', null, 'Expected revision must be nonnegative');

-- Invalid inputs must neither advance the header nor append a partial snapshot.
select throws_ok(format($sql$select * from public.save_system_implementation_guide('foundation','guide_fixture',1,%L::jsonb)$sql$, invalid),
  '22023', null, label)
from (
  values
    ('null'::jsonb, 'Null step list rejected'),
    ('{}'::jsonb, 'Non-array step list rejected'),
    ('[null]'::jsonb, 'Null step rejected'),
    ('[{}]'::jsonb, 'Missing required fields rejected'),
    (jsonb_set(pg_temp.guide_fixture_steps(), '{0,id}', '"not-a-uuid"'), 'Invalid step UUID rejected'),
    (jsonb_set(pg_temp.guide_fixture_steps(), '{1,id}', '"00000000-0000-0000-0000-000000000A01"'), 'UUID duplicates rejected irrespective of case'),
    (jsonb_set(pg_temp.guide_fixture_steps(), '{0,title}', '"   "'), 'Blank title rejected'),
    (jsonb_set(pg_temp.guide_fixture_steps(), '{0,description}', '""'), 'Blank description rejected'),
    (jsonb_set(pg_temp.guide_fixture_steps(), '{0,title}', to_jsonb(repeat('x',161))), 'Oversized title rejected'),
    (jsonb_set(pg_temp.guide_fixture_steps(), '{0,description}', to_jsonb(repeat('x',8001))), 'Oversized description rejected'),
    (jsonb_set(pg_temp.guide_fixture_steps(), '{0,memberId}', '"private"'), 'Extra step payload keys rejected'),
    (jsonb_set(pg_temp.guide_fixture_steps(), '{0,resources}', 'null'), 'Null resources rejected'),
    (jsonb_set(pg_temp.guide_fixture_steps(), '{0,resources}', '[null]'), 'Null resource object rejected'),
    (jsonb_set(pg_temp.guide_fixture_steps(), '{0,resources}', '[{"resourceId":"961101"}]'), 'String resource id rejected'),
    (jsonb_set(pg_temp.guide_fixture_steps(), '{0,resources}', '[{"resourceId":0}]'), 'Nonpositive resource id rejected'),
    (jsonb_set(pg_temp.guide_fixture_steps(), '{0,resources}', '[{"resourceId":1.5}]'), 'Fractional resource id rejected'),
    (jsonb_set(pg_temp.guide_fixture_steps(), '{0,resources}', '[{"resourceId":9007199254740992}]'), 'Unsafe resource integer rejected'),
    (jsonb_set(pg_temp.guide_fixture_steps(), '{0,resources}', '[{"resourceId":961199}]'), 'Missing resource rejected'),
    (jsonb_set(pg_temp.guide_fixture_steps(), '{0,resources}', '[{"resourceId":961101,"url":"https://example.invalid"}]'), 'Extra resource payload keys rejected'),
    (jsonb_set(pg_temp.guide_fixture_steps(), '{0,resources}', '[{"resourceId":961101,"pageStart":"2"}]'), 'String page rejected'),
    (jsonb_set(pg_temp.guide_fixture_steps(), '{0,resources}', '[{"resourceId":961101,"pageStart":0}]'), 'Page zero rejected'),
    (jsonb_set(pg_temp.guide_fixture_steps(), '{0,resources}', '[{"resourceId":961101,"pageStart":1.5}]'), 'Fractional page rejected'),
    (jsonb_set(pg_temp.guide_fixture_steps(), '{0,resources}', '[{"resourceId":961101,"pageStart":2147483648}]'), 'Overflow page rejected'),
    (jsonb_set(pg_temp.guide_fixture_steps(), '{0,resources}', '[{"resourceId":961101,"pageEnd":3}]'), 'Page end without start rejected'),
    (jsonb_set(pg_temp.guide_fixture_steps(), '{0,resources}', '[{"resourceId":961101,"pageStart":3,"pageEnd":2}]'), 'Reversed page range rejected'),
    (jsonb_set(pg_temp.guide_fixture_steps(), '{0,resources}', '[{"resourceId":961101},{"resourceId":961101,"pageStart":null,"pageEnd":null}]'), 'Duplicate references rejected after optional-null normalization')
) cases(invalid,label);
select throws_ok($$select * from public.save_system_implementation_guide('foundation','guide_fixture',1,
  (select jsonb_agg(pg_temp.guide_fixture_steps()->0) from generate_series(1,51)))$$,
  '22023', 'A guide can contain at most 50 steps.', 'Guide step-count limit enforced');
select throws_ok($$select * from public.save_system_implementation_guide('foundation','guide_fixture',1,
  jsonb_set(pg_temp.guide_fixture_steps(),'{0,resources}',(select jsonb_agg(jsonb_build_object('resourceId',961101,'pageStart',n)) from generate_series(1,11)n)))$$,
  '22023', 'A step can reference at most 10 resources.', 'Per-step resource-count limit enforced');
select is((select current_revision from public.system_implementation_guides where audience='foundation' and system_key='guide_fixture'), 1, 'Rejected writes preserve the header revision');
select is((select count(*) from public.system_implementation_guide_versions v join public.system_implementation_guides g on g.id=v.guide_id where g.audience='foundation' and g.system_key='guide_fixture'), 1::bigint, 'Rejected writes leave no partial revisions');

select lives_ok($$select * from public.save_system_implementation_guide('foundation','guide_fixture',1,
  jsonb_build_array(pg_temp.guide_fixture_steps()->1, jsonb_set(pg_temp.guide_fixture_steps()->0,'{title}','"Revised first step"')))$$,
  'Reorder and edit save together in a new revision');
select is((select steps->0->>'id' from public.system_implementation_guide_versions v join public.system_implementation_guides g on g.id=v.guide_id where g.audience='foundation' and g.system_key='guide_fixture' and v.revision=2), '00000000-0000-0000-0000-000000000a02', 'Step identity is preserved through reorder');
select is((select steps->0->>'title' from public.system_implementation_guide_versions v join public.system_implementation_guides g on g.id=v.guide_id where g.audience='foundation' and g.system_key='guide_fixture' and v.revision=1), 'First step', 'Older revision text/order remains unchanged');
select lives_ok($$select * from public.save_system_implementation_guide('foundation','guide_fixture',2,'[]')$$,
  'Deleting all steps writes an empty revision');
select is((select steps from public.system_implementation_guide_versions v join public.system_implementation_guides g on g.id=v.guide_id where g.audience='foundation' and g.system_key='guide_fixture' and v.revision=3), '[]'::jsonb, 'Current deleted checklist is empty');
select is((select count(*) from public.system_implementation_guide_versions v join public.system_implementation_guides g on g.id=v.guide_id where g.audience='foundation' and g.system_key='guide_fixture'), 3::bigint, 'Clearing preserves the full revision history');

update public.system_scorecard_templates set is_active=false where key='guide_test_foundation_v1';
update public.system_scorecard_templates set is_active=true where key='guide_test_foundation_v2';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000962';
select lives_ok($$select * from public.save_system_implementation_guide('foundation','guide_fixture',3,pg_temp.guide_fixture_steps())$$,
  'Superadmin can edit the same guide after a scorecard version/label change');
select is((select count(*) from public.system_implementation_guides where audience='foundation' and system_key='guide_fixture'), 1::bigint, 'Stable system key avoids duplicate guides across scorecard versions');
select is((select current_revision from public.system_implementation_guides where audience='foundation' and system_key='guide_fixture'), 4, 'Cross-version save continues the revision sequence');
select lives_ok($$select * from public.save_system_implementation_guide('legends','guide_fixture',0,'[]')$$,
  'The same system key in another audience gets an independent guide');
select is((select count(distinct id) from public.system_implementation_guides where system_key='guide_fixture'), 2::bigint, 'Audience isolates guide identity');
set constraints system_implementation_guides_current_version_fk immediate;

-- Exercise RLS using actual client role, not only postgres visibility.
set local role authenticated;
select is((select count(*) from public.system_implementation_guides where system_key='guide_fixture'), 2::bigint, 'Superadmin can read guides');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000961';
select is((select count(*) from public.system_implementation_guides where system_key='guide_fixture'), 2::bigint, 'Admin can read guides');
select throws_ok($$update public.system_implementation_guide_versions set steps='[]'$$, '42501', null, 'Even admin client cannot rewrite snapshots directly');
select throws_ok($$delete from public.system_implementation_guide_versions$$, '42501', null, 'Even admin client cannot delete snapshot history directly');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000963';
select is((select count(*) from public.system_implementation_guides where system_key='guide_fixture'), 2::bigint, 'Coach can read guide headers');
select is((select count(*) from public.system_implementation_guide_versions v join public.system_implementation_guides g on g.id=v.guide_id where g.system_key='guide_fixture'), 5::bigint, 'Coach can read revision snapshots');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000964';
select is((select count(*) from public.system_implementation_guides where system_key='guide_fixture'), 2::bigint, 'Implementation coach can read guides');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000965';
select is((select count(*) from public.system_implementation_guides where system_key='guide_fixture'), 0::bigint, 'Member cannot read guide headers');
select is((select count(*) from public.system_implementation_guide_versions), 0::bigint, 'Member cannot read any guide snapshots');
reset role;

select * from finish();
rollback;
