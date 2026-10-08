insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000901'),
  ('00000000-0000-0000-0000-000000000902');
insert into profiles (id) select id from auth.users;
insert into focus_finder_templates (key, name, version) values ('transfer_focus', 'Transfer focus', 1);
insert into focus_finder_dimensions (id, template_key, key, group_key, group_label, label, subtitle, position)
values (901, 'transfer_focus', 'focus', 'attract', 'Attract', 'Focus', 'Focus', 1);
insert into system_scorecard_templates (key, audience, name, version) values
  ('transfer_legends', 'legends', 'Transfer Legends', 1),
  ('transfer_foundation', 'foundation', 'Transfer Foundation', 1);
insert into system_scorecard_categories (id, template_key, key, label, position) values
  (901, 'transfer_legends', 'systems', 'Systems', 1),
  (902, 'transfer_foundation', 'systems', 'Systems', 1);
insert into system_scorecard_systems (id, template_key, category_id, key, label, position) values
  (901, 'transfer_legends', 901, 'legend', 'Legend', 1),
  (902, 'transfer_foundation', 902, 'foundation', 'Foundation', 1);
insert into meeting_types (id, name, code) values (901, 'Business Review', 'M2_MEETING');
insert into meetings (id, meeting_type_id, date) values (901, 901, '2026-09-01');
insert into coaching_notes_base (id, user_id, m2_meeting_id, created_at, updated_at, deleted_at, deleted_by) values
  (901, '00000000-0000-0000-0000-000000000901', 901, '2026-09-01', '2026-09-02', null, null),
  (902, '00000000-0000-0000-0000-000000000901', null, '2026-09-01', '2026-09-02', '2026-09-03', '00000000-0000-0000-0000-000000000901'),
  (903, '00000000-0000-0000-0000-000000000902', null, '2026-09-01', '2026-09-02', null, null);
insert into business_reviews (id, user_id, coaching_note_id, focus_finder_template_key,
  review_date, status, completed_at, completed_by, system_scorecard_template_key, meeting_id) values
  (901, '00000000-0000-0000-0000-000000000901', 901, 'transfer_focus', '2026-09-01',
    'completed', '2026-09-02', '00000000-0000-0000-0000-000000000901', 'transfer_legends', 901),
  (902, '00000000-0000-0000-0000-000000000901', 902, 'transfer_focus', '2026-09-02',
    'draft', null, null, null, null),
  (903, '00000000-0000-0000-0000-000000000902', 903, 'transfer_focus', '2026-09-01',
    'draft', null, null, null, null);
insert into business_review_focus_values (business_review_id, template_key, dimension_id, value, updated_by)
values (901, 'transfer_focus', 901, 6, '00000000-0000-0000-0000-000000000901');
insert into business_review_preparation_responses (business_review_id, business_forward_wins,
  personal_forward_wins, greatest_business_challenge, greatest_personal_challenge,
  desired_call_outcome, topics_to_discuss, business_rating, personal_rating)
values (901, 'Business wins', 'Personal wins', 'Business challenge', 'Personal challenge', 'Outcome', 'Topics', 8, 9);
insert into business_review_additional_scorecards (business_review_id, template_key, assigned_by)
values (901, 'transfer_foundation', '00000000-0000-0000-0000-000000000901');
insert into business_review_system_ratings (business_review_id, template_key, system_id, status, reviewed_at, reviewed_by)
values (901, 'transfer_legends', 901, 'not_started', null, null),
  (901, 'transfer_foundation', 902, 'complete', '2026-09-02', '00000000-0000-0000-0000-000000000901');
insert into coaching_note_action_steps (id, coaching_note_id, label, status) values
  (901, 901, 'Foundation priority', 'in_progress'), (902, 901, 'Completed task', 'complete');
insert into coaching_note_comments (coaching_note_id, author_id, body)
values (901, '00000000-0000-0000-0000-000000000901', 'Review discussion');
insert into business_review_system_priorities (business_review_id, system_id, position, action_step_id, starting_status, selected_by)
values (901, 902, 1, 901, 'complete', '00000000-0000-0000-0000-000000000901');
insert into system_scorecard_version_migrations (business_review_id, from_template_key,
  to_template_key, migrated_by, resolution, previous_snapshot)
values (901, 'transfer_legends', 'transfer_legends', '00000000-0000-0000-0000-000000000901',
  '{"preserved":["foundation"]}', '{"priorities":[{"action_step_id":901}]}');
