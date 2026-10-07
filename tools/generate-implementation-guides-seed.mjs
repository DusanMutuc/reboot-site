#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = path.join(repoRoot, 'data', 'implementation-guides.seed.json');
const outputPath = path.join(repoRoot, 'supabase', 'migrations', '20260925030000_seed_system_implementation_guides.sql');

// Frozen metadata from the September 25, 2026 PDF audit. Keep exact titles,
// including the trailing space on resource 185: IDs alone are not portable.
// Only identity and page counts are retained; URLs and credentials are unnecessary.
const sourceCatalog = [
  { id: 181, title: 'How to Hire an Assistant', type: 'pdf', pages: 9 },
  { id: 182, title: 'Sample Job Ads', type: 'pdf', pages: 6 },
  { id: 183, title: 'Extracting Interview Questions and Worksheet', type: 'pdf', pages: 4 },
  { id: 185, title: 'Hiring the Assistant - IMPACT FILTER - Editable ', type: 'pdf', pages: 1 },
  { id: 188, title: 'The Red Carpet System', type: 'pdf', pages: 2 },
  { id: 189, title: 'The Magnet System', type: 'pdf', pages: 2 },
  { id: 192, title: 'The Birthday System', type: 'pdf', pages: 2 },
  { id: 193, title: 'Client Feedback Insulator System', type: 'pdf', pages: 5 },
  { id: 194, title: 'Impact Filter - Client Feedback Insulator', type: 'pdf', pages: 1 },
  { id: 197, title: 'Deal Flow Email System', type: 'pdf', pages: 10 },
  { id: 198, title: 'Deal by Deal Client Experience Survey', type: 'pdf', pages: 8 },
  { id: 199, title: 'IMPACT FILTER - Deal by Deal Client Survey', type: 'pdf', pages: 1 },
  { id: 200, title: 'Lottery Ticket Anniversary System', type: 'pdf', pages: 9 },
  { id: 202, title: 'The Beginners Guide to Newsletter Marketing for Realtors', type: 'pdf', pages: 8 },
  { id: 203, title: 'IMPACT FILTER - Newsletter System', type: 'pdf', pages: 1 },
  { id: 228, title: 'Letter To Fear', type: 'pdf', pages: 1 },
  { id: 230, title: 'Lesson Plan - Relationship With Fear', type: 'pdf', pages: 2 },
  { id: 237, title: 'Energy Audit', type: 'pdf', pages: 8 },
  { id: 240, title: 'Team Offer Builder', type: 'pdf', pages: 8 },
  { id: 277, title: 'Client Feedback Insulator Results Example', type: 'pdf', pages: 16 },
];

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sources = new Map(sourceCatalog.map(source => [source.id, source]));

function uuidV5Url(name) {
  const namespace = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex');
  const bytes = createHash('sha1').update(namespace).update(name, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function assertKeys(value, expected, context) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${context} must be an object.`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${context} has unexpected fields.`);
}

function validText(value, limit, context) {
  assert(typeof value === 'string' && value === value.trim(), `${context} must be trimmed text.`);
  assert(value.length > 0 && [...value].length <= limit && !value.includes('\0'), `${context} has an invalid length or NUL character.`);
}

