import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tokenHash = () => createHash('sha256').update(randomUUID()).digest('hex');
const NETWORK = 'f'.repeat(64);
const migration = new URL('../supabase/migrations/20261028140114_verified_backup_email.sql', import.meta.url);

// PGlite runs the actual PostgreSQL functions, constraints and role grants.
// It has one connection: these deterministic stale/race-order tests do not
// replace separate concurrent Auth/API sessions on the full local Supabase PC,
// including holding an MFA factor transaction while a second connection starts
// a backup operation: eligibility must be re-read after the account-lock wait.
test('backup email PostgreSQL ownership, lifecycle, one-use grants and quotas', {
  skip: !process.env.PGLITE_PACKAGE_DIR, timeout: 180000,
}, async (t) => {
  const { PGlite } = await import(pathToFileURL(path.resolve(process.env.PGLITE_PACKAGE_DIR, 'dist/index.js')).href);
  const db = new PGlite();
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
  const rpc = (name, args = []) => scalar(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')})`, args);
  const owner = async (sql, args = []) => {
    await db.exec('reset role');
    try { return await scalar(sql, args); } finally { await db.exec('set role service_role'); }
  };
  const mutation = async (sql, args = []) => {
    await db.exec('reset role');
    try { return await db.query(sql, args); } finally { await db.exec('set role service_role'); }
  };
  const rejectedMutation = async (sql, args = [], code = '23505') => {
    await db.exec('savepoint rejected; reset role');
    try { await assert.rejects(db.query(sql, args), { code }); }
    finally { await db.exec('rollback to savepoint rejected; release savepoint rejected; set role service_role'); }
  };
  const begin = async (user = uid(1), email = 'backup@example.test', version = null, hash = tokenHash(), id = randomUUID()) => {
    const expected = version ?? (await rpc('backup_email_state', [user])).version;
    return { ...await rpc('begin_backup_email', [user, email, hash, id, expected, NETWORK]), hash, user, requestId: id };
  };
  const verify = (c, hash = c.hash, user = c.user) => rpc('verify_backup_email', [user, c.challengeId, hash]);
  const verified = async (user = uid(1), email = 'backup@example.test', version = null) => {
    const c = await begin(user, email, version); assert.equal(c.status, 'ok');
    const result = await verify(c); assert.equal(result.status, 'ok');
    return { ...c, version: result.version };
  };
  const recovery = async (email = 'backup@example.test', hash = tokenHash(), requestId = randomUUID(), network = NETWORK) => ({
    ...await rpc('begin_backup_recovery', [email, hash, requestId, network]), hash, requestId,
  });
  const consume = (g, hash = g.hash) => rpc('consume_backup_recovery', [g.grantId, hash]);
  const recheck = (r) => rpc('recheck_backup_recovery', [r.redemptionId, r.userId, r.version, r.credentialEpoch]);
  const check = (name, run) => t.test(name, async () => {
    await db.exec('begin; set role service_role');
    try { await run(); } finally { await db.exec('rollback; reset role'); }
  });
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create role supabase_auth_admin;
      create schema auth;
      create table auth.users (
        id uuid primary key, email text, encrypted_password text default 'password-hash',
        banned_until timestamptz, deleted_at timestamptz, email_confirmed_at timestamptz default now(),
        raw_app_meta_data jsonb default '{}'::jsonb
      );
      create table auth.mfa_factors (id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, status text not null);
      create table public.profiles (id uuid primary key, merged_at timestamptz, merged_into_user_id uuid);
      create table public.member_history (id integer primary key, user_id uuid, note text);
      insert into auth.users(id,email) values ('${uid(1)}','Primary@Example.Test'),('${uid(2)}','other@example.test');
      insert into profiles(id) values('${uid(1)}'),('${uid(2)}');
      insert into member_history values(1,'${uid(1)}','existing coaching history');
      grant usage on schema public,auth to anon,authenticated,service_role,supabase_auth_admin;
      grant select,insert,update,delete on auth.users,auth.mfa_factors to supabase_auth_admin;
    `);
    await db.exec(await readFile(migration, 'utf8'));
    await check('browser and service roles cannot read private tables; only service can invoke entry RPCs', async () => {
      const signatures = [
        'backup_email_state(uuid)', 'backup_email_rate_limit(text,text,text)', 'begin_backup_email(uuid,text,text,uuid,bigint,text)',
        'verify_backup_email(uuid,uuid,text)', 'remove_backup_email(uuid,bigint)', 'resolve_login_email(text,text)',
        'recheck_login_email(uuid,text,bigint)', 'begin_backup_recovery(text,text,uuid,text)',
        'consume_backup_recovery(uuid,text)', 'recheck_backup_recovery(uuid,uuid,bigint,bigint)',
      ];
      for (const role of ['anon', 'authenticated', 'service_role']) {
        for (const table of ['accounts', 'addresses', 'challenges', 'recovery_grants', 'rate_limits']) {
          assert.equal(await owner('select has_table_privilege($1,$2,\'select\')', [role, `reboot_backup_email.${table}`]), false);
          assert.equal(await owner('select has_table_privilege($1,$2,\'insert\')', [role, `reboot_backup_email.${table}`]), false);
        }
        for (const name of signatures) assert.equal(await scalar('select has_function_privilege($1,$2,\'execute\')', [role, `public.${name}`]), role === 'service_role');
      }
      assert.equal(await owner("select bool_and(relrowsecurity) from pg_class where relnamespace='reboot_backup_email'::regnamespace and relkind='r'"), true);
      assert.equal(await owner("select bool_and(not prosecdef) from pg_proc where oid=any($1::regprocedure[])", [signatures.map((s) => `public.${s}`)]), true);
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`savepoint permission_check; set role ${role}`);
        await assert.rejects(rpc('backup_email_state', [uid(1)]), { code: '42501' });
        await db.exec('rollback to savepoint permission_check; release savepoint permission_check; set role service_role');
      }
    });
    await check('backfill preserves UUID, primary email and all member history; pending is not verified', async () => {
      assert.deepEqual(await rpc('backup_email_state', [uid(1)]), {
        status: 'ok', version: 0, email: null, verified: false, verifiedAt: null, pendingEmail: null, pendingExpiresAt: null,
      });
      const c = await begin(uid(1), '  BACKUP@Example.Test  ');
      const state = await rpc('backup_email_state', [uid(1)]);
      assert.equal(state.email, null); assert.equal(state.pendingEmail, 'backup@example.test');
      assert.equal(state.pendingExpiresAt, c.expiresAt); assert.equal(state.version, 1);
      assert.equal((await rpc('resolve_login_email', ['backup@example.test', NETWORK])).status, 'invalid');
      assert.equal((await recovery()).status, 'invalid');
      assert.equal(await owner('select email from auth.users where id=$1', [uid(1)]), 'Primary@Example.Test');
      assert.equal(await owner('select note from public.member_history where user_id=$1', [uid(1)]), 'existing coaching history');
      assert.equal(await owner('select count(*)::integer from auth.users'), 2);
    });
    await check('verification is bound to user and exact hash, single-use, and enables the existing account', async () => {
      const c = await begin();
      assert.equal((await verify(c, c.hash, uid(2))).status, 'invalid');
      assert.equal((await verify(c, tokenHash())).status, 'invalid');
      assert.deepEqual(await verify(c), { status: 'ok', version: 2 });
      assert.equal((await verify(c)).status, 'invalid');
      const state = await rpc('backup_email_state', [uid(1)]);
      assert.equal(state.email, 'backup@example.test'); assert.equal(state.verified, true); assert.ok(state.verifiedAt);
      assert.equal(state.pendingEmail, null);
      assert.deepEqual(await rpc('resolve_login_email', [' BACKUP@EXAMPLE.TEST ', NETWORK]), {
        status: 'ok', userId: uid(1), canonicalEmail: 'Primary@Example.Test', email: 'backup@example.test', kind: 'backup', version: 2,
      });
      assert.equal((await rpc('recheck_login_email', [uid(1), 'backup@example.test', 2])).status, 'ok');
      assert.equal((await rpc('recheck_login_email', [uid(2), 'backup@example.test', 2])).status, 'invalid');
      assert.equal((await rpc('recheck_login_email', [uid(1), 'backup@example.test', 0])).status, 'invalid');
    });
    await check('primary login keeps version zero and primary recovery uses native email delivery', async () => {
      await verified();
      const result = await rpc('resolve_login_email', ['primary@example.test', NETWORK]);
      assert.equal(result.kind, 'primary'); assert.equal(result.version, 0);
      assert.equal((await rpc('recheck_login_email', [uid(1), 'primary@example.test', 0])).status, 'ok');
      assert.equal((await rpc('recheck_login_email', [uid(1), 'primary@example.test', 1])).status, 'invalid');
      assert.deepEqual(await rpc('begin_backup_recovery', ['primary@example.test', tokenHash(), randomUUID(), NETWORK]), { status: 'primary', email: 'Primary@Example.Test' });
      assert.equal(await owner('select count(*)::integer from reboot_backup_email.recovery_grants'), 0);
    });
    await check('resends invalidate old challenges; exact request replay is bound to its input', async () => {
      const old = await begin();
      const replay = await begin(old.user, old.email, 0, old.hash, old.requestId);
      assert.equal(replay.challengeId, old.challengeId);
      assert.equal((await begin(old.user, 'changed@example.test', 0, old.hash, old.requestId)).status, 'conflict');
      const newer = await begin(uid(1), 'newer@example.test');
      assert.equal((await verify(old)).status, 'invalid');
      assert.equal((await verify(newer)).status, 'ok');
      assert.equal((await rpc('backup_email_state', [uid(1)])).email, 'newer@example.test');
    });
    await check('pending changes use compare-and-swap: stale tabs cannot resend or remove a newer challenge', async () => {
      const first = await begin(uid(1), 'first@example.test', 0);
      assert.equal(first.version, 1);
      assert.equal((await begin(uid(1), 'stale@example.test', 0)).status, 'conflict');
      assert.equal((await rpc('remove_backup_email', [uid(1), 0])).status, 'conflict');
      const second = await begin(uid(1), 'second@example.test', first.version);
      assert.equal(second.version, 2);
      assert.equal((await begin(first.user, first.email, 0, first.hash, first.requestId)).status, 'conflict');
      assert.equal((await rpc('remove_backup_email', [uid(1), first.version])).status, 'conflict');
      const state = await rpc('backup_email_state', [uid(1)]);
      assert.equal(state.version, 2); assert.equal(state.pendingEmail, 'second@example.test');
      assert.equal((await verify(first)).status, 'invalid');
      assert.deepEqual(await verify(second), { status: 'ok', version: 3 });
    });
    await check('pending challenges do not reserve another mailbox; the first verified claim wins', async () => {
      const first = await begin(uid(1), 'shared@example.test');
      const second = await begin(uid(2), 'SHARED@example.test');
      assert.equal(first.status, 'ok'); assert.equal(second.status, 'ok');
      assert.equal((await verify(first)).status, 'ok');
      assert.equal((await verify(second)).status, 'conflict');
      assert.equal((await rpc('backup_email_state', [uid(2)])).email, null);
      assert.equal((await begin(uid(2), 'primary@example.test')).status, 'conflict');
    });
    await check('direct Auth signup and admin email update cannot steal a verified alias or normalized primary', async () => {
      await verified();
      await rejectedMutation('insert into auth.users(id,email) values($1,$2)', [uid(3), ' BACKUP@EXAMPLE.TEST ']);
      await rejectedMutation('update auth.users set email=$1 where id=$2', ['BACKUP@example.test', uid(2)]);
      await rejectedMutation('insert into auth.users(id,email) values($1,$2)', [uid(3), ' primary@EXAMPLE.TEST ']);
      await rejectedMutation('update auth.users set email=$1 where id=$2', ['backup@example.test', uid(1)]);
      assert.equal(await owner('select email from auth.users where id=$1', [uid(2)]), 'other@example.test');
      assert.equal(await owner("select count(*)::integer from reboot_backup_email.addresses where user_id=$1 and kind='backup'", [uid(1)]), 1);
    });
    await check('Auth signup can win a pending challenge and a failed replacement preserves the old verified backup', async () => {
      await verified();
      const replacement = await begin(uid(1), 'claimed@example.test', 2);
      await db.exec('set role supabase_auth_admin');
      await db.query('insert into auth.users(id,email) values($1,$2)', [uid(3), 'CLAIMED@example.test']);
      await db.exec('set role service_role');
      assert.equal((await verify(replacement)).status, 'conflict');
      const state = await rpc('backup_email_state', [uid(1)]);
      assert.equal(state.email, 'backup@example.test'); assert.equal(state.version, 3);
      assert.equal(await owner("select user_id from reboot_backup_email.addresses where email='claimed@example.test'"), uid(3));
    });
    await check('replacing and removing a backup invalidate stale edits, login results and grants', async () => {
      await verified();
      const oldGrant = await recovery();
      const second = await verified(uid(1), 'second@example.test', 2);
      assert.equal(second.version, 4);
      assert.equal((await consume(oldGrant)).status, 'invalid');
      assert.equal((await rpc('recheck_login_email', [uid(1), 'backup@example.test', 2])).status, 'invalid');
      assert.equal((await rpc('remove_backup_email', [uid(1), 2])).status, 'conflict');
      assert.equal((await begin(uid(1), 'third@example.test', 2)).status, 'conflict');
      const pending = await begin(uid(1), 'third@example.test', 4);
      const grant = await recovery('second@example.test');
      assert.deepEqual(await rpc('remove_backup_email', [uid(1), 5]), { status: 'ok', version: 6 });
      assert.equal((await verify(pending)).status, 'invalid');
      assert.equal((await consume(grant)).status, 'invalid');
      assert.equal((await rpc('resolve_login_email', ['second@example.test', NETWORK])).status, 'invalid');
      await mutation('insert into auth.users(id,email) values($1,$2)', [uid(3), 'second@example.test']);
      assert.equal(await owner('select email from auth.users where id=$1', [uid(1)]), 'Primary@Example.Test');
    });
    await check('recovery grants consume once, bind exact user/version/epoch, and do not persist Auth credentials', async () => {
      await verified();
      const g = await recovery();
      assert.equal(g.status, 'ok');
      const replay = await recovery(g.email, g.hash, g.requestId);
      assert.equal(replay.grantId, g.grantId);
      assert.equal((await recovery(g.email, tokenHash(), g.requestId)).status, 'invalid');
      assert.equal((await consume(g, tokenHash())).status, 'invalid');
      const redemption = await consume(g);
      assert.equal(redemption.status, 'ok'); assert.equal(redemption.userId, uid(1)); assert.equal(redemption.version, 2);
      assert.equal(redemption.credentialEpoch, 0); assert.equal(redemption.canonicalEmail, 'Primary@Example.Test');
      assert.equal((await consume(g)).status, 'invalid');
      assert.equal((await recheck(redemption)).status, 'ok');
      assert.equal((await recheck({ ...redemption, userId: uid(2) })).status, 'invalid');
      assert.equal((await recheck({ ...redemption, version: 0 })).status, 'invalid');
      assert.equal((await recheck({ ...redemption, credentialEpoch: 100 })).status, 'invalid');
      const columns = await owner("select array_agg(column_name) from information_schema.columns where table_schema='reboot_backup_email'");
      assert.ok(!columns.some((c) => ['password', 'access_token', 'refresh_token', 'recovery_token'].includes(c)));
    });
    await check('successful recovery consumption revokes sibling links and earlier redemptions; rejected guesses do not', async () => {
      await verified();
      const first = await recovery(); const sibling = await recovery();
      assert.equal((await consume(first, tokenHash())).status, 'invalid');
      const siblingRedemption = await consume(sibling);
      assert.equal(siblingRedemption.status, 'ok');
      assert.equal((await consume(first)).status, 'invalid');
      assert.equal((await recheck(siblingRedemption)).status, 'ok');
      const newest = await recovery();
      const newestRedemption = await consume(newest);
      assert.equal(newestRedemption.status, 'ok');
      assert.equal((await recheck(siblingRedemption)).status, 'invalid');
      assert.equal((await recheck(newestRedemption)).status, 'ok');
    });
    await check('credential password rotation invalidates both unconsumed and in-flight recovery authorizations', async () => {
      await verified();
      const pending = await begin(uid(1), 'replacement@example.test', 2);
      const g = await recovery(); const r = await consume(g); const unused = await recovery();
      await mutation('update auth.users set encrypted_password=$1 where id=$2', ['new-password-hash', uid(1)]);
      assert.equal((await recheck(r)).status, 'invalid'); assert.equal((await consume(unused)).status, 'invalid');
      assert.equal((await verify(pending)).status, 'invalid');
      assert.equal(await owner('select credential_epoch from reboot_backup_email.accounts where user_id=$1', [uid(1)]), 1);
      assert.equal((await rpc('backup_email_state', [uid(1)])).email, 'backup@example.test');
    });
    await check('credential reset makes an earlier server management snapshot and backup login result stale', async () => {
      await verified();
      // The backend must take this authoritative snapshot BEFORE its native
      // password check, rejecting a caller-supplied guessed future version.
      const snapshot = await rpc('backup_email_state', [uid(1)]);
      const login = await rpc('resolve_login_email', ['backup@example.test', NETWORK]);
      await mutation('update auth.users set encrypted_password=$1 where id=$2', ['reset-while-password-check-in-flight', uid(1)]);
      assert.equal((await begin(uid(1), 'attacker@example.test', snapshot.version)).status, 'conflict');
      assert.equal((await rpc('remove_backup_email', [uid(1), snapshot.version])).status, 'conflict');
      assert.equal((await rpc('recheck_login_email', [uid(1), login.email, login.version])).status, 'invalid');
      const current = await rpc('backup_email_state', [uid(1)]);
      assert.equal(current.version, snapshot.version + 1);
      assert.equal(current.email, 'backup@example.test'); assert.equal(current.pendingEmail, null);
      assert.equal((await rpc('resolve_login_email', ['primary@example.test', NETWORK])).version, 0);
      assert.equal((await begin(uid(1), 'legitimate@example.test', current.version)).status, 'ok');
    });
    await check('primary email changes update the namespace and revoke old credential grants without changing backup', async () => {
      await verified(); const g = await recovery();
      await mutation('update auth.users set email=$1 where id=$2', ['new-primary@example.test', uid(1)]);
      assert.equal((await consume(g)).status, 'invalid');
      assert.equal((await rpc('recheck_login_email', [uid(1), 'primary@example.test', 0])).status, 'invalid');
      const login = await rpc('resolve_login_email', ['backup@example.test', NETWORK]);
      assert.equal(login.canonicalEmail, 'new-primary@example.test'); assert.equal(login.userId, uid(1));
      await mutation('insert into auth.users(id,email) values($1,$2)', [uid(3), 'primary@example.test']);
    });
    await check('expired links and the short redemption window fail closed', async () => {
      const c = await begin();
      await mutation("update reboot_backup_email.challenges set expires_at=clock_timestamp()-interval '1 second' where id=$1", [c.challengeId]);
      assert.equal((await verify(c)).status, 'invalid');
      assert.equal((await rpc('backup_email_state', [uid(1)])).pendingEmail, null);
      await verified(); const g = await recovery();
      await mutation("update reboot_backup_email.recovery_grants set expires_at=clock_timestamp()-interval '1 second' where id=$1", [g.grantId]);
      assert.equal((await consume(g)).status, 'invalid');
      const current = await recovery(); const r = await consume(current);
      await mutation("update reboot_backup_email.recovery_grants set consumed_at=clock_timestamp()-interval '3 minutes' where id=$1", [current.grantId]);
      assert.equal((await recheck(r)).status, 'invalid');
    });
    await check('ten rejected guesses persist and prevent a later valid guess', async () => {
      const c = await begin();
      for (let i = 0; i < 10; i++) assert.equal((await verify(c, tokenHash())).status, 'invalid');
      assert.equal((await verify(c)).status, 'invalid');
      assert.equal(await owner('select attempts from reboot_backup_email.challenges where id=$1', [c.challengeId]), 10);
      await verified(); const g = await recovery();
      for (let i = 0; i < 10; i++) assert.equal((await consume(g, tokenHash())).status, 'invalid');
      assert.equal((await consume(g)).status, 'invalid');
      assert.equal(await owner('select attempts from reboot_backup_email.recovery_grants where id=$1', [g.grantId]), 10);
    });
    await check('management and recovery sends have independent user/email and network quotas, including unknown addresses', async () => {
      for (let i = 0; i < 5; i++) assert.equal((await begin(uid(1), `candidate${i}@example.test`)).status, 'ok');
      assert.equal((await begin()).status, 'rate_limited');
      for (let i = 0; i < 5; i++) assert.equal((await recovery('unknown@example.test')).status, 'invalid');
      assert.equal((await recovery('unknown@example.test')).status, 'rate_limited');
      const otherNetwork = 'e'.repeat(64);
      for (let i = 0; i < 20; i++) assert.equal((await recovery(`unknown${i}@example.test`, tokenHash(), randomUUID(), otherNetwork)).status, 'invalid');
      assert.equal((await recovery('last@example.test', tokenHash(), randomUUID(), otherNetwork)).status, 'rate_limited');
      await mutation("update reboot_backup_email.rate_limits set window_start=clock_timestamp()-interval '2 hours'");
      assert.equal((await begin()).status, 'ok');
    });
    await check('pre-password admission throttles failed password attempts without any challenge or Auth user lookup', async () => {
      const actor = tokenHash();
      for (let i = 0; i < 10; i++) assert.equal((await rpc('backup_email_rate_limit', ['manage', actor, NETWORK])).status, 'ok');
      assert.equal((await rpc('backup_email_rate_limit', ['manage', actor, NETWORK])).status, 'rate_limited');
      assert.equal((await rpc('backup_email_rate_limit', ['unlimited', actor, NETWORK])).status, 'invalid');
      assert.equal((await rpc('backup_email_rate_limit', ['manage', 'plaintext-address', NETWORK])).status, 'invalid');
      assert.equal(await owner('select count(*)::integer from reboot_backup_email.challenges'), 0);
    });
    await check('unknown login attempts are quota limited and changed aliases cannot evade the network budget', async () => {
      for (let i = 0; i < 60; i++) assert.equal((await rpc('resolve_login_email', ['unknown@example.test', NETWORK])).status, 'invalid');
      assert.equal((await rpc('resolve_login_email', ['unknown@example.test', NETWORK])).status, 'rate_limited');
      for (let i = 0; i < 119; i++) assert.equal((await rpc('resolve_login_email', [`unknown${i}@example.test`, NETWORK])).status, 'invalid');
      assert.equal((await rpc('resolve_login_email', ['new@example.test', NETWORK])).status, 'rate_limited');
    });
    await check('archive revokes credentials while retaining address ownership and history; no alias transfer', async () => {
      await verified(); const g = await recovery(); const r = await consume(g);
      await mutation('update profiles set merged_at=clock_timestamp(),merged_into_user_id=$1 where id=$2', [uid(2), uid(1)]);
      assert.equal((await recheck(r)).status, 'ineligible');
      assert.equal((await rpc('backup_email_state', [uid(1)])).status, 'ineligible');
      assert.equal((await rpc('resolve_login_email', ['backup@example.test', NETWORK])).status, 'invalid');
      assert.equal((await rpc('resolve_login_email', ['primary@example.test', NETWORK])).status, 'invalid');
      assert.equal((await recovery()).status, 'invalid');
      assert.equal((await rpc('remove_backup_email', [uid(1), 1])).status, 'ineligible');
      assert.equal((await begin(uid(2), 'backup@example.test')).status, 'conflict');
      await rejectedMutation('insert into auth.users(id,email) values($1,$2)', [uid(3), 'backup@example.test']);
      assert.equal(await owner('select user_id from member_history where id=1'), uid(1));
    });
    await check('verified MFA fails closed and enable-then-disable still revokes previously issued recovery links', async () => {
      await verified(); const g = await recovery();
      await mutation('insert into auth.mfa_factors(id,user_id,status) values($1,$2,$3)', [uid(9), uid(1), 'verified']);
      assert.equal((await rpc('backup_email_state', [uid(1)])).status, 'ineligible');
      assert.equal((await consume(g)).status, 'ineligible');
      assert.equal((await recovery()).status, 'invalid');
      assert.equal((await rpc('resolve_login_email', ['backup@example.test', NETWORK])).status, 'invalid');
      assert.equal((await rpc('resolve_login_email', ['primary@example.test', NETWORK])).status, 'ok');
      await mutation('delete from auth.mfa_factors where id=$1', [uid(9)]);
      assert.equal((await consume(g)).status, 'invalid');
    });
    await check('setup-required, ban and soft-delete transitions reject backup access and revoke old grants', async () => {
      await verified();
      for (const [sql, clear] of [
        ["raw_app_meta_data='{" + '"must_reset_password":true' + "}'::jsonb", "raw_app_meta_data='{}'::jsonb"],
        ["banned_until=clock_timestamp()+interval '1 hour'", 'banned_until=null'],
        ['deleted_at=clock_timestamp()', 'deleted_at=null'],
      ]) {
        const g = await recovery(); assert.equal(g.status, 'ok');
        await mutation(`update auth.users set ${sql} where id=$1`, [uid(1)]);
        assert.equal((await consume(g)).status, 'ineligible');
        assert.equal((await rpc('backup_email_state', [uid(1)])).status, 'ineligible');
        await mutation(`update auth.users set ${clear} where id=$1`, [uid(1)]);
        assert.equal((await consume(g)).status, 'invalid');
      }
    });
    await check('actual Auth deletion cleans private data without migrating identity to another member', async () => {
      await verified(); await recovery(); await begin(uid(1), 'next@example.test', 2);
      await mutation('delete from auth.users where id=$1', [uid(1)]);
      for (const table of ['accounts', 'addresses', 'challenges', 'recovery_grants']) {
        assert.equal(await owner(`select count(*)::integer from reboot_backup_email.${table} where user_id=$1`, [uid(1)]), 0);
      }
      assert.equal((await rpc('backup_email_state', [uid(2)])).email, null);
    });
  } finally { await db.close(); }
});

test('migration fails atomically on legacy case-folded primary collisions', {
  skip: !process.env.PGLITE_PACKAGE_DIR, timeout: 60000,
}, async () => {
  const { PGlite } = await import(pathToFileURL(path.resolve(process.env.PGLITE_PACKAGE_DIR, 'dist/index.js')).href);
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key,email text);
      insert into auth.users values('${uid(1)}','Duplicate@example.test'),('${uid(2)}',' duplicate@EXAMPLE.TEST ');`);
    await assert.rejects(db.exec(await readFile(migration, 'utf8')), { code: '23505' });
    await db.exec('rollback');
    assert.equal((await db.query("select to_regnamespace('reboot_backup_email') as ns")).rows[0].ns, null);
    assert.equal((await db.query('select count(*)::integer as n from auth.users')).rows[0].n, 2);
  } finally { await db.close(); }
});
