#!/usr/bin/env node

// Read-only deployed entitlement inspection. Never signs in or creates sessions.
// Output contains aggregate findings only, never account IDs or content payloads.
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (process.argv.includes('--help')) {
  console.log('Read-only membership/access check using .env.local or existing Supabase environment variables. All requests are GET/HEAD; output is aggregate JSON. No production writes or authentication sessions.');
  process.exit(0);
}

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Supabase URL and service-role environment variables are required.');

let requestCount = 0;
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: {
    fetch: async (input, options) => {
      const method = (options?.method ?? 'GET').toUpperCase();
      if (!['GET', 'HEAD'].includes(method)) throw new Error('Inspection blocked a non-read-only request.');
      requestCount += 1;
      return fetch(input, { ...options, signal: AbortSignal.timeout(20000) });
    },
  },
});

function checked(result, operation) {
  if (result.error) {
    // Do not expose raw error messages, which may contain request parameters.
    throw new Error(`${operation} failed (${result.status ?? 'unknown status'}; ${result.error.code ?? 'no code'}).`);
  }
  return result.data;
}

async function pages(build, operation) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const page = checked(await build().range(offset, offset + 499), operation) ?? [];
    rows.push(...page);
    if (page.length < 500) return rows;
    if (offset >= 49500) throw new Error(`${operation} exceeded its bounded inspection limit.`);
  }
}

async function chunks(ids, build, operation) {
  const rows = [];
  const unique = [...new Set(ids)];
  for (let offset = 0; offset < unique.length; offset += 200) {
    rows.push(...await pages(() => build(unique.slice(offset, offset + 200)), operation));
  }
  return rows;
}