function validateGuides(guides) {
  assert(Array.isArray(guides) && guides.length > 0, 'Expected a nonempty guide array.');
  const guideKeys = new Set();
  const stepIds = new Set();
  for (const guide of guides) {
    assertKeys(guide, ['audience', 'systemKey', 'steps'], 'Guide');
    assert(['foundation', 'legends'].includes(guide.audience), 'Unsupported audience.');
    assert(typeof guide.systemKey === 'string' && /^[a-z][a-z0-9_]{0,119}$/.test(guide.systemKey), 'Invalid stable system key.');
    const key = `${guide.audience}/${guide.systemKey}`;
    assert(!guideKeys.has(key), `Duplicate guide ${key}.`);
    guideKeys.add(key);
    assert(Array.isArray(guide.steps) && guide.steps.length > 0 && guide.steps.length <= 50, `Invalid step count for ${key}.`);
    for (const step of guide.steps) {
      assertKeys(step, ['id', 'title', 'description', 'resources'], 'Step');
      assert(typeof step.id === 'string' && uuidPattern.test(step.id) && !stepIds.has(step.id.toLowerCase()), 'Invalid or duplicate step UUID.');
      stepIds.add(step.id.toLowerCase());
      validText(step.title, 160, 'Step title');
      validText(step.description, 8000, 'Step description');
      assert(Array.isArray(step.resources) && step.resources.length > 0 && step.resources.length <= 10, 'Curated steps must have 1-10 source references.');
      const referenceKeys = new Set();
      for (const reference of step.resources) {
        assertKeys(reference, ['resourceId', 'pageStart', 'pageEnd'], 'Resource reference');
        assert(Number.isSafeInteger(reference.resourceId) && sources.has(reference.resourceId), 'Unknown source resource.');
        const source = sources.get(reference.resourceId);
        const { pageStart, pageEnd } = reference;
        assert(pageStart === null || (Number.isSafeInteger(pageStart) && pageStart >= 1 && pageStart <= source.pages), 'Invalid source start page.');
        assert(pageEnd === null || (Number.isSafeInteger(pageEnd) && pageStart !== null && pageEnd >= pageStart && pageEnd <= source.pages), 'Invalid source end page.');
        const referenceKey = `${reference.resourceId}/${pageStart}/${pageEnd}`;
        assert(!referenceKeys.has(referenceKey), 'Duplicate resource/page reference.');
        referenceKeys.add(referenceKey);
      }
    }
  }
}

function jsonLiteral(value, tag) {
  const json = JSON.stringify(value, null, 2);
  assert(!json.includes(`$${tag}$`), `Unsafe dollar-quote delimiter ${tag}.`);
  assert(!json.includes('$seed_implementation_guides$'), 'Content contains the outer SQL block delimiter.');
  return `$${tag}$${json}$${tag}$::jsonb`;
}

const guides = JSON.parse(await readFile(inputPath, 'utf8'));
validateGuides(guides);
const migrationGuides = guides.map(guide => ({
  id: uuidV5Url(`https://rebootmembers.com/implementation-guides/v1/${guide.audience}/${guide.systemKey}`),
  ...guide,
}));
const referencedIds = new Set(guides.flatMap(guide => guide.steps.flatMap(step => step.resources.map(reference => reference.resourceId))));
const migrationSources = sourceCatalog.filter(source => referencedIds.has(source.id)).map(({ id, title, type }) => ({ id, title, type }));

