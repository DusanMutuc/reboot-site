import { NextRequest, NextResponse } from 'next/server';

import { getAdminUserDirectoryPage } from '@/lib/adminUserDirectory';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';
import type {
  SearchDiagnosticResult,
  SearchInvestigationGroup,
  SearchInvestigationJourney,
} from '@/lib/discoveryRemainingTypes';
import type { DiscoveryItemKind } from '@/lib/discoveryJobTypes';

export const dynamic = 'force-dynamic';

const SEARCH_VERSION = 'discovery-context-v3';
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;

async function guardAdmin(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard;
  if (!guard.roleCodes.some((code) => code === 'admin' || code === 'superadmin')) {
    return { ok: false as const, res: NextResponse.json({ error: 'Admin privileges required.' }, { status: 403 }) };
  }
  return guard;
}

function reply(data: unknown) {
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}

function terms(value: string) {
  return value.toLocaleLowerCase().split(/\s+/).map((term) => term.trim()).filter(Boolean);
}

type GeneralCandidate = SearchDiagnosticResult & {
  description: string;
  searchNames: string[];
  topicText: string;
  state: string;
  discoverable: boolean;
  openMode: string;
  embedded: boolean;
};

async function generalCandidates(): Promise<GeneralCandidate[]> {
  const admin = getAdminClient();
  const [resources, nodes, blocks, edges, resourceTags, nodeTags, tags] = await Promise.all([
    admin.from('resources').select('id,title,description,type,state,search_names,is_discoverable,discovery_open_mode,url'),
    admin.from('content_nodes').select('id,title,description,node_type,state,slug,search_names,is_discoverable'),
    admin.from('content_blocks').select('resource_id,node_id').eq('block_type', 'asset').not('resource_id', 'is', null),
    admin.from('node_children').select('parent_id,child_id'),
    admin.from('resource_tags').select('resource_id,tag_id'),
    admin.from('content_node_tags').select('node_id,tag_id'),
    admin.from('tags').select('id,name,tag_kind,is_active'),
  ]);
  const error = resources.error ?? nodes.error ?? blocks.error ?? edges.error ?? resourceTags.error ?? nodeTags.error ?? tags.error;
  if (error) throw error;
  const nodeRows = (nodes.data ?? []) as Array<Record<string, unknown>>;
  const libraryCollections = new Set(nodeRows.filter((node) => node.node_type === 'collection' && node.slug === 'library').map((node) => Number(node.id)));
  const libraryLessons = new Set<number>();
  (edges.data ?? []).forEach((edge) => { if (libraryCollections.has(Number(edge.parent_id))) libraryLessons.add(Number(edge.child_id)); });
  const embeddedIds = new Set((blocks.data ?? []).map((block) => Number(block.resource_id)));
  const activeTopicNames = new Map((tags.data ?? []).filter((tag) => tag.tag_kind === 'topic' && tag.is_active)
    .map((tag) => [Number(tag.id), String(tag.name)]));
  const resourceTopicText = new Map<number, string[]>();
  (resourceTags.data ?? []).forEach((link) => {
    const name = activeTopicNames.get(Number(link.tag_id));
    if (!name) return;
    const values = resourceTopicText.get(Number(link.resource_id)) ?? [];
    values.push(name); resourceTopicText.set(Number(link.resource_id), values);
  });
  const nodeTopicText = new Map<number, string[]>();
  (nodeTags.data ?? []).forEach((link) => {
    const name = activeTopicNames.get(Number(link.tag_id));
    if (!name) return;
    const values = nodeTopicText.get(Number(link.node_id)) ?? [];
    values.push(name); nodeTopicText.set(Number(link.node_id), values);
  });

  const candidates: GeneralCandidate[] = [];
  for (const raw of resources.data ?? []) {
    const id = Number(raw.id);
    const embedded = embeddedIds.has(id);
    // Context-bound resources are represented by their containing Library guide/course, not as a
    // stripped asset. Only explicitly independent resources enter the general result set directly.
    if (raw.state !== 'published' || !raw.is_discoverable || (embedded && raw.discovery_open_mode !== 'direct')) continue;
    candidates.push({
      kind: 'resource', id, title: String(raw.title), description: String(raw.description ?? ''),
      mediaType: String(raw.type), state: String(raw.state), searchNames: (raw.search_names ?? []) as string[],
      topicText: (resourceTopicText.get(id) ?? []).join(' '), discoverable: Boolean(raw.is_discoverable),
      openMode: String(raw.discovery_open_mode), embedded, position: 0, accessVaries: embedded,
      openPath: typeof raw.url === 'string' && raw.url ? raw.url : `/r/${id}`,
    });
  }
  for (const raw of nodeRows) {
    const id = Number(raw.id);
    const inScope = raw.node_type === 'course' || (raw.node_type === 'lesson' && libraryLessons.has(id));
    if (!inScope || raw.state !== 'published' || !raw.is_discoverable) continue;
    candidates.push({
      kind: 'node', id, title: String(raw.title), description: String(raw.description ?? ''),
      mediaType: String(raw.node_type), state: String(raw.state), searchNames: (raw.search_names ?? []) as string[],
      topicText: (nodeTopicText.get(id) ?? []).join(' '), discoverable: Boolean(raw.is_discoverable),
      openMode: 'context', embedded: false, position: 0, accessVaries: raw.node_type === 'course',
      openPath: raw.node_type === 'course' && raw.slug ? `/courses/${raw.slug}` : raw.slug ? `/library/${raw.slug}` : null,
    });
  }
  return candidates;
}

