import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('support SQL protects private SMTP requests and retries only definitive non-delivery', { skip: !process.env.PGLITE_PACKAGE_DIR, timeout: 180000 }, async (t) => {
  const { PGlite } = await import(pathToFileURL(path.resolve(process.env.PGLITE_PACKAGE_DIR, 'dist/index.js')).href);
  const db = new PGlite();
  const query = async (sql, values = []) => (await db.query(sql, values)).rows;
  const scalar = async (sql, values = []) => Object.values((await query(sql, values))[0])[0];
  const payload = { from: 'sender@example.test', to: ['support@example.test'], text: 'Help', attachments: [{ filename: 'screenshot.png', content: 'mock' }] };
  const input = (overrides = {}) => ({ id: randomUUID(), user: null, email: 'member@example.test', message: 'Help', page: '/library', fingerprint: 'a'.repeat(64), actor: 'b'.repeat(64), network: 'c'.repeat(64), payload, lease: randomUUID(), ...overrides });
  const prepare = async (data) => (await query('select * from public.prepare_support_request($1,$2,$3,$4,$5,$6,$7,$8,$9)', [data.id, data.user, data.email, data.message, data.page, data.fingerprint, data.actor, data.network, data.lease]))[0];
  const attach = (data) => scalar('select public.reserve_support_request($1,$2,$3::jsonb)', [data.id, data.lease, JSON.stringify(data.payload)]);
  const reserve = async (data) => {
    const result = await prepare(data);
    if (result.outcome !== 'prepare') return result;
    assert.equal(await attach(data), true);
    return { outcome: 'ready', delivery_payload: data.payload };
  };
  const finish = (data, outcome = 'retryable_failure', provider = null) => scalar('select public.finish_support_request($1,$2,$3,$4)', [data.id, data.lease, outcome, provider]);
  const check = (name, run) => t.test(name, async () => {
    await db.exec('begin; reset role; truncate public.support_requests, public.support_rate_limits; set role service_role;');
    try { await run(); } finally { await db.exec('rollback; reset role'); }
  });
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public,auth to service_role,anon,authenticated;');
    await db.exec(await readFile(new URL('../supabase/migrations/20261016095111_support_requests.sql', import.meta.url), 'utf8'));
    await check('anonymous/authenticated callers cannot read requests or invoke delivery functions', async () => {
      for (const role of ['anon', 'authenticated']) {
        assert.equal(await scalar("select has_table_privilege($1,'public.support_requests','select')", [role]), false);
        assert.equal(await scalar("select has_table_privilege($1,'public.support_rate_limits','insert')", [role]), false);
        assert.equal(await scalar("select has_function_privilege($1,'public.prepare_support_request(uuid,uuid,text,text,text,text,text,text,uuid)','execute')", [role]), false);
        assert.equal(await scalar("select has_function_privilege($1,'public.reserve_support_request(uuid,uuid,jsonb)','execute')", [role]), false);
        assert.equal(await scalar("select has_function_privilege($1,'public.finish_support_request(uuid,uuid,text,text)','execute')", [role]), false);
      }
      assert.equal(await scalar("select bool_and(relrowsecurity) from pg_class where oid in ('public.support_requests'::regclass,'public.support_rate_limits'::regclass)"), true);
      assert.equal(await scalar("select bool_and(not prosecdef) from pg_proc where proname in ('prepare_support_request','reserve_support_request','finish_support_request')"), true);
    });
    await check('admission charges quota once before preparation; busy/sent retries and payload reservation do not charge again', async () => {
      const data = input();
      assert.equal((await prepare(data)).outcome, 'prepare');
      assert.equal(await scalar('select status from public.support_requests where id=$1', [data.id]), 'preparing');
      assert.equal(await scalar('select delivery_payload from public.support_requests where id=$1', [data.id]), null);
      assert.equal((await prepare(data)).outcome, 'busy');
      assert.equal(await scalar('select attempts from public.support_rate_limits where key=$1', [data.actor]), 1);
      assert.equal(await finish(data, 'sent', 'cannot-confirm-before-reserving'), false);
      assert.equal(await attach(data), true);
      assert.equal(await attach(data), false);
      assert.equal((await prepare(data)).outcome, 'busy');
      assert.equal(await finish(data, 'sent', 'accepted'), true);
      assert.equal((await prepare(data)).outcome, 'sent');
      assert.equal(await scalar('select attempts from public.support_rate_limits where key=$1', [data.actor]), 1);
    });
    await check('failed image preparation remains quota limited and expired workers cannot attach a payload', async () => {
      const data = input();
      assert.equal((await prepare(data)).outcome, 'prepare');
      await db.query("update public.support_requests set locked_until=now()-interval '1 second' where id=$1", [data.id]);
      assert.equal(await attach(data), false);
      for (let i = 0; i < 4; i++) {
        data.lease = randomUUID();
        assert.equal((await prepare(data)).outcome, 'prepare');
        assert.equal(await finish(data), true);
      }
      assert.equal((await prepare({ ...data, lease: randomUUID() })).outcome, 'rate_limited');
      assert.equal(await scalar('select delivery_payload from public.support_requests where id=$1', [data.id]), null);
    });
    await check('lease prevents concurrent sends; successful retry is deduplicated and attachment is removed', async () => {
      const data = input();
      assert.equal((await reserve(data)).outcome, 'ready');
      assert.equal((await reserve(data)).outcome, 'busy');
      assert.equal(await finish({ ...data, lease: randomUUID() }, 'sent', 'wrong-worker'), false);
      assert.equal(await finish(data, 'sent', 'smtp-accepted'), true);
      assert.equal((await reserve(data)).outcome, 'sent');
      assert.equal(await scalar('select delivery_payload from public.support_requests where id=$1', [data.id]), null);
    });
    await check('definitive pre-acceptance failures retry their stored payload; altered messages and actors conflict', async () => {
      const data = input();
      await reserve(data); await finish(data);
      const next = { ...data, lease: randomUUID(), payload: { text: 'Changed transport config' } };
      assert.deepEqual((await reserve(next)).delivery_payload, payload);
      assert.equal((await reserve({ ...data, fingerprint: 'd'.repeat(64) })).outcome, 'conflict');
      assert.equal((await reserve({ ...data, actor: 'd'.repeat(64) })).outcome, 'conflict');
      assert.equal(await finish(data, 'sent', 'stale-worker'), false);
      assert.equal(await finish(next, 'sent', 'accepted'), true);
    });
    await check('email quota allows five attempts per hour and rejects the sixth without creating a request', async () => {
      for (let i = 0; i < 5; i++) assert.equal((await reserve(input())).outcome, 'ready');
      assert.equal((await reserve(input())).outcome, 'rate_limited');
      assert.equal(await scalar('select count(*)::integer from public.support_requests'), 5);
      await db.exec("update public.support_rate_limits set window_start = now() - interval '61 minutes'");
      assert.equal((await reserve(input())).outcome, 'ready');
    });
    await check('network quota remains effective when submitted emails change', async () => {
      for (let i = 0; i < 20; i++) assert.equal((await reserve(input({ actor: i.toString(16).padStart(64, '0') }))).outcome, 'ready');
      assert.equal((await reserve(input({ actor: 'e'.repeat(64) }))).outcome, 'rate_limited');
    });
    await check('expired preparing leases may retry, but stale workers cannot reserve or finish', async () => {
      const old = input();
      assert.equal((await prepare(old)).outcome, 'prepare');
      await db.query("update public.support_requests set locked_until=now()-interval '1 second' where id=$1", [old.id]);
      const next = { ...old, lease: randomUUID() };
      assert.equal((await prepare(next)).outcome, 'prepare');
      assert.equal(await attach(old), false, 'worker that lost preparation cannot start SMTP');
      assert.equal(await finish(old), false, 'stale preparation cannot release new worker lease');
      assert.equal(await finish(old, 'sent', 'stale'), false);
      assert.equal(await attach(next), true);
      assert.equal(await finish(next, 'sent', 'accepted'), true);
    });
    await check('sending lease expiry quarantines both pre-send crashes and lost acceptance acknowledgements', async () => {
      for (const scenario of ['crash-before-send', 'SMTP-accepted-but-database-ack-lost']) {
        const data = input({ actor: scenario === 'crash-before-send' ? 'd'.repeat(64) : 'e'.repeat(64) });
        await reserve(data);
        assert.equal((await prepare({ ...data, lease: randomUUID() })).outcome, 'busy');
        await db.query("update public.support_requests set locked_until=now()-interval '1 second' where id=$1", [data.id]);
        const next = { ...data, lease: randomUUID() };
        assert.equal((await prepare(next)).outcome, 'needs_review', scenario);
        assert.equal((await prepare(next)).outcome, 'needs_review', 'quarantine is terminal for automated retries');
        assert.equal(await scalar('select status from public.support_requests where id=$1', [data.id]), 'needs_review');
        assert.equal(await scalar('select delivery_payload from public.support_requests where id=$1', [data.id]), null);
        assert.equal(await scalar('select lease from public.support_requests where id=$1', [data.id]), null);
        assert.equal(await scalar('select attempts from public.support_rate_limits where key=$1', [data.actor]), 1);
        assert.equal(await attach(next), false, 'replacement worker has no send reservation');
        assert.equal(await finish(data, 'sent', 'late-ack'), false, 'quarantined lease rejects stale success');
        assert.equal(await finish(data, 'retryable_failure'), false, 'quarantined lease cannot become retryable');
      }
    });
    await check('an acknowledgement after lease expiry still succeeds if no one quarantined its owned send', async () => {
      const data = input(); await reserve(data);
      await db.query("update public.support_requests set locked_until=now()-interval '1 second' where id=$1", [data.id]);
      assert.equal(await finish(data, 'sent'), true, 'SMTP acceptance does not require a provider-specific message id');
      assert.equal((await prepare({ ...data, lease: randomUUID() })).outcome, 'sent');
      assert.notEqual(await scalar('select sent_at from public.support_requests where id=$1', [data.id]), null);
      assert.equal(await scalar('select delivery_payload from public.support_requests where id=$1', [data.id]), null);
    });
    await check('ambiguous SMTP failures become terminal needs_review immediately', async () => {
      const data = input(); await reserve(data);
      assert.equal(await finish(data, 'uncertain', '<request@example.test>'), true);
      assert.equal(await scalar('select provider_message_id from public.support_requests where id=$1', [data.id]), '<request@example.test>');
      assert.equal(await scalar('select sent_at from public.support_requests where id=$1', [data.id]), null);
      assert.equal(await scalar('select delivery_payload from public.support_requests where id=$1', [data.id]), null);
      await db.query("update public.support_requests set created_at=now()-interval '2 days' where id=$1", [data.id]);
      assert.equal((await prepare({ ...data, lease: randomUUID() })).outcome, 'needs_review');
      assert.equal(await finish(data, 'retryable_failure'), false);
    });
    await check('definitively rejected SMTP attempts may retry after a day because nothing was accepted', async () => {
      const data = input(); await reserve(data); await finish(data, 'retryable_failure');
      await db.query("update public.support_requests set created_at=now()-interval '2 days' where id=$1", [data.id]);
      const next = { ...data, lease: randomUUID() };
      assert.deepEqual(await prepare(next), { outcome: 'ready', delivery_payload: payload });
      assert.equal(await finish(next, 'sent', 'accepted-retry'), true);
      assert.equal((await prepare(next)).outcome, 'sent');
    });
    await check('invalid or legacy acknowledgement arguments never grant a retry or clear a send', async () => {
      const data = input(); await reserve(data);
      for (const outcome of [null, '', 'failed', 'accepted', 'some-provider-id']) {
        await db.exec('savepoint invalid_outcome');
        await assert.rejects(finish(data, outcome), /Invalid delivery outcome/);
        await db.exec('rollback to savepoint invalid_outcome; release savepoint invalid_outcome');
      }
      assert.equal(await scalar('select status from public.support_requests where id=$1', [data.id]), 'sending');
      assert.equal(await scalar('select lease from public.support_requests where id=$1', [data.id]), data.lease);
      assert.equal(await finish(data, 'uncertain'), true);
    });
  } finally { await db.close(); }
});
