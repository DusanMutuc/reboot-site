-- Synthetic integration data only. Loaded after transferBusinessReviews.sql.
update auth.users set email = case id
  when '00000000-0000-0000-0000-000000000901' then 'old@example.test'
  else 'new@example.test' end;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000903', 'coach@example.test'),
  ('00000000-0000-0000-0000-000000000904', 'other@example.test');
insert into profiles (id) select id from auth.users on conflict do nothing;
-- Keep the source's deleted draft and the destination's pre-existing review
-- outside the active September coaching cycle used by these fixtures.
update business_reviews set review_date='2026-10-01' where id=902;
update business_reviews set review_date='2026-08-01' where id=903;
update profiles set ghl_contact_id = case id
  when '00000000-0000-0000-0000-000000000901' then 'source-contact'
  when '00000000-0000-0000-0000-000000000902' then 'stale-destination-contact'
  else null end;
insert into roles (code) values ('admin'), ('user') on conflict do nothing;
insert into user_roles (user_id, role_id)
select '00000000-0000-0000-0000-000000000903', id from roles where code = 'admin';
insert into user_roles (user_id, role_id)
select '00000000-0000-0000-0000-000000000901', id from roles where code = 'user';

insert into meeting_types (id, name, code) values (902, 'Implementation', 'IMPLEMENTATION_MEETING');
insert into meetings (id, meeting_type_id, date, meeting_timezone) values
  (902, 902, '2026-09-10', 'America/Edmonton'),
  (903, 902, '2026-09-17', 'America/Edmonton'),
  (904, 902, '2026-09-24', 'America/Edmonton');
insert into meeting_attendance_base (meeting_id, user_id, attended, created_at, updated_at) values
  (901, '00000000-0000-0000-0000-000000000901', true, '2026-09-01', '2026-09-01'),
  (902, '00000000-0000-0000-0000-000000000901', true, '2026-09-10', '2026-09-10'),
  (903, '00000000-0000-0000-0000-000000000901', false, '2026-09-17', '2026-09-17'),
  (904, '00000000-0000-0000-0000-000000000901', false, '2026-09-24', '2026-09-24'),
  (901, '00000000-0000-0000-0000-000000000902', false, '2026-08-20', '2026-08-20');

insert into system_implementation_guides (id, audience, system_key, current_revision, updated_by)
values ('00000000-0000-0000-0000-000000000a01', 'foundation', 'foundation', 1,
  '00000000-0000-0000-0000-000000000903');
insert into system_implementation_guide_versions (guide_id, revision, steps, created_by)
values ('00000000-0000-0000-0000-000000000a01', 1,
  '[{"id":"00000000-0000-0000-0000-000000000b01","title":"Pinned first step","description":"Historical guide text","sources":[]},
    {"id":"00000000-0000-0000-0000-000000000b02","title":"Pinned second step","description":"Do not regenerate from current guide","sources":[]}]',
  '00000000-0000-0000-0000-000000000903');
insert into implementation_action_checklists
  (action_step_id, guide_id, guide_revision, steps, progress, created_at, updated_at)
select 901, guide_id, revision, steps,
  '{"00000000-0000-0000-0000-000000000b01":{"completed":true,"completedAt":"2026-09-10T15:00:00Z","meetingId":902},
    "00000000-0000-0000-0000-000000000b02":{"completed":false,"completedAt":null,"meetingId":null}}',
  '2026-09-10', '2026-09-17'
from system_implementation_guide_versions where guide_id = '00000000-0000-0000-0000-000000000a01';

insert into implementation_meeting_sessions
  (id, note_id, meeting_id, user_id, status, revision, started_at, updated_at, completed_at,
   updated_by, notes, commitments, progress_snapshot,
   notes_written_at, notes_author_id, notes_updated_at, notes_updated_by)