async function runGeneralSearch(query: string): Promise<SearchDiagnosticResult[]> {
  const queryTerms = terms(query);
  if (!queryTerms.length) return [];
  const ranked = (await generalCandidates()).map((candidate) => {
    const title = candidate.title.toLocaleLowerCase();
    const names = candidate.searchNames.join(' ').toLocaleLowerCase();
    const topics = candidate.topicText.toLocaleLowerCase();
    const description = candidate.description.toLocaleLowerCase();
    const text = `${title} ${names} ${topics} ${description}`;
    if (!queryTerms.every((term) => text.includes(term))) return null;
    const exactName = candidate.searchNames.some((name) => name.toLocaleLowerCase() === query.toLocaleLowerCase());
    const score = (title === query.toLocaleLowerCase() ? 1000 : 0)
      + (title.includes(query.toLocaleLowerCase()) ? 400 : 0)
      + (exactName ? 700 : 0)
      + queryTerms.filter((term) => title.includes(term)).length * 80
      + queryTerms.filter((term) => names.includes(term)).length * 60
      + queryTerms.filter((term) => topics.includes(term)).length * 30
      + queryTerms.filter((term) => description.includes(term)).length * 5;
    return { candidate, score };
  }).filter((value): value is { candidate: GeneralCandidate; score: number } => Boolean(value));
  ranked.sort((a, b) => b.score - a.score || a.candidate.title.localeCompare(b.candidate.title));
  return ranked.slice(0, 50).map(({ candidate }, index) => ({
    kind: candidate.kind, id: candidate.id, title: candidate.title, mediaType: candidate.mediaType,
    position: index + 1, accessVaries: candidate.accessVaries, openPath: candidate.openPath,
  }));
}

async function runMemberSearch(query: string, memberId: string): Promise<SearchDiagnosticResult[]> {
  const admin = getAdminClient();
  const result = await admin.rpc('search_discovery_catalogue', {
    _user_id: memberId, _q: query, _browse_category: null, _types: null, _tag_ids: null,
    _duration: null, _date_range: null, _sort: 'relevance', _limit: 50, _offset: 0,
    _include_related: true,
  });
  if (result.error) throw result.error;
  return ((result.data ?? []) as Array<Record<string, unknown>>).map((row, index) => ({
    kind: row.item_type === 'resource' ? 'resource' : 'node',
    id: Number(row.item_type === 'resource' ? row.resource_id : row.content_node_id),
    title: String(row.title), mediaType: String(row.media_type), position: index + 1,
    accessVaries: false, openPath: row.open_path == null ? null : String(row.open_path),
  }));
}

