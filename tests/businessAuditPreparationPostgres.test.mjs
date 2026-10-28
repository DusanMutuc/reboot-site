import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EMPTY_PREPARATION, BUSINESS_AUDIT_TEXT_FIELDS } from '../src/lib/businessAuditPreparationShared.ts';

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
test('PostgreSQL draft/save boundary, revision protection, retries and access grants', {
  skip: !process.env.PGLITE_PACKAGE_DIR, timeout: 120000,
}, async () => {
  const { PGlite } = await import(pathToFileURL(path.resolve(process.env.PGLITE_PACKAGE_DIR, 'dist/index.js')).href);
  const db = new PGlite();
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
  const save = (values, revision, id, submit = false, review = 42, owner = uid(1)) => scalar(
    'select public.save_business_review_preparation($1,$2,$3::jsonb,$4,$5,$6)', [owner, review, JSON.stringify(values), revision, uid(id), submit]);
  const complete = { ...Object.fromEntries(BUSINESS_AUDIT_TEXT_FIELDS.map((key) => [key, 'Answer'])), businessRating: 8, personalRating: 6 };
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.meetings(id bigint primary key,ghl_status text);
      create table public.business_reviews(id bigint primary key,user_id uuid not null,meeting_id bigint references meetings(id));
      insert into meetings values(1,null),(2,'No_Show');
      insert into business_reviews values(42,'${uid(1)}',1),(43,'${uid(2)}',1),(44,'${uid(1)}',2);
      grant all on public.meetings,public.business_reviews to service_role;`);
    await db.exec(await readFile(new URL('../sql/2026-08-02_add_business_audit_preparation_responses.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/20261016094806_business_review_preparation_drafts.sql', import.meta.url), 'utf8'));
    await db.exec('set role service_role');
    const partial = { ...EMPTY_PREPARATION, businessForwardWins: 'First answer' };
    const first = await save(partial, 0, 1);
    assert.equal(first.draft.revision, 1); assert.equal(first.answers, null);
    assert.equal(await scalar('select count(*) from business_review_preparation_responses'), 0);
    const retry = await save(partial, 0, 1);
    assert.deepEqual(retry, first, 'same request is acknowledged without incrementing revision');
    await assert.rejects(save({ ...partial, topicsToDiscuss: 'changed request' }, 0, 1), { code: '22023' });
    await assert.rejects(save({ ...partial, topicsToDiscuss: 'stale tab' }, 0, 2), { code: '40001' });
    await assert.rejects(save(partial, 1, 3, true), { code: '22023' });
    for (const value of [5, 7, '8', 1.5, 0, 11]) {
      await assert.rejects(save({ ...partial, businessRating: value }, 1, 3), { code: '22023' });
    }
    await assert.rejects(save({ ...partial, topicsToDiscuss: 'x'.repeat(10001) }, 1, 3), { code: '22023' });
    await assert.rejects(save(partial, 0, 4, false, 43), { code: '42501' });
    await assert.rejects(save(partial, 0, 4, false, 44), { code: '42501' });
    const submitted = await save(complete, 1, 5, true);
    assert.equal(submitted.draft.revision, 2); assert.equal(submitted.draft.submitted_revision, 2);
    assert.equal(submitted.answers.business_forward_wins, 'Answer');
    assert.deepEqual(await save(complete, 1, 5, true), submitted, 'lost submit acknowledgement is safe to retry');
    const laterDraft = await save({ ...partial, topicsToDiscuss: 'Private later edits' }, 2, 6);
    assert.equal(laterDraft.draft.revision, 3); assert.equal(laterDraft.draft.submitted_revision, 2);
    assert.deepEqual(laterDraft.answers, submitted.answers, 'draft edits preserve the exact prior submission');
    await assert.rejects(save(complete, 1, 5, true), { code: '40001' }, 'old retry cannot replace a later draft');
    const updated = await save({ ...complete, topicsToDiscuss: 'New explicit submission' }, 3, 7, true);
    assert.equal(updated.answers.topics_to_discuss, 'New explicit submission');
    await db.exec('reset role');
    assert.equal(await scalar("select relrowsecurity from pg_class where oid='business_review_preparation_drafts'::regclass"), true);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select * from business_review_preparation_drafts'), { code: '42501' });
      await assert.rejects(save(partial, 4, 8), { code: '42501' });
      await db.exec('reset role');
    }
    await db.exec('delete from business_reviews where id=42');
    assert.equal(await scalar('select count(*) from business_review_preparation_drafts'), 0, 'draft lifecycle follows its review');
  } finally { await db.close(); }
});