async function main() {
  const roleRows = checked(await client.from('roles').select('id, code')
    .in('code', ['user', 'ninety-day-user', 'past_member', 'legend', 'admin', 'coach', 'assistant']), 'role definitions');
  const roleById = new Map(roleRows.map((row) => [row.id, row.code]));
  const assignments = await pages(() => client.from('user_roles').select('user_id, role_id')
    .in('role_id', [...roleById.keys()]).order('user_id').order('role_id'), 'role assignments');
  const rolesByUser = new Map();
  for (const row of assignments) {
    if (!rolesByUser.has(row.user_id)) rolesByUser.set(row.user_id, new Set());
    rolesByUser.get(row.user_id).add(roleById.get(row.role_id));
  }

  const [roots, activeCycles, openEnrollments, edges] = await Promise.all([
    client.from('content_nodes').select('id, slug, state')
      .in('slug', ['library', 'assistant-library', 'legends-library']).then((result) => checked(result, 'library roots')),
    client.from('ninety_day_cycles').select('id').eq('status', 'active')
      .then((result) => checked(result, 'active cycle metadata')),
    pages(() => client.from('ninety_day_cycle_users').select('user_id, cycle_id')
      .is('ended_at', null).order('user_id').order('cycle_id'), 'open enrollment metadata'),
    pages(() => client.from('node_children').select('parent_id, child_id')
      .order('parent_id').order('child_id'), 'content placement metadata'),
  ]);
  const activeCycleIds = new Set(activeCycles.map((row) => row.id));
  const enrollmentByUser = new Map(openEnrollments.filter((row) => activeCycleIds.has(row.cycle_id))
    .map((row) => [row.user_id, row.cycle_id]));
  const children = new Map();
  for (const edge of edges) {
    if (!children.has(edge.parent_id)) children.set(edge.parent_id, []);
    children.get(edge.parent_id).push(edge.child_id);
  }
  function descendants(ids) {
    const seen = new Set(ids);
    const frontier = [...ids];
    for (let index = 0; index < frontier.length; index += 1) {
      for (const child of children.get(frontier[index]) ?? []) {
        if (!seen.has(child)) { seen.add(child); frontier.push(child); }
      }
    }
    return seen;
  }

  const mainRootIds = new Set(roots.filter((row) => row.slug === 'library').map((row) => row.id));
  const legendRootIds = roots.filter((row) => row.slug === 'legends-library').map((row) => row.id);
  const otherRootDescendants = descendants(roots.filter((row) => row.slug !== 'legends-library').map((row) => row.id));
  const legendOnlyIds = [...descendants(legendRootIds)].filter((id) => !otherRootDescendants.has(id) && !legendRootIds.includes(id));
  const legendCandidates = await chunks(legendOnlyIds, (ids) => client.from('content_nodes')
    .select('id').in('id', ids).eq('state', 'published').is('owner_id', null).not('slug', 'is', null).order('id'), 'published legend placement metadata');

  const candidateResourceBlocks = await chunks(legendCandidates.slice(0, 10).map((row) => row.id), (ids) => client
    .from('content_blocks').select('id, resource_id').in('node_id', ids)
    .eq('block_type', 'asset').not('resource_id', 'is', null).order('id'), 'legend asset placement metadata');
  const legendResources = candidateResourceBlocks.length
    ? checked(await client.from('resources').select('id')
      .in('id', [...new Set(candidateResourceBlocks.map((row) => row.resource_id))].slice(0, 20))
      .eq('state', 'published').order('id').limit(3), 'published legend asset metadata')
    : [];

  const userEntries = [...rolesByUser.entries()];
  const nonStaff = (roles) => !['admin', 'coach', 'assistant'].some((role) => roles.has(role));
  const cohorts = [
    ['past_member', (id, roles) => roles.has('past_member') && nonStaff(roles)],
    ['active_programme_only', (id, roles) => roles.has('ninety-day-user') && !roles.has('user') && !roles.has('past_member') && nonStaff(roles) && enrollmentByUser.has(id)],
    ['inactive_programme_only', (id, roles) => roles.has('ninety-day-user') && !roles.has('user') && !roles.has('past_member') && nonStaff(roles) && !enrollmentByUser.has(id)],
    ['full_member_control', (id, roles) => roles.has('user') && !roles.has('past_member') && !roles.has('ninety-day-user') && !roles.has('legend') && nonStaff(roles)],
    ['legend_full_member', (id, roles) => roles.has('user') && roles.has('legend') && !roles.has('past_member') && nonStaff(roles)],
  ];
  const samples = [];
  for (const [cohort, predicate] of cohorts) {
    const selected = userEntries.filter(([id, roles]) => predicate(id, roles)).slice(0, 2);
    if (selected.length === 0) { samples.push({ cohort, sampled: 0 }); continue; }
    for (const [userId] of selected) {
      const inventory = await pages(() => client.rpc('accessible_discovery_nodes', { _user_id: userId }, { get: true })
        .order('node_id').order('root_id').order('open_path'), 'user-scoped entitlement inventory');
      const inventoryIds = new Set(inventory.map((row) => row.node_id));
      const mainNodes = new Set(inventory.filter((row) => mainRootIds.has(row.root_id) && !mainRootIds.has(row.node_id)).map((row) => row.node_id));
      const result = { cohort, sampled: 1, accessibleMainLibraryNodes: mainNodes.size };
      let testNode = [...mainNodes][0];
      if (cohort.includes('programme_only')) {
        const cycleId = enrollmentByUser.get(userId);
        const systems = cycleId ? checked(await client.from('ninety_day_cycle_systems').select('node_id')
          .eq('cycle_id', cycleId).order('position'), 'assigned programme system metadata') : [];
        const allowed = descendants(systems.map((row) => row.node_id));
        const outside = [...mainNodes].filter((id) => !allowed.has(id));
        result.mainLibraryNodesOutsideAssignedSystems = outside.length;
        testNode = outside[0];
      }
      if (testNode != null) {
        result.accessPredicateAllowsSampleMainNode = checked(await client.rpc('can_access_discovery_node', {
          _user_id: userId, _node_id: testNode,
        }, { get: true }), 'user-scoped node predicate');
      }
      if (cohort === 'legend_full_member') {
        result.accessibleLegendOnlyNodes = legendCandidates.filter((row) => inventoryIds.has(row.id)).length;
        result.sampledLegendOnlyNodeAllowed = legendCandidates.length ? checked(await client.rpc('can_access_discovery_node', {
          _user_id: userId, _node_id: legendCandidates[0].id,
        }, { get: true }), 'legend node entitlement predicate') : null;
        result.sampledPublishedLegendResourcePredicates = [];
        for (const resource of legendResources) {
          result.sampledPublishedLegendResourcePredicates.push(checked(await client.rpc('can_access_discovery_resource', {
            _user_id: userId, _resource_id: resource.id,
          }, { get: true }), 'legend resource entitlement predicate'));
        }
      }
      samples.push(result);
    }
  }
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    method: 'Service-role GET evaluations of existing user-scoped entitlement RPCs; not an authenticated-session RLS test.',
    libraryRootMetadata: roots.map((root) => ({ slug: root.slug, published: root.state === 'published' })),
    publishedLegendOnlyNodeCount: legendCandidates.length,
    samples,
    requestCount,
    writes: 0,
    sessionCreations: 0,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ failed: true, message: error.message?.includes('failed (') || error.message?.includes('bounded inspection') ? error.message : 'Read-only inspection could not complete.', requestCount }));
  process.exitCode = 1;
});