async function loadTarget(kind: DiscoveryItemKind, id: number) {
  const admin = getAdminClient();
  const table = kind === 'resource' ? 'resources' : 'content_nodes';
  const projection = kind === 'resource'
    ? 'id,title,description,type,state,search_names,is_discoverable,discovery_open_mode'
    : 'id,title,description,node_type,state,search_names,is_discoverable';
  const target = await admin.from(table).select(projection).eq('id', id).maybeSingle();
  if (target.error) throw target.error;
  if (!target.data) return null;
  const row = target.data as unknown as Record<string, unknown>;
  const placements = kind === 'resource'
    ? await admin.from('resource_block_locations').select('node_id,node_title,node_type,node_state').eq('resource_id', id)
    : { data: [], error: null };
  if (placements.error) throw placements.error;
  return {
    kind, id, title: String(row.title), description: String(row.description ?? ''),
    mediaType: String(row.type ?? row.node_type), state: String(row.state),
    searchNames: (row.search_names ?? []) as string[], isDiscoverable: Boolean(row.is_discoverable),
    openMode: String(row.discovery_open_mode ?? 'context'), placements: placements.data ?? [],
  };
}

async function diagnose(query: string, kind: DiscoveryItemKind, id: number, memberId: string | null) {
  const results = memberId ? await runMemberSearch(query, memberId) : await runGeneralSearch(query);
  const target = await loadTarget(kind, id);
  if (!target) throw new Error('The item no longer exists.');
  const position = results.find((item) => item.kind === kind && item.id === id)?.position ?? null;
  let finding: string;
  let correction: 'publish' | 'visibility' | 'placement' | 'access' | 'alternate_name' | 'ranking' | 'none';
  if (target.state !== 'published') {
    finding = 'This is a draft. Nothing will find it until it is published.'; correction = 'publish';
  } else if (!target.isDiscoverable) {
    finding = 'Nobody has said yet whether members can find this.'; correction = 'visibility';
  } else if (kind === 'resource' && target.placements.length > 0 && target.openMode !== 'direct') {
    const container = target.placements[0] as Record<string, unknown>;
    const containerFound = results.some((item) => item.kind === 'node' && item.id === Number(container.node_id));
    finding = `This was deliberately kept with ${String(container.node_title)}.${containerFound ? ' That guide is returned for this search.' : ' That guide is not currently returned for this search.'}`;
    correction = 'placement';
  } else if (memberId) {
    const access = kind === 'resource'
      ? await getAdminClient().rpc('can_access_discovery_resource', { _user_id: memberId, _resource_id: id })
      : await getAdminClient().rpc('can_access_discovery_node', { _user_id: memberId, _node_id: id });
    if (access.error) throw access.error;
    if (!access.data) {
      finding = 'This member cannot currently open this item. That is an access issue, not a discovery wording issue.';
      correction = 'access';
    } else if (position) {
      finding = `This is returned at position ${position}.`; correction = position > 8 ? 'ranking' : 'none';
    } else {
      finding = `Nothing in this item's title, alternate names, topics or description matches “${query}”.`;
      correction = 'alternate_name';
    }
  } else if (position) {
    finding = `This is returned at position ${position}.`; correction = position > 8 ? 'ranking' : 'none';
  } else {
    finding = `Nothing in this item's title, alternate names, topics or description matches “${query}”.`;
    correction = 'alternate_name';
  }
  return { results, target, finding, correction, position };
}