const sql = `-- Generated by tools/generate-implementation-guides-seed.mjs.
-- Edit data/implementation-guides.seed.json, then regenerate before this migration is deployed.
-- Existing guide headers and revisions are never overwritten. Missing resources
-- remove only their links, not the independently curated checklist instructions.
begin;

do $seed_implementation_guides$
declare
  _sources constant jsonb := ${jsonLiteral(migrationSources, 'source_identity')};
  _guides constant jsonb := ${jsonLiteral(migrationGuides, 'guide_content')};
  _resource_map jsonb := '{}'::jsonb;
  _source jsonb;
  _original_id bigint;
  _resolved_id bigint;
  _candidate_ids bigint[];
  _guide jsonb;
  _audience public.system_scorecard_audience;
  _system_key text;
  _guide_id uuid;
  _inserted_id uuid;
  _step jsonb;
  _reference jsonb;
  _resources jsonb;
  _steps jsonb;
  _normalized_steps jsonb;
  _inserted_count integer := 0;
begin
  -- Prevent renames/deletes or new duplicate titles during identity resolution.
  -- This lock lasts only for this small, privileged bootstrap transaction.
  lock table public.resources in share mode;

  for _source in select value from jsonb_array_elements(_sources) loop
    _original_id := (_source ->> 'id')::bigint;
    _resolved_id := null;
    select r.id into _resolved_id
    from public.resources r
    where r.id = _original_id
      and r.title = _source ->> 'title'
      and r.type::text = _source ->> 'type';

    if _resolved_id is null then
      -- An ID reused by a different local resource must never win the match.
      select array_agg(r.id order by r.id) into _candidate_ids
      from public.resources r
      where r.title = _source ->> 'title'
        and r.type::text = _source ->> 'type';
      if cardinality(_candidate_ids) = 1 then
        _resolved_id := _candidate_ids[1];
      else
        raise notice 'Implementation guide seed: omitting references to source % (%) because exact title/type matched % local resources.',
          _original_id, _source ->> 'title', coalesce(cardinality(_candidate_ids), 0);
      end if;
    end if;

    if _resolved_id is not null then
      _resource_map := _resource_map || jsonb_build_object(_original_id::text, _resolved_id);
    end if;
  end loop;

  for _guide in select value from jsonb_array_elements(_guides) loop
    _audience := (_guide ->> 'audience')::public.system_scorecard_audience;
    _system_key := _guide ->> 'systemKey';
    _guide_id := (_guide ->> 'id')::uuid;

    perform 1
    from public.system_scorecard_systems s
    join public.system_scorecard_templates t on t.key = s.template_key
    where t.audience = _audience and t.is_active and s.key = _system_key
    for share of t, s;
    if not found then
      raise notice 'Implementation guide seed: skipping %/% because no matching active scorecard system exists.', _audience, _system_key;
      continue;
    end if;

    if exists (
      select 1 from public.system_implementation_guides g
      where g.audience = _audience and g.system_key = _system_key
    ) then
      continue;
    end if;

    _steps := '[]'::jsonb;
    for _step in select value from jsonb_array_elements(_guide -> 'steps') loop
      _resources := '[]'::jsonb;
      for _reference in select value from jsonb_array_elements(_step -> 'resources') loop
        _resolved_id := (_resource_map ->> (_reference ->> 'resourceId'))::bigint;
        if _resolved_id is not null then
          _resources := _resources || jsonb_build_array(
            jsonb_set(_reference, '{resourceId}', to_jsonb(_resolved_id))
          );
        end if;
      end loop;
      _steps := _steps || jsonb_build_array(jsonb_set(_step, '{resources}', _resources));
    end loop;

    -- Use the same internal validator/normalizer as administrator saves, after
    -- remapping resource IDs. Empty reference arrays are intentionally valid.
    _normalized_steps := public.normalize_system_implementation_guide_steps(_steps);

    _inserted_id := null;
    insert into public.system_implementation_guides (id, audience, system_key, current_revision)
    values (_guide_id, _audience, _system_key, 1)
    on conflict (audience, system_key) do nothing
    returning id into _inserted_id;

    if _inserted_id is not null then
      insert into public.system_implementation_guide_versions (guide_id, revision, steps)
      values (_inserted_id, 1, _normalized_steps);
      _inserted_count := _inserted_count + 1;
    end if;
  end loop;

  raise notice 'Implementation guide seed: created % guides; preserved all pre-existing guides.', _inserted_count;
end;
$seed_implementation_guides$;

commit;
`;

const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 1 && args[0] === '--check'), 'Usage: node tools/generate-implementation-guides-seed.mjs [--check]');
if (args.includes('--check')) {
  assert.equal((await readFile(outputPath, 'utf8')).replace(/\r\n/g, '\n'), sql, 'Seed migration is stale; regenerate it.');
  console.log(`Validated ${guides.length} guides / ${guides.reduce((count, guide) => count + guide.steps.length, 0)} steps; migration matches source.`);
} else {
  await writeFile(outputPath, sql, 'utf8');
  console.log(`Generated ${path.relative(repoRoot, outputPath)} with ${guides.length} guides.`);
}