values
  ('00000000-0000-0000-0000-000000000c01', 901, 902, '00000000-0000-0000-0000-000000000901',
    'completed', 5, '2026-09-10T14:00:00Z', '2026-09-10T16:00:00Z', '2026-09-10T16:00:00Z',
    '00000000-0000-0000-0000-000000000903', 'Earlier meeting notes', 'First commitment',
    '[{"actionStepId":901,"label":"Historical action wording","status":"in_progress","guideRevision":1,
      "steps":[{"id":"00000000-0000-0000-0000-000000000b01","title":"Original frozen wording"}],
      "progress":{"00000000-0000-0000-0000-000000000b01":{"completed":true,"meetingId":902}}},
      {"actionStepId":902,"label":"Completed task","status":"complete","steps":[],"progress":{}}]',
    '2026-09-10T14:01:00Z', '00000000-0000-0000-0000-000000000903',
    '2026-09-10T15:01:00Z', '00000000-0000-0000-0000-000000000901'),
  ('00000000-0000-0000-0000-000000000c02', 901, 903, '00000000-0000-0000-0000-000000000901',
    'open', 7, '2026-09-17T14:00:00Z', '2026-09-17T16:00:00Z', null,
    '00000000-0000-0000-0000-000000000901', 'Current meeting notes', 'Current commitment',
    public.build_implementation_progress_snapshot(901),
    '2026-09-17T14:01:00Z', '00000000-0000-0000-0000-000000000901', null, null);
update implementation_meeting_sessions set next_meeting_booked=true
where id='00000000-0000-0000-0000-000000000c01';
insert into implementation_session_actions (session_id, action_step_id)
select id, action_id from implementation_meeting_sessions cross join (values (901), (902)) actions(action_id);
insert into implementation_step_notes (id, session_id, action_step_id, step_id, body, author_id, created_at)
values ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000c01',
  901, '00000000-0000-0000-0000-000000000b01', 'Evidence recorded in first meeting',
  '00000000-0000-0000-0000-000000000901', '2026-09-10T15:00:00Z');
insert into implementation_step_events (id, session_id, action_step_id, step_id, completed, created_by, created_at)
values
  ('00000000-0000-0000-0000-000000000e01', '00000000-0000-0000-0000-000000000c01',
    901, '00000000-0000-0000-0000-000000000b01', true, '00000000-0000-0000-0000-000000000903', '2026-09-10T15:00:00Z'),
  ('00000000-0000-0000-0000-000000000e02', '00000000-0000-0000-0000-000000000c02',
    901, '00000000-0000-0000-0000-000000000b02', true, '00000000-0000-0000-0000-000000000901', '2026-09-17T15:00:00Z'),
  ('00000000-0000-0000-0000-000000000e03', '00000000-0000-0000-0000-000000000c02',
    901, '00000000-0000-0000-0000-000000000b02', false, null, '2026-09-17T15:01:00Z');
insert into general_coaching_notes (id, user_id, author_id, body, created_at) values
  ('00000000-0000-0000-0000-000000000f01', '00000000-0000-0000-0000-000000000901',
    '00000000-0000-0000-0000-000000000903', 'Standalone staff note', '2026-09-04'),
  ('00000000-0000-0000-0000-000000000f02', '00000000-0000-0000-0000-000000000901',
    '00000000-0000-0000-0000-000000000901', 'Standalone source-authored note', '2026-09-05'),
  ('00000000-0000-0000-0000-000000000f03', '00000000-0000-0000-0000-000000000902',
    null, 'Existing destination note', '2026-09-02');

insert into content_nodes (id, node_type, title, owner_id, created_by, updated_by) values
  (901, 'course', 'Transfer training course', '00000000-0000-0000-0000-000000000901',
    '00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000901');
insert into user_training_assignments
  (id,user_id,course_node_id,coaching_note_id,assigned_by,assigned_at,context_label,due_at,ended_at,ended_by)
values
  (901,'00000000-0000-0000-0000-000000000901',901,901,'00000000-0000-0000-0000-000000000903',
    '2026-09-02','Ended training assignment','2026-09-10','2026-09-12','00000000-0000-0000-0000-000000000903'),
  (902,'00000000-0000-0000-0000-000000000901',901,901,'00000000-0000-0000-0000-000000000903',
    '2026-09-13','Current training assignment','2026-09-30',null,null);
insert into user_coaches (user_id,coach_id,is_active,assigned_at,ended_at)
values ('00000000-0000-0000-0000-000000000901','00000000-0000-0000-0000-000000000903',false,'2026-08-01','2026-08-31');
insert into coaching_private_notes (id,user_id,author_id,body,created_at) values
  (901,'00000000-0000-0000-0000-000000000901','00000000-0000-0000-0000-000000000903','Legacy private note','2026-08-01');
insert into user_assistants (user_id,assistant_id,is_active,assigned_at,ended_at,assigned_by,notes) values
  ('00000000-0000-0000-0000-000000000901','00000000-0000-0000-0000-000000000904',false,
    '2026-07-01','2026-08-01','00000000-0000-0000-0000-000000000903','Former assistant');