async function fetchInvestigationRows(): Promise<SearchInvestigationGroup[]> {
  const admin = getAdminClient();
  const since = new Date(Date.now() - NINETY_DAYS_MS).toISOString();
  const [searches, resultSets, events, executions, profiles] = await Promise.all([
    admin.from('logical_searches').select('id,user_id,journey_id,parent_logical_search_id,query_text,normalized_query,change_reason,created_at,last_interaction_at,journey_ended_at').gte('created_at', since).order('created_at'),
    admin.from('discovery_result_sets').select('id,logical_search_id,status,total_match_count,generated_at').eq('context', 'search').gte('generated_at', since),
    admin.from('discovery_events').select('event_id,event_type,result_set_id,logical_search_id,item_key,server_received_at').in('event_type', ['result_set_shown', 'item_open']).gte('server_received_at', since).order('server_received_at'),
    admin.from('search_executions').select('logical_search_id,search_version,requested_at').gte('requested_at', since).order('requested_at'),
    admin.from('profiles').select('id,first_name,last_name'),
  ]);
  const error = searches.error ?? resultSets.error ?? events.error ?? executions.error ?? profiles.error;
  if (error) throw error;
  const searchRows = (searches.data ?? []) as Array<Record<string, unknown>>;
  const setRows = (resultSets.data ?? []) as Array<Record<string, unknown>>;
  const eventRows = (events.data ?? []) as Array<Record<string, unknown>>;
  const children = new Set(searchRows.map((row) => row.parent_logical_search_id).filter(Boolean).map(String));
  const setsById = new Map(setRows.map((row) => [String(row.id), row]));
  const shownEvents = eventRows.filter((event) => event.event_type === 'result_set_shown' && event.result_set_id);
  const shownLogicalIds = new Set(shownEvents.map((event) => String(setsById.get(String(event.result_set_id))?.logical_search_id ?? '')));
  const profileMap = new Map((profiles.data ?? []).map((profile) => [String(profile.id), `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()]));
  const authEmails = new Map<string, string>();
  for (let page = 1; page <= 20; page += 1) {
    const users = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (users.error) throw users.error;
    users.data.users.forEach((user) => { if (user.email) authEmails.set(user.id, user.email); });
    if (users.data.users.length < 1000) break;
  }
  const latestExecution = new Map<string, Record<string, unknown>>();
  (executions.data ?? []).forEach((row) => latestExecution.set(String(row.logical_search_id), row));
  const journeys = new Map<string, Array<Record<string, unknown>>>();
  searchRows.forEach((row) => {
    const list = journeys.get(String(row.journey_id)) ?? [];
    list.push(row); journeys.set(String(row.journey_id), list);
  });
  const resultSetIds = setRows.map((row) => String(row.id));
  const items = resultSetIds.length
    ? await admin.from('discovery_result_set_items').select('result_set_id,position,item_key').in('result_set_id', resultSetIds.slice(0, 1000)).order('position')
    : { data: [], error: null };
  if (items.error) throw items.error;
  const itemKeys = [...new Set((items.data ?? []).map((row) => String(row.item_key)))];
  const resourceIds = itemKeys.filter((key) => key.startsWith('resource:')).map((key) => Number(key.slice(9)));
  const nodeIds = itemKeys.filter((key) => key.startsWith('guide:')).map((key) => Number(key.slice(6)));
  const [resourceTitles, nodeTitles] = await Promise.all([
    resourceIds.length ? admin.from('resources').select('id,title').in('id', resourceIds) : Promise.resolve({ data: [], error: null }),
    nodeIds.length ? admin.from('content_nodes').select('id,title').in('id', nodeIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (resourceTitles.error ?? nodeTitles.error) throw resourceTitles.error ?? nodeTitles.error;
  const titleByKey = new Map<string, string>();
  (resourceTitles.data ?? []).forEach((row) => titleByKey.set(`resource:${row.id}`, row.title));
  (nodeTitles.data ?? []).forEach((row) => titleByKey.set(`guide:${row.id}`, row.title));

  const rows: SearchInvestigationJourney[] = [];
  for (const [journeyId, chainUnsorted] of journeys) {
    const chain = [...chainUnsorted].sort((a, b) => Date.parse(String(a.created_at)) - Date.parse(String(b.created_at)));
    const terminal = [...chain].reverse().find((row) => !children.has(String(row.id)));
    if (!terminal || !shownLogicalIds.has(String(terminal.id))) continue;
    const lastInteraction = Math.max(...chain.map((row) => Date.parse(String(row.last_interaction_at))));
    const ended = chain.some((row) => row.journey_ended_at) || lastInteraction <= Date.now() - TEN_MINUTES_MS;
    if (!ended) continue;
    const terminalShown = shownEvents.filter((event) => String(setsById.get(String(event.result_set_id))?.logical_search_id) === String(terminal.id))
      .sort((a, b) => Date.parse(String(b.server_received_at)) - Date.parse(String(a.server_received_at)))[0];
    if (!terminalShown) continue;
    const resultSet = setsById.get(String(terminalShown.result_set_id));
    if (!resultSet) continue;
    const chainIds = new Set(chain.map((row) => String(row.id)));
    const journeySetIds = new Set(setRows.filter((set) => chainIds.has(String(set.logical_search_id))).map((set) => String(set.id)));
    const journeyOpens = eventRows.filter((event) => event.event_type === 'item_open' && journeySetIds.has(String(event.result_set_id)));
    const resultSetOpens = journeyOpens.filter((event) => String(event.result_set_id) === String(resultSet.id)
      && Date.parse(String(event.server_received_at)) <= Date.parse(String(terminalShown.server_received_at)) + TEN_MINUTES_MS);
    let section: SearchInvestigationJourney['section'] | null = null;
    if (resultSet.status === 'empty' && Number(resultSet.total_match_count) === 0) section = 'empty';
    else if (chain.filter((row) => row.change_reason === 'query').length >= 3 && journeyOpens.length === 0) section = 'rephrased';
    else if (Date.parse(String(terminalShown.server_received_at)) <= Date.now() - TEN_MINUTES_MS && resultSetOpens.length === 0) section = 'no_open';
    if (!section) continue;
    const execution = latestExecution.get(String(terminal.id));
    const delivered = (items.data ?? []).filter((item) => String(item.result_set_id) === String(resultSet.id)).map((item) => ({
      key: String(item.item_key), title: titleByKey.get(String(item.item_key)) ?? String(item.item_key), position: Number(item.position),
    }));
    const memberId = String(terminal.user_id);
    rows.push({
      logicalSearchId: String(terminal.id), journeyId, memberId,
      memberName: profileMap.get(memberId) || authEmails.get(memberId) || 'Member', memberEmail: authEmails.get(memberId) ?? null,
      query: String(terminal.query_text ?? ''), normalizedQuery: String(terminal.normalized_query ?? ''),
      createdAt: String(terminal.created_at), lastSeenAt: String(terminal.last_interaction_at),
      searchVersion: execution?.search_version == null ? null : String(execution.search_version),
      currentVersion: execution?.search_version === SEARCH_VERSION, section,
      chain: chain.map((row) => ({ query: String(row.query_text ?? ''), at: String(row.created_at) })), delivered,
      opens: journeyOpens.map((event) => ({ key: String(event.item_key ?? ''), at: String(event.server_received_at) })),
    });
  }
  const grouped = new Map<string, SearchInvestigationGroup>();
  rows.forEach((row) => {
    const key = `${row.section}:${row.normalizedQuery}`;
    const existing = grouped.get(key) ?? {
      query: row.query, section: row.section, distinctMembers: 0, timesSeen: 0, lastSeenAt: row.lastSeenAt, journeys: [],
    };
    existing.journeys.push(row); existing.timesSeen += 1;
    existing.distinctMembers = new Set(existing.journeys.map((journey) => journey.memberId)).size;
    if (Date.parse(row.lastSeenAt) > Date.parse(existing.lastSeenAt)) existing.lastSeenAt = row.lastSeenAt;
    grouped.set(key, existing);
  });
  return [...grouped.values()].sort((a, b) => a.section.localeCompare(b.section)
    || b.distinctMembers - a.distinctMembers || b.timesSeen - a.timesSeen || Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));
}

export async function GET(request: NextRequest) {
  const guard = await guardAdmin(request);
  if (!guard.ok) return guard.res;
  try {
    const view = request.nextUrl.searchParams.get('view') ?? 'investigations';
    if (view === 'members') {
      const page = await getAdminUserDirectoryPage(request.nextUrl.searchParams.get('q') ?? '', 1, 100, { membership: 'all' });
      return reply({ members: page.items.map((item) => ({ id: item.id, name: `${item.first_name} ${item.last_name}`.trim() || item.email, email: item.email })) });
    }
    if (view === 'investigations') return reply({ groups: await fetchInvestigationRows(), windowDays: 90 });
    return NextResponse.json({ error: 'Unknown search view.' }, { status: 400 });
  } catch (error) {
    console.error('[discovery-search-admin]', error);
    return NextResponse.json({ error: 'Could not load search diagnostics.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await guardAdmin(request);
  if (!guard.ok) return guard.res;
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.operation === 'search') {
      const query = typeof body.query === 'string' ? body.query.trim() : '';
      const memberId = typeof body.memberId === 'string' && body.memberId ? body.memberId : null;
      if (query.length < 2 || query.length > 100) {
        return NextResponse.json({ error: 'Enter at least two characters.' }, { status: 400 });
      }
      return reply({ results: memberId ? await runMemberSearch(query, memberId) : await runGeneralSearch(query) });
    }
    if (body.operation === 'diagnose') {
      const query = typeof body.query === 'string' ? body.query.trim() : '';
      const kind = body.kind;
      const id = Number(body.id);
      const memberId = typeof body.memberId === 'string' && body.memberId ? body.memberId : null;
      if (query.length < 2 || query.length > 100 || (kind !== 'resource' && kind !== 'node') || !Number.isSafeInteger(id) || id <= 0) {
        return NextResponse.json({ error: 'A search phrase and intended item are required.' }, { status: 400 });
      }
      return reply(await diagnose(query, kind, id, memberId));
    }
    if (body.operation === 'add_alternate_name') {
      const kind = body.kind;
      const id = Number(body.id);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if ((kind !== 'resource' && kind !== 'node') || !Number.isSafeInteger(id) || id <= 0 || !name || name.length > 120) {
        return NextResponse.json({ error: 'A valid item and alternate name are required.' }, { status: 400 });
      }
      const target = await loadTarget(kind, id);
      if (!target) return NextResponse.json({ error: 'Content not found.' }, { status: 404 });
      const searchNames = [...new Map([...target.searchNames, name].map((value) => [value.toLocaleLowerCase(), value])).values()];
      const result = await getAdminClient().rpc('admin_update_discovery_items', {
        _actor_id: guard.user.id,
        _resource_ids: kind === 'resource' ? [id] : [], _node_ids: kind === 'node' ? [id] : [],
        _tag_ids: null, _tag_action: 'add', _visibility: null, _open_mode: null, _search_names: searchNames,
      });
      if (result.error) throw result.error;
      const query = typeof body.query === 'string' ? body.query.trim() : name;
      const memberId = typeof body.memberId === 'string' && body.memberId ? body.memberId : null;
      return reply({ saved: true, ...(await diagnose(query, kind, id, memberId)) });
    }
    return NextResponse.json({ error: 'Unknown search operation.' }, { status: 400 });
  } catch (error) {
    console.error('[discovery-search-admin]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Search diagnosis failed.' }, { status: 503 });
  }
}
