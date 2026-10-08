import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// An isolated PostgreSQL engine, never the configured Supabase database.
// PGLITE_PACKAGE_DIR points at an external @electric-sql/pglite installation.
const SOURCE = '00000000-0000-0000-0000-000000000901';
const DEST = '00000000-0000-0000-0000-000000000902';
const ADMIN = '00000000-0000-0000-0000-000000000903';
const REQUEST = '00000000-0000-0000-0000-000000000123';
const NEW_TABLES = {
  implementation_action_checklists: 1,
  implementation_meeting_sessions: 2,
  implementation_session_actions: 4,
  implementation_step_notes: 1,
  implementation_step_events: 3,
  general_coaching_notes: 2,
};
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));

test('complete account transfer executes atomically against PostgreSQL', {
  skip: !process.env.PGLITE_PACKAGE_DIR,
  timeout: 180000,
}, async (t) => {
  const moduleUrl = (file) => pathToFileURL(path.resolve(process.env.PGLITE_PACKAGE_DIR, file)).href;
  const { PGlite } = await import(moduleUrl('dist/index.js'));
  const { pg_trgm } = await import(moduleUrl('dist/contrib/pg_trgm.js'));
  const db = new PGlite({ extensions: { pg_trgm } });
  const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
  const scalar = async (sql, params = []) => Object.values((await rows(sql, params))[0])[0];
  const transfer = (options = {}, source = SOURCE, dest = DEST) => scalar(
    'select public.transfer_user_data_admin_v2($1, $2, $3::jsonb)',
    [source, dest, JSON.stringify({
      dry_run: false, request_id: REQUEST, kpi_merge: 'skip',
      destination_email: 'new@example.test', destination_ghl_contact_id: 'verified-new-contact',
      ...options,
    })],
  );
  const tables = [
    'profiles', 'business_reviews', 'coaching_notes_base', 'coaching_note_action_steps', 'coaching_note_comments',
    'business_review_focus_values', 'business_review_preparation_responses', 'business_review_system_priorities',
    'business_review_system_ratings', 'business_review_additional_scorecards', 'system_scorecard_version_migrations',
    'meeting_attendance_base', 'meetings', 'user_roles', 'user_coaches', 'user_training_assignments',
    'smart_doc_responses', 'smart_doc_response_values', 'content_nodes', 'partnerships', 'partnership_users',
    'coaching_private_notes', 'member_pauses', 'member_home_preferences', 'ninety_day_cycle_users', 'user_assistants',
    'monthly_kpi_records_base', 'monthly_kpi_values', 'user_course_visibility',
    ...Object.keys(NEW_TABLES),
  ];
  const snapshot = async (includeLog = true) => {
    const result = {};
    for (const table of [...tables, ...(includeLog ? ['user_merge_log'] : [])]) {
      result[table] = await rows(`select to_jsonb(t) as row from public.${table} t order by to_jsonb(t)::text`);
    }
    return result;
  };
  const sourceGraph = async () => {
    const result = {};
    for (const table of ['profiles', 'coaching_notes_base', 'business_reviews', 'general_coaching_notes',
      'implementation_meeting_sessions', 'meeting_attendance_base', 'user_roles', 'coaching_private_notes',
      'member_pauses', 'member_home_preferences', 'ninety_day_cycle_users', 'user_assistants',
      'user_training_assignments', 'user_coaches', 'smart_doc_responses', 'monthly_kpi_records_base', 'user_course_visibility']) {
      result[table] = await rows(`select to_jsonb(t) as row from public.${table} t
        where ${table === 'profiles' ? 'id' : 'user_id'} = $1 order by to_jsonb(t)::text`, [SOURCE]);
    }
    for (const table of ['implementation_step_notes', 'implementation_step_events', 'implementation_session_actions']) {
      result[table] = await rows(`select to_jsonb(t) as row from public.${table} t
        join implementation_meeting_sessions s on s.id=t.session_id where s.user_id=$1 order by to_jsonb(t)::text`, [SOURCE]);
    }
    for (const table of ['coaching_note_action_steps', 'coaching_note_comments']) {
      result[table] = await rows(`select to_jsonb(t) as row from public.${table} t
        join coaching_notes_base n on n.id=t.coaching_note_id where n.user_id=$1 order by to_jsonb(t)::text`, [SOURCE]);
    }
    result.checklists = await rows(`select to_jsonb(c) as row from implementation_action_checklists c
      join coaching_note_action_steps a on a.id=c.action_step_id join coaching_notes_base n on n.id=a.coaching_note_id
      where n.user_id=$1 order by to_jsonb(c)::text`, [SOURCE]);
    return result;
  };
  const transactionTest = async (name, run) => t.test(name, async () => {
    await db.exec('begin;');
    try { await run(); } finally {
      await db.exec('rollback;');
      await db.exec('set session authorization postgres;');
    }
  });
  const rejectedTransfer = async (options, matcher, source = SOURCE, dest = DEST) => {
    // PostgreSQL aborts a transaction on any error; each rejected operation uses
    // a savepoint so the assertions can inspect its atomic rollback afterwards.
    await db.exec('savepoint rejected_transfer;');
    await assert.rejects(() => transfer(options, source, dest), matcher);
    await db.exec('rollback to savepoint rejected_transfer; release savepoint rejected_transfer;');
  };
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb,
        raw_app_meta_data jsonb, created_at timestamptz, last_sign_in_at timestamptz);
      create function auth.uid() returns uuid language sql as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.role() returns text language sql as
        $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
      create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
    `);
    for (const name of [
      '20260826000000_remote_schema.sql',
      '20260901001000_ninety_day_user_lifecycle.sql',
      '20260901002000_ninety_day_cycles.sql',
      '20260913010000_member_pauses.sql',
      '20260914000000_legend_foundation_scorecard.sql',
      '20260922000000_allow_concurrent_ninety_day_cycles.sql',
      '20260922010000_dual_membership_homes.sql',
      '20260925000000_carry_implementation_completion_to_next_review.sql',
      '20260925010000_system_implementation_guides.sql',
      '20260925020000_implementation_meeting_workspaces.sql',
      '20260929010000_coaching_notes_history.sql',
      '20260929020000_manual_implementation_meetings.sql',
      '20260929030000_implementation_next_meeting_booking.sql',
      '20261008000000_complete_account_transfers.sql',
    ]) {
      await db.exec(await read(`supabase/migrations/${name}`));
    }
    await db.exec('set search_path = public; set check_function_bodies = true; set row_security = on;');
    await db.exec(await read('tests/fixtures/transferBusinessReviews.sql'));
    await db.exec(`begin; ${await read('tests/fixtures/transferAccountData.sql')} commit;`);
    await db.exec('grant usage on schema auth to authenticated, service_role;');

    await transactionTest('preview counts every new row exactly, changes no member data, and matches apply', async () => {
      const before = await snapshot(false);
      const dry = await transfer({ dry_run: true });
      assert.deepEqual(await snapshot(false), before);
      assert.equal(await scalar('select count(*)::int from user_merge_log'), 1, 'only the preview audit record is written');
      for (const [table, count] of Object.entries(NEW_TABLES)) {
        assert.equal(dry.counts[table].copied, count, table);
      }
      const live = await transfer();
      assert.deepEqual(live.counts, dry.counts, 'preview must report the operations apply performs');
      for (const [table, count] of Object.entries(NEW_TABLES)) {
        const beforeCount = before[table].length;
        assert.equal(await scalar(`select count(*)::int from ${table}`), beforeCount + count, table);
      }
      assert.equal(await scalar('select ghl_contact_id from profiles where id=$1', [DEST]), 'verified-new-contact');
      assert.equal(await scalar('select ghl_user_id from profiles where id=$1', [DEST]), 'verified-new-contact');
      assert.equal(await scalar('select ghl_contact_id from profiles where id=$1', [SOURCE]), 'source-contact');
    });

    await transactionTest('copies the complete graph with new row IDs and exact historical snapshots and attribution', async () => {
      const before = await sourceGraph();
      const destinationNoteBefore = await rows('select * from general_coaching_notes where user_id=$1', [DEST]);
      await transfer();
      assert.deepEqual(await sourceGraph(), before, 'source graph must remain unchanged');
      const sourceSessions = await rows('select * from implementation_meeting_sessions where user_id=$1 order by meeting_id', [SOURCE]);
      const destSessions = await rows('select * from implementation_meeting_sessions where user_id=$1 order by meeting_id', [DEST]);
      assert.equal(destSessions.length, 2);
      const copiedNote = destSessions[0].note_id;
      assert.notEqual(copiedNote, 901);
      assert.equal(destSessions[1].note_id, copiedNote);
      assert.equal(await scalar('select user_id from coaching_notes_base where id=$1', [copiedNote]), DEST);
      const originalReview = (await rows('select * from business_reviews where id=901'))[0];
      const copiedReview = (await rows('select * from business_reviews where coaching_note_id=$1', [copiedNote]))[0];
      assert.notEqual(copiedReview.id, originalReview.id);
      assert.equal(copiedReview.meeting_id, null, 'the source retains the unique Business Review meeting link');
      assert.equal(await scalar('select m2_meeting_id from coaching_notes_base where id=$1', [copiedNote]), originalReview.meeting_id);
      assert.deepEqual(omit(copiedReview, ['id', 'user_id', 'coaching_note_id', 'meeting_id']),
        omit(originalReview, ['id', 'user_id', 'coaching_note_id', 'meeting_id']));
      for (const table of ['business_review_focus_values', 'business_review_preparation_responses',
        'business_review_additional_scorecards', 'business_review_system_ratings', 'system_scorecard_version_migrations']) {
        const content = (id) => rows(`select to_jsonb(t)-'id'-'business_review_id' as value from ${table} t
          where business_review_id=$1 order by 1`, [id]);
        const original = await content(originalReview.id);
        assert.ok(original.length, `${table} fixture must be populated`);
        assert.deepEqual(await content(copiedReview.id), original, table);
      }
      const stepRows = await rows('select id,label from coaching_note_action_steps where coaching_note_id=$1', [copiedNote]);
      const sourceSteps = await rows('select id,label from coaching_note_action_steps where coaching_note_id=901');
      const stepMap = new Map(sourceSteps.map((s) => [s.id, stepRows.find((d) => d.label === s.label).id]));
      const copiedAction = stepMap.get(901);
      assert.notEqual(copiedAction, 901);
      const sourceChecklist = (await rows('select * from implementation_action_checklists where action_step_id=901'))[0];
      const copiedChecklist = (await rows('select * from implementation_action_checklists where action_step_id=$1', [copiedAction]))[0];
      assert.deepEqual(copiedChecklist, { ...sourceChecklist, action_step_id: copiedAction });
      for (let i = 0; i < sourceSessions.length; i++) {
        const original = sourceSessions[i];
        const copied = destSessions[i];
        assert.notEqual(copied.id, original.id);
        assert.deepEqual(omit(copied, ['id', 'note_id', 'user_id', 'progress_snapshot']),
          omit(original, ['id', 'note_id', 'user_id', 'progress_snapshot']));
        assert.deepEqual(copied.progress_snapshot, original.progress_snapshot.map((action) => ({
          ...action, actionStepId: stepMap.get(action.actionStepId),
        })), 'only action references change; frozen wording/progress/meeting references remain');
        const actionRefs = await rows('select action_step_id from implementation_session_actions where session_id=$1 order by action_step_id', [copied.id]);
        assert.deepEqual(actionRefs.map((r) => r.action_step_id), [...stepMap.values()].sort((a, b) => a - b));
        for (const table of ['implementation_step_notes', 'implementation_step_events']) {
          const originalChildren = await rows(`select * from ${table} where session_id=$1 order by created_at`, [original.id]);
          const copiedChildren = await rows(`select * from ${table} where session_id=$1 order by created_at`, [copied.id]);
          assert.equal(copiedChildren.length, originalChildren.length);
          originalChildren.forEach((child, index) => {
            assert.notEqual(copiedChildren[index].id, child.id);
            assert.deepEqual(omit(copiedChildren[index], ['id']), {
              ...omit(child, ['id']), session_id: copied.id, action_step_id: stepMap.get(child.action_step_id),
            });
          });
        }
      }
      const copiedGeneral = await rows('select * from general_coaching_notes where user_id=$1 and id<>$2 order by created_at', [DEST, destinationNoteBefore[0].id]);
      const originalGeneral = await rows('select * from general_coaching_notes where user_id=$1 order by created_at', [SOURCE]);
      originalGeneral.forEach((original, index) => {
        assert.notEqual(copiedGeneral[index].id, original.id);
        assert.deepEqual(omit(copiedGeneral[index], ['id', 'user_id']), omit(original, ['id', 'user_id']));
      });
      assert.deepEqual(await rows('select * from general_coaching_notes where id=$1', [destinationNoteBefore[0].id]), destinationNoteBefore);
      assert.equal(await scalar('select count(*)::int from coaching_notes_base where user_id=$1 and deleted_at is not null', [DEST]), 1);
      assert.equal(await scalar(`select count(*)::int from business_review_system_priorities p
        join business_reviews r on r.id=p.business_review_id where r.user_id=$1 and p.action_step_id=$2`, [DEST, copiedAction]), 1);
    });

    await transactionTest('destination coaches can edit copied meetings and start a later scheduled meeting', async () => {
      const sourceBefore = await sourceGraph();
      await transfer();
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [ADMIN]);
      const session = (await rows('select * from implementation_meeting_sessions where user_id=$1 and meeting_id=903', [DEST]))[0];
      const mutate = (meeting, operation, payload, revision) => scalar('select mutate_implementation_workspace($1,$2,$3,$4::jsonb,$5)',
        [session.note_id, meeting, operation, JSON.stringify(payload), revision]);
      const updated = await mutate(903, 'save_notes', { notes: 'Destination coaching update', commitments: 'Next steps' }, session.revision);
      assert.equal(updated.notes, 'Destination coaching update');
      assert.equal(updated.notes_author_id, SOURCE, 'original author remains attributed');
      assert.equal(updated.notes_updated_by, ADMIN);
      const attended = await mutate(903, 'set_attendance', { attended: true }, updated.revision);
      assert.equal(attended.revision, updated.revision + 1);
      assert.equal(await scalar('select attended from meeting_attendance_base where user_id=$1 and meeting_id=903', [DEST]), true);
      const next = await mutate(904, 'start', {}, 0);
      assert.equal(next.user_id, DEST);
      assert.equal(next.note_id, session.note_id);
      assert.ok(next.progress_snapshot.length > 0);
      assert.deepEqual(await sourceGraph(), sourceBefore);
    });

    await transactionTest('retry returns the original result without duplicating data and request IDs cannot be repurposed', async () => {
      const result = await transfer();
      const after = await snapshot();
      assert.deepEqual(await transfer(), result);
      assert.deepEqual(await snapshot(), after);
      assert.deepEqual(await transfer({ destination_ghl_contact_id: 'different-derived-contact' }), result,
        'a completed request uses its saved verified identity');
      await rejectedTransfer({ kpi_merge: 'prefer_source' }, /request|used|match|different/i);
      assert.deepEqual(await snapshot(), after);
    });

    await transactionTest('completed results remain recoverable after Auth email changes without a new GHL lookup', async () => {
      const options = { dry_run: false, request_id: REQUEST, kpi_merge: 'skip' };
      const recover = (extra = {}, source = SOURCE, dest = DEST) => scalar(
        'select get_account_transfer_result_v2($1,$2,$3::jsonb)', [source, dest, JSON.stringify({ ...options, ...extra })]);
      assert.equal(await recover(), null);
      await transfer({ dry_run: true });
      assert.equal(await recover(), null, 'preview audit is not a completed transfer');
      const result = await transfer();
      await db.query('update auth.users set email=$1 where id=$2', ['renamed@example.test', DEST]);
      const beforeReplay = await snapshot();
      assert.deepEqual(await recover(), result);
      assert.deepEqual(await transfer({ destination_email: null, destination_ghl_contact_id: null }), result);
      assert.deepEqual(await snapshot(), beforeReplay);
      assert.equal(await recover({ request_id: '00000000-0000-0000-0000-000000000125' }), null);
      for (const run of [() => recover({}, ADMIN), () => recover({}, SOURCE, ADMIN), () => recover({ reassign_authorship: true })]) {
        await db.exec('savepoint replay_mismatch;');
        await assert.rejects(run, /request|used|match|different/i);
        await db.exec('rollback to savepoint replay_mismatch; release savepoint replay_mismatch;');
      }
      await rejectedTransfer({ request_id: '00000000-0000-0000-0000-000000000125' }, /email|changed/i);
    });

    await transactionTest('completed result recovery uses immutable IDs when a deleted source clears the audit foreign key', async () => {
      const source = '00000000-0000-0000-0000-000000000905';
      const dest = '00000000-0000-0000-0000-000000000906';
      await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [source, 'empty-source@example.test', dest, 'empty-dest@example.test']);
      await db.query('insert into profiles(id) values($1),($2)', [source, dest]);
      const result = await transfer({ destination_email: 'empty-dest@example.test' }, source, dest);
      await db.query('delete from profiles where id=$1', [source]);
      assert.equal(await scalar('select source_user_id from user_merge_log where not dry_run'), null);
      const recovered = await scalar('select get_account_transfer_result_v2($1,$2,$3::jsonb)',
        [source, dest, JSON.stringify({ dry_run: false, request_id: REQUEST, kpi_merge: 'skip' })]);
      assert.deepEqual(recovered, result);
      assert.deepEqual(await transfer({ destination_email: null, destination_ghl_contact_id: null }, source, dest), result);
    });

    await transactionTest('child failures roll back GHL, copied graph, attendance and audit as one transaction', async () => {
      await db.exec(`create function public.reject_transfer_step_event() returns trigger language plpgsql as
        $$ begin raise exception 'Injected transfer child failure'; end $$;
        create trigger reject_transfer_step_event before insert on implementation_step_events
        for each row execute function public.reject_transfer_step_event();`);
      const before = await snapshot();
      await rejectedTransfer({}, /Injected transfer child failure/);
      assert.deepEqual(await snapshot(), before);
    });

    await transactionTest('a rejected final GHL update rolls back every preceding copied row and replacement', async () => {
      await db.exec(`create function public.reject_transfer_ghl_update() returns trigger language plpgsql as
        $$ begin raise exception 'Injected destination GHL failure'; end $$;
        create trigger reject_transfer_ghl_update before update of ghl_contact_id,ghl_user_id on profiles
        for each row execute function public.reject_transfer_ghl_update();`);
      const before = await snapshot();
      await rejectedTransfer({ kpi_merge: 'prefer_source' }, /Injected destination GHL failure/);
      assert.deepEqual(await snapshot(), before);
    });

    await transactionTest('destination email and contact checks fail before any copy or GHL mutation', async () => {
      const before = await snapshot();
      for (const options of [
        { destination_email: 'wrong@example.test' }, { destination_email: '' },
        { destination_ghl_contact_id: '' }, { destination_ghl_contact_id: null }, { request_id: null },
      ]) {
        await rejectedTransfer(options, /email|contact|request/i);
        assert.deepEqual(await snapshot(), before);
      }
    });

    await transactionTest('an existing destination workspace for the same meeting blocks both preview and apply', async () => {
      await db.query(`insert into implementation_meeting_sessions (note_id,meeting_id,user_id)
        values (903,902,$1)`, [DEST]);
      const before = await snapshot();
      for (const dry_run of [true, false]) {
        await rejectedTransfer({ dry_run }, /conflict|already|meeting|session/i);
        assert.deepEqual(await snapshot(), before);
      }
    });

    await transactionTest('invalid historical action references fail preflight instead of silently dropping snapshot content', async () => {
      await db.exec(`update implementation_meeting_sessions set progress_snapshot=
        jsonb_set(progress_snapshot,'{0,actionStepId}','999999'::jsonb) where meeting_id=902;`);
      const before = await snapshot();
      await rejectedTransfer({ dry_run: true }, /snapshot|action|history|reference/i);
      await rejectedTransfer({}, /snapshot|action|history|reference/i);
      assert.deepEqual(await snapshot(), before);
    });

    await transactionTest('training, private notes, coach/assistant history, pauses, enrolments and home preferences retain meaning', async () => {
      const sourceBefore = await sourceGraph();
      await transfer();
      for (const table of ['coaching_private_notes', 'user_coaches', 'user_assistants', 'member_pauses',
        'ninety_day_cycle_users', 'member_home_preferences']) {
        const sourceRows = await rows(`select to_jsonb(t)-'id'-'user_id' as value from ${table} t where user_id=$1 order by 1`, [SOURCE]);
        const destRows = await rows(`select to_jsonb(t)-'id'-'user_id' as value from ${table} t where user_id=$1 order by 1`, [DEST]);
        assert.ok(sourceRows.length, `${table} fixture must be populated`);
        assert.deepEqual(destRows, sourceRows, table);
      }
      const copiedNote = await scalar('select note_id from implementation_meeting_sessions where user_id=$1 limit 1', [DEST]);
      const assignments = await rows('select * from user_training_assignments where user_id=$1 order by assigned_at', [DEST]);
      const sourceAssignments = await rows('select * from user_training_assignments where user_id=$1 order by assigned_at', [SOURCE]);
      assert.equal(assignments.length, 2);
      assignments.forEach((assignment, index) => {
        assert.notEqual(assignment.id, sourceAssignments[index].id);
        assert.equal(assignment.coaching_note_id, copiedNote);
        assert.deepEqual(omit(assignment, ['id', 'user_id', 'coaching_note_id']),
          omit(sourceAssignments[index], ['id', 'user_id', 'coaching_note_id']));
      });
      assert.ok(assignments[0].ended_at, 'ended training remains ended');
      assert.equal(assignments[1].ended_at, null);
      assert.equal(await scalar('select is_active from user_coaches where user_id=$1', [DEST]), false);
      assert.equal(await scalar('select count(*)::int from user_course_visibility where user_id=$1 and course_node_id=901', [DEST]), 1);
      assert.deepEqual(await sourceGraph(), sourceBefore);
    });

    await transactionTest('separate ended coach assignments survive alongside deduplicated history and an active merge', async () => {
      await db.query(`insert into user_coaches(user_id,coach_id,is_active,assigned_at,ended_at)
        values($1,$2,false,'1999-01-01','1999-01-31'),
          ($1,$2,true,'1999-02-01','1999-02-28'),
          ($1,$2,false,'1999-03-01',null),
          ($1,$2,true,'2000-01-01',null),
          ($3,$2,false,'1998-01-01','1998-01-31'),
          ($3,$2,true,'2001-01-01',null)`, [SOURCE, ADMIN, DEST]);
      await db.query(`insert into user_coaches(user_id,coach_id,is_active,assigned_at,ended_at,course_id,relationship_type)
        select $2,coach_id,is_active,assigned_at,ended_at,course_id,relationship_type
        from user_coaches where user_id=$1 and assigned_at='2026-08-01'`, [SOURCE, DEST]);
      const sourceBefore = await sourceGraph();
      const existingDestination = await rows('select * from user_coaches where user_id=$1 order by assigned_at', [DEST]);
      const sourceActiveStart = await scalar('select assigned_at from user_coaches where user_id=$1 and is_active and ended_at is null', [SOURCE]);
      const before = await snapshot(false);
      const dry = await transfer({ dry_run: true });
      assert.deepEqual(await snapshot(false), before);
      const live = await transfer();
      assert.deepEqual(live.counts, dry.counts);
      assert.equal(live.counts.user_coaches.moved, 3);
      assert.equal(live.counts.user_coaches.merged, 1);
      assert.equal(live.counts.user_coaches.skipped_dupe, 1);
      const destRows = await rows('select * from user_coaches where user_id=$1 order by assigned_at', [DEST]);
      assert.equal(destRows.length, 6, 'three distinct historical rows are appended without collapsing existing history');
      for (const row of existingDestination.filter((r) => !r.is_active)) {
        assert.deepEqual(await rows('select * from user_coaches where id=$1', [row.id]), [row]);
      }
      const sourceHistory = await rows(`select to_jsonb(c)-'id'-'user_id' as value from user_coaches c
        where user_id=$1 and not (is_active and (ended_at is null or ended_at>now())) order by assigned_at`, [SOURCE]);
      for (const row of sourceHistory) {
        assert.equal(await scalar(`select count(*)::int from user_coaches c
          where user_id=$1 and to_jsonb(c)-'id'-'user_id'=$2::jsonb`,
        [DEST, JSON.stringify(row.value)]), 1, 'every historical source interval survives exactly');
      }
      const originalActive = existingDestination.find((r) => r.is_active);
      const mergedActive = (await rows('select * from user_coaches where id=$1', [originalActive.id]))[0];
      assert.equal(mergedActive.is_active, true);
      assert.equal(mergedActive.ended_at, null);
      assert.deepEqual(mergedActive.assigned_at, sourceActiveStart, 'only the active pair merges assignment starts');
      assert.deepEqual(await sourceGraph(), sourceBefore);
    });

    for (const expiredAccount of [SOURCE, DEST]) {
      await transactionTest(`expired assistant flag on ${expiredAccount === SOURCE ? 'source' : 'destination'} cannot merge historical and current assignments`, async () => {
        const currentAccount = expiredAccount === SOURCE ? DEST : SOURCE;
        const assistant = '00000000-0000-0000-0000-000000000904';
        await db.exec("insert into roles(code) values('assistant') on conflict do nothing;");
        await db.query("insert into user_roles(user_id,role_id) select $1,id from roles where code='assistant'", [assistant]);
        await db.query(`insert into user_assistants(user_id,assistant_id,is_active,assigned_at,ended_at,assigned_by,notes)
          select user_id,assistant_id,is_active,assigned_at,ended_at,assigned_by,notes
          from user_assistants where user_id=$1`, [SOURCE]);
        await db.query(`insert into user_assistants(user_id,assistant_id,is_active,assigned_at,ended_at,assigned_by,notes)
          values($1,$3,true,'1999-01-01','1999-02-01',$4,'Expired assistant interval'),
            ($2,$3,true,'2000-01-01',null,$4,'Current assistant interval')`, [expiredAccount, currentAccount, assistant, ADMIN]);
        const sourceBefore = await sourceGraph();
        const sourceAssignments = await rows('select * from user_assistants where user_id=$1 order by assigned_at', [SOURCE]);
        const existingDest = await rows('select * from user_assistants where user_id=$1 order by assigned_at', [DEST]);
        const before = await snapshot(false);
        const dry = await transfer({ dry_run: true });
        assert.deepEqual(await snapshot(false), before);
        const live = await transfer();
        assert.deepEqual(live.counts, dry.counts);
        assert.equal(live.counts.user_assistants.copied, 2);
        assert.equal(live.counts.user_assistants.merged, 0);
        assert.equal(live.counts.user_assistants.skipped_dupe, 1);
        const destRows = await rows('select * from user_assistants where user_id=$1 order by assigned_at', [DEST]);
        assert.equal(destRows.length, 3);
        for (const original of sourceAssignments) {
          const expected = { ...omit(original, ['id', 'user_id']), is_active: original.is_active && original.ended_at === null };
          const copied = destRows.find((row) => row.notes === original.notes);
          assert.deepEqual(omit(copied, ['id', 'user_id']), expected);
        }
        const retained = destRows.find((row) => row.id === existingDest[0].id);
        assert.deepEqual(retained, { ...existingDest[0], is_active: expiredAccount !== DEST });
        assert.equal(destRows.filter((row) => row.is_active).length, 1);
        assert.deepEqual(await sourceGraph(), sourceBefore);
      });
    }

    for (const strategy of ['keep_latest_submitted', 'keep_source', 'keep_dest']) {
      await transactionTest(`Smart Docs ${strategy} resolves uniqueness conflicts with whole response/value pairs`, async () => {
        const response = (user, block) => rows('select * from smart_doc_responses where user_id=$1 and content_block_id=$2', [user, block]).then((r) => r[0]);
        const values = (id) => rows('select to_jsonb(v)-\'response_id\' as value from smart_doc_response_values v where response_id=$1 order by prompt_id', [id]);
        const sourceResponses = await rows('select * from smart_doc_responses where user_id=$1 order by content_block_id', [SOURCE]);
        assert.equal(sourceResponses[0].updated_by, SOURCE, 'fixture must exercise non-null original attribution');
        const sourceValues = await values(901);
        const destinationResponses = await rows('select * from smart_doc_responses where user_id=$1 order by content_block_id', [DEST]);
        const existingValues = await Promise.all(destinationResponses.map((r) => values(r.id)));
        const dry = await transfer({ dry_run: true, smart_doc_conflict: strategy });
        const result = await transfer({ smart_doc_conflict: strategy });
        assert.deepEqual(result.counts, dry.counts);
        const sourceWins = strategy === 'keep_source' ? [true, true] : strategy === 'keep_dest' ? [false, false] : [true, false];
        for (let index = 0; index < 2; index++) {
          const actual = await response(DEST, 901 + index);
          assert.equal(actual.id, destinationResponses[index].id, 'destination response identity is retained');
          const winner = sourceWins[index] ? sourceResponses[index] : destinationResponses[index];
          assert.deepEqual(omit(actual, ['id', 'user_id']), omit(winner, ['id', 'user_id']));
          assert.deepEqual(await values(actual.id), sourceWins[index] ? await values(winner.id) : existingValues[index]);
        }
        const newResponse = await response(DEST, 903);
        assert.notEqual(newResponse.id, 905);
        assert.deepEqual(omit(newResponse, ['id', 'user_id']), omit(sourceResponses[2], ['id', 'user_id']));
        assert.deepEqual(await values(newResponse.id), await values(905));
        assert.deepEqual(await rows('select * from smart_doc_responses where user_id=$1 order by content_block_id', [SOURCE]), sourceResponses);
        assert.deepEqual(await values(901), sourceValues);
      });
    }

    await transactionTest('ordinary Smart Doc edits after transfer retain their own actor and timestamp', async () => {
      await transfer();
      assert.equal(await scalar("select nullif(current_setting('reboot.account_transfer_smart_docs',true),'')"), null);
      const sourceMetadata = (await rows('select updated_by,updated_at from smart_doc_responses where id=901'))[0];
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [DEST]);
      await db.query("update smart_doc_response_values set value_json=$1::jsonb where response_id=902 and prompt_id=901", ['{"text":"A normal new answer"}']);
      await db.exec('update smart_doc_responses set status=status where id=902;');
      const edited = (await rows('select updated_by,updated_at from smart_doc_responses where id=902'))[0];
      assert.equal(edited.updated_by, DEST);
      assert.ok(edited.updated_at > sourceMetadata.updated_at, 'a later ordinary edit must advance the timestamp');
      assert.equal(await scalar('select updated_by from smart_doc_response_values where response_id=902 and prompt_id=901'), DEST);
      assert.deepEqual((await rows('select updated_by,updated_at from smart_doc_responses where id=901'))[0], sourceMetadata);
    });

    await transactionTest('authenticated callers cannot forge Smart Doc transfer context to keep another author', async () => {
      await transfer();
      await db.exec("set session authorization authenticated; set request.jwt.claim.role='authenticated';");
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [DEST]);
      await db.query("select set_config('reboot.account_transfer_smart_docs',$1,true)", [JSON.stringify({ source: SOURCE, dest: DEST })]);
      await db.query("update smart_doc_response_values set value_json=$1::jsonb where response_id=902 and prompt_id=901", ['{"text":"User-authored update"}']);
      await db.exec('update smart_doc_responses set status=status where id=902;');
      assert.equal(await scalar('select updated_by from smart_doc_response_values where response_id=902 and prompt_id=901'), DEST);
      assert.equal(await scalar('select updated_by from smart_doc_responses where id=902'), DEST);
    });

    for (const strategy of ['skip', 'prefer_source']) {
      await transactionTest(`KPI ${strategy} has exact preview counts with existing destination history`, async () => {
        const kpis = (user) => rows(`select r.period_start_date,r.last_updated_by,v.metric_type_id,v.value
          from monthly_kpi_records_base r join monthly_kpi_values v on v.monthly_kpi_record_id=r.id
          where r.user_id=$1 order by r.period_start_date,v.metric_type_id`, [user]);
        const sourceBefore = await kpis(SOURCE);
        const destBefore = await kpis(DEST);
        const dry = await transfer({ dry_run: true, kpi_merge: strategy });
        assert.deepEqual(await kpis(DEST), destBefore);
        const live = await transfer({ kpi_merge: strategy });
        assert.deepEqual(live.counts, dry.counts);
        assert.equal(live.counts.kpi_records.moved, strategy === 'skip' ? 0 : 1);
        assert.equal(live.counts.kpi_values.upserted, strategy === 'skip' ? 0 : 1);
        assert.equal(live.counts.kpi_records.destination_records_replaced, strategy === 'skip' ? 0 : 2);
        assert.equal(live.counts.kpi_values.destination_values_replaced, strategy === 'skip' ? 0 : 2);
        assert.deepEqual(await kpis(DEST), strategy === 'skip' ? destBefore : sourceBefore);
        assert.deepEqual(await kpis(SOURCE), sourceBefore);
      });
    }

    await transactionTest('authorship is preserved by default and reassigned only with the explicit flag', async () => {
      const before = await rows('select owner_id,created_by,updated_by from content_nodes where id=901');
      await transfer();
      assert.deepEqual(await rows('select owner_id,created_by,updated_by from content_nodes where id=901'), before);
    });
    await transactionTest('explicit authorship flag changes content ownership but preserves historical coaching authors', async () => {
      const dry = await transfer({ dry_run: true, reassign_authorship: true });
      assert.equal(await scalar('select owner_id from content_nodes where id=901'), SOURCE);
      const live = await transfer({ reassign_authorship: true });
      assert.deepEqual(live.counts, dry.counts);
      assert.deepEqual(await rows('select owner_id,created_by,updated_by from content_nodes where id=901'),
        [{ owner_id: DEST, created_by: DEST, updated_by: DEST }]);
      assert.equal(await scalar('select created_by from smart_docs where id=901'), DEST);
      assert.equal(await scalar("select author_id from general_coaching_notes where user_id=$1 and body='Standalone source-authored note'", [DEST]), SOURCE);
      assert.equal(await scalar('select notes_author_id from implementation_meeting_sessions where user_id=$1 and meeting_id=903', [DEST]), SOURCE);
    });

    for (const shape of ['destination-owned-by-partner', 'source-owned-by-partner', 'joining-source-lower', 'joining-source-higher']) {
      await transactionTest(`shared partnership ${shape} fails before any transfer or identity change`, async () => {
        const lower = '00000000-0000-0000-0000-000000000900';
        const higher = '00000000-0000-0000-0000-000000000904';
        await db.query('insert into auth.users(id,email) values($1,$2)', [lower, 'lower@example.test']);
        await db.query('insert into profiles(id) values($1)', [lower]);
        const partnerId = await scalar("insert into partnerships(name,shared_kpis,shared_notes,shared_attendance) values('Transfer shared partnership',true,true,true) returning id");
        const members = shape === 'destination-owned-by-partner' ? [lower, DEST]
          : shape === 'source-owned-by-partner' ? [lower, SOURCE] : [SOURCE, higher];
        for (const user of members) await db.query('insert into partnership_users(partnership_id,user_id) values($1,$2)', [partnerId, user]);
        const destination = shape === 'joining-source-lower' ? lower : DEST;
        const options = { destination_email: destination === lower ? 'lower@example.test' : 'new@example.test' };
        const before = await snapshot();
        for (const dry_run of [true, false]) {
          await rejectedTransfer({ ...options, dry_run }, /partner|shared|owner/i, SOURCE, destination);
          assert.deepEqual(await snapshot(), before);
        }
      });
    }

    await transactionTest('partnerships without shared data copy membership without dropping the source', async () => {
      const partnerId = await scalar("insert into partnerships(name,shared_kpis,shared_notes,shared_attendance) values('Independent partnership',false,false,false) returning id");
      await db.query('insert into partnership_users(partnership_id,user_id) values($1,$2)', [partnerId, SOURCE]);
      const before = await sourceGraph();
      await transfer();
      assert.deepEqual(await rows('select user_id from partnership_users where partnership_id=$1 order by user_id', [partnerId]),
        [{ user_id: SOURCE }, { user_id: DEST }]);
      assert.deepEqual(await sourceGraph(), before);
    });

    for (const staff of [SOURCE, DEST]) {
      await transactionTest(`staff account ${staff === SOURCE ? 'source' : 'destination'} is blocked before overwriting calendar identity`, async () => {
        await db.exec("insert into roles(code) values('coach') on conflict do nothing;");
        await db.query("insert into user_roles(user_id,role_id) select $1,id from roles where code='coach'", [staff]);
        const before = await snapshot();
        await rejectedTransfer({ dry_run: true }, /staff|coach|calendar/i);
        await rejectedTransfer({}, /staff|coach|calendar/i);
        assert.deepEqual(await snapshot(), before);
      });
    }

    for (const past of [SOURCE, DEST]) {
      await transactionTest(`past/current membership disagreement on ${past === SOURCE ? 'source' : 'destination'} fails before changing access`, async () => {
        await db.exec("insert into roles(code) values('past_member') on conflict do nothing;");
        await db.query("insert into user_roles(user_id,role_id) select $1,id from roles where code='past_member'", [past]);
        await db.query("insert into user_roles(user_id,role_id) select $1,id from roles where code='user' on conflict do nothing", [past === SOURCE ? DEST : SOURCE]);
        const before = await snapshot();
        await rejectedTransfer({ dry_run: true }, /member|membership/i);
        await rejectedTransfer({}, /member|membership/i);
        assert.deepEqual(await snapshot(), before);
      });
    }

    await transactionTest('conflicting active programme enrolments and pause intervals reject without partial copies', async () => {
      await db.query(`insert into ninety_day_cycle_users(cycle_id,user_id,enrolled_at)
        values(901,$1,'2026-01-02')`, [DEST]);
      const before = await snapshot();
      await rejectedTransfer({}, /enrol/i);
      assert.deepEqual(await snapshot(), before);
      await db.query('delete from ninety_day_cycle_users where user_id=$1', [DEST]);
      await db.query(`insert into member_pauses(user_id,started_at,reason) values($1,'2026-10-01','Source pause'),($2,'2026-10-02','Destination pause')`, [SOURCE, DEST]);
      const paused = await snapshot();
      await rejectedTransfer({}, /pause/i);
      assert.deepEqual(await snapshot(), paused);
    });

    await transactionTest('member and authenticated admin callers cannot bypass destination GHL verification through either RPC', async () => {
      for (const privilege of ['INSERT', 'UPDATE', 'DELETE']) {
        assert.equal(await scalar("select has_table_privilege('authenticated','public.user_merge_log',$1)", [privilege]), false,
          `authenticated callers must not forge replay results with ${privilege}`);
      }
      for (const actor of [SOURCE, ADMIN]) {
        await db.exec(`set session authorization authenticated; set request.jwt.claim.role='authenticated';`);
        await db.query("select set_config('request.jwt.claim.sub', $1, true)", [actor]);
        for (const fn of ['transfer_user_data', 'transfer_user_data_admin', 'transfer_user_data_admin_v2', 'get_account_transfer_result_v2']) {
          await db.exec('savepoint unauthorized_transfer;');
          await assert.rejects(() => scalar(`select public.${fn}($1,$2,$3::jsonb)`, [SOURCE, DEST,
            JSON.stringify({ dry_run: false, skip_admin_check: true, request_id: REQUEST,
              destination_email: 'new@example.test', destination_ghl_contact_id: 'unverified-contact' })]),
          /permission|denied|service|admin/i);
          await db.exec('rollback to savepoint unauthorized_transfer; release savepoint unauthorized_transfer;');
        }
        await db.exec('reset session authorization;');
      }
      await db.exec("set session authorization service_role; set request.jwt.claim.role='service_role';");
      assert.equal((await transfer({ dry_run: true })).counts.implementation_meeting_sessions.copied, 2);
      assert.equal((await transfer()).counts.implementation_meeting_sessions.copied, 2);
    });
  } finally {
    await db.close();
  }
});