insert into member_pauses (id,user_id,started_at,ended_at,reason,started_by,ended_by) values
  ('00000000-0000-0000-0000-000000000f04','00000000-0000-0000-0000-000000000901',
    '2026-07-01','2026-07-15','Historical pause','00000000-0000-0000-0000-000000000903','00000000-0000-0000-0000-000000000903');
insert into member_home_preferences (user_id,default_home) values
  ('00000000-0000-0000-0000-000000000901','ninety-day');
insert into ninety_day_cycles (id,name,starts_on,ends_on,status) values
  (901,'Historical programme','2026-01-01','2026-03-31','completed'),
  (902,'Current programme','2026-09-01','2026-11-29','draft');
insert into content_nodes (id,node_type,title,slug)
select 910+n,'lesson','Programme system '||n,'transfer-programme-system-'||n from generate_series(1,8)n;
insert into ninety_day_cycle_systems (cycle_id,node_id,position)
select 902,910+n,n from generate_series(1,8)n;
update ninety_day_cycles set status='active',active_system_node_id=911 where id=902;
insert into ninety_day_cycle_users (cycle_id,user_id,enrolled_at,ended_at,outcome) values
  (901,'00000000-0000-0000-0000-000000000901','2026-01-01','2026-03-31','promoted'),
  (902,'00000000-0000-0000-0000-000000000901','2026-09-01',null,null);

insert into smart_docs (id,title,created_by) values (901,'Transfer questionnaire','00000000-0000-0000-0000-000000000901');
insert into content_blocks (id,node_id,position,block_type,smart_doc_id) values
  (901,901,1,'smart_doc',901),(902,901,2,'smart_doc',901),(903,901,3,'smart_doc',901);
insert into smart_doc_prompts (id,doc_id,position,label) values
  (901,901,1,'First answer'),(902,901,2,'Second answer');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000901';
insert into smart_doc_responses (id,content_block_id,user_id,status,started_at,submitted_at,created_by,updated_by,updated_at)
values
  (901,901,'00000000-0000-0000-0000-000000000901','submitted','2026-08-01','2026-09-01',
    '00000000-0000-0000-0000-000000000901','00000000-0000-0000-0000-000000000901','2026-09-01'),
  (902,901,'00000000-0000-0000-0000-000000000902','draft','2026-08-01',null,
    '00000000-0000-0000-0000-000000000902','00000000-0000-0000-0000-000000000902','2026-10-01'),
  (903,902,'00000000-0000-0000-0000-000000000901','submitted','2026-08-01','2026-09-01',
    '00000000-0000-0000-0000-000000000901','00000000-0000-0000-0000-000000000901','2026-09-01'),
  (904,902,'00000000-0000-0000-0000-000000000902','submitted','2026-08-01','2026-09-02',
    '00000000-0000-0000-0000-000000000902','00000000-0000-0000-0000-000000000902','2026-09-02'),
  (905,903,'00000000-0000-0000-0000-000000000901','draft','2026-08-01',null,
    '00000000-0000-0000-0000-000000000901','00000000-0000-0000-0000-000000000901','2026-09-01');
insert into smart_doc_response_values (response_id,prompt_id,value_json,created_by,updated_by,updated_at)
select id,901,jsonb_build_object('text','First response '||id),created_by,updated_by,updated_at from smart_doc_responses;
insert into smart_doc_response_values (response_id,prompt_id,value_json,created_by,updated_by,updated_at)
select id,902,jsonb_build_object('text','Destination-only answer '||id),created_by,updated_by,updated_at
from smart_doc_responses where user_id='00000000-0000-0000-0000-000000000902';
set local request.jwt.claim.sub='';

insert into kpi_metric_types (id,key,name) values (901,'transfer_metric','Transfer metric');
insert into monthly_kpi_records_base (id,user_id,period_start_date,last_updated_by) values
  (901,'00000000-0000-0000-0000-000000000901','2026-08-01','00000000-0000-0000-0000-000000000901'),
  (902,'00000000-0000-0000-0000-000000000902','2026-08-01','00000000-0000-0000-0000-000000000902'),
  (903,'00000000-0000-0000-0000-000000000902','2026-09-01','00000000-0000-0000-0000-000000000902');
insert into monthly_kpi_values (id,monthly_kpi_record_id,metric_type_id,value) values
  (901,901,901,8),(902,902,901,80),(903,903,901,90);
