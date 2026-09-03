import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';
import type { CoachResourceOption, CoachResourceSuggestion } from '@/lib/discoveryRemainingTypes';

export const dynamic = 'force-dynamic';

class SuggestionRouteError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function assertCanCoach(actorId: string, roleCodes: string[], userId: string, coachingNoteId: number) {
  const admin = getAdminClient();
  const note = await admin.from('coaching_notes').select('id,user_id').eq('id', coachingNoteId).eq('user_id', userId).maybeSingle();
  if (note.error) throw new SuggestionRouteError(`Could not validate the coaching cycle: ${note.error.message}`, 500);
  if (!note.data) throw new SuggestionRouteError('Coaching cycle not found for this member.', 404);
  if (roleCodes.some((code) => code === 'admin' || code === 'superadmin')) return;
  if (!roleCodes.includes('coach')) throw new SuggestionRouteError('Coach or admin access is required.', 403);
  const roster = await admin.from('user_coaches').select('id').eq('user_id', userId).eq('coach_id', actorId).eq('is_active', true).limit(1).maybeSingle();
  if (roster.error) throw new SuggestionRouteError(`Could not validate the coach roster: ${roster.error.message}`, 500);
  if (!roster.data) throw new SuggestionRouteError('This member is not on your active roster.', 403);
}

async function eligibility(userId: string, resourceId: number): Promise<{ eligible: boolean; reason: string | null }> {
  const admin = getAdminClient();
  const [resource, blocks, preference] = await Promise.all([
    admin.from('resources').select('id,state,discovery_open_mode').eq('id', resourceId).maybeSingle(),
    admin.from('content_blocks').select('id').eq('block_type', 'asset').eq('resource_id', resourceId).limit(1),
    admin.from('user_resource_discovery_preferences').select('preference').eq('user_id', userId).eq('resource_id', resourceId).maybeSingle(),
  ]);
  const error = resource.error ?? blocks.error ?? preference.error;
  if (error) throw error;
  if (!resource.data) return { eligible: false, reason: 'This resource no longer exists.' };
  if (resource.data.state !== 'published') return { eligible: false, reason: 'Draft resources cannot be suggested.' };
  if (preference.data) {
    return { eligible: false, reason: preference.data.preference === 'finished'
      ? 'This member has already marked it finished.' : 'This member has marked it not for them right now.' };
  }
  if ((blocks.data ?? []).length > 0) {
    const decision = await admin.from('discovery_decisions').select('answer,evidence')
      .eq('item_kind', 'resource').eq('item_id', resourceId).eq('question', 'placement').maybeSingle();
    if (decision.error) throw decision.error;
    if (!decision.data || decision.data.answer !== 'direct') {
      return { eligible: false, reason: 'This sits inside a guide and has not been approved for standalone use.' };
    }
    const currentEvidence = await admin.rpc('discovery_evidence', { _kind: 'resource', _id: resourceId, _question: 'placement' });
    if (currentEvidence.error) throw currentEvidence.error;
    if (stableJson(decision.data.evidence) !== stableJson(currentEvidence.data)) {
      return { eligible: false, reason: 'Its standalone-use review is out of date.' };
    }
  }
  const access = await admin.rpc('can_access_discovery_resource', { _user_id: userId, _resource_id: resourceId });
  if (access.error) throw access.error;
  if (!access.data) return { eligible: false, reason: 'This member cannot currently open it.' };
  return { eligible: true, reason: null };
}

async function listSuggestions(userId: string): Promise<CoachResourceSuggestion[]> {
  const admin = getAdminClient();
  const loaded = await admin.from('coach_resource_suggestions')
    .select('id,resource_id,coach_id,created_at,removed_at,member_resolution,member_resolved_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
  if (loaded.error) throw loaded.error;
  const resourceIds = [...new Set((loaded.data ?? []).map((row) => Number(row.resource_id)))];
  const coachIds = [...new Set((loaded.data ?? []).map((row) => String(row.coach_id)))];
  const [resources, coaches] = await Promise.all([
    resourceIds.length ? admin.from('resources').select('id,title,type').in('id', resourceIds) : Promise.resolve({ data: [], error: null }),
    coachIds.length ? admin.from('profiles').select('id,first_name,last_name').in('id', coachIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const error = resources.error ?? coaches.error;
  if (error) throw error;
  const resourceMap = new Map((resources.data ?? []).map((row) => [Number(row.id), row]));
  const coachMap = new Map((coaches.data ?? []).map((row) => [String(row.id), `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || 'Coach']));
  return (loaded.data ?? []).map((row) => {
    const resource = resourceMap.get(Number(row.resource_id));
    const resolution = row.member_resolution === 'finished' || row.member_resolution === 'not_interested'
      ? row.member_resolution : row.removed_at ? 'removed' : null;
    return {
      id: String(row.id), resourceId: Number(row.resource_id), title: String(resource?.title ?? `Resource ${row.resource_id}`),
      mediaType: String(resource?.type ?? 'resource'), createdAt: String(row.created_at),
      coachName: coachMap.get(String(row.coach_id)) ?? 'Coach', active: !row.removed_at && !row.member_resolution,
      resolution,
    } satisfies CoachResourceSuggestion;
  });
}

async function listOptions(userId: string, query: string): Promise<CoachResourceOption[]> {
  const admin = getAdminClient();
  let request = admin.from('resources').select('id,title,description,type,state,discovery_open_mode').order('title').limit(60);
  if (query) request = request.ilike('title', `%${query.replace(/[%_]/g, '\\$&')}%`);
  const loaded = await request;
  if (loaded.error) throw loaded.error;
  const options: CoachResourceOption[] = [];
  for (const resource of loaded.data ?? []) {
    const available = await eligibility(userId, Number(resource.id));
    options.push({
      id: Number(resource.id), title: String(resource.title), mediaType: String(resource.type),
      description: String(resource.description ?? ''), eligible: available.eligible, reason: available.reason,
    });
  }
  return options.sort((left, right) => Number(right.eligible) - Number(left.eligible) || left.title.localeCompare(right.title));
}

function handleError(error: unknown) {
  if (error instanceof SuggestionRouteError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error('[coach-resource-suggestions]', error);
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Resource suggestion failed.' }, { status: 500 });
}

function inputs(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('user_id')?.trim() ?? '';
  const coachingNoteId = Number(request.nextUrl.searchParams.get('coaching_note_id'));
  if (!userId || !Number.isSafeInteger(coachingNoteId) || coachingNoteId <= 0) {
    throw new SuggestionRouteError('Member and coaching cycle are required.');
  }
  return { userId, coachingNoteId };
}

export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;
  try {
    const { userId, coachingNoteId } = inputs(request);
    await assertCanCoach(guard.user.id, guard.roleCodes, userId, coachingNoteId);
    const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 120);
    const [suggestions, options] = await Promise.all([listSuggestions(userId), listOptions(userId, q)]);
    return NextResponse.json({ suggestions, options }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return handleError(error); }
}

export async function POST(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;
  try {
    const body = await request.json() as Record<string, unknown>;
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const coachingNoteId = Number(body.coachingNoteId);
    if (!userId || !Number.isSafeInteger(coachingNoteId) || coachingNoteId <= 0) throw new SuggestionRouteError('Member and coaching cycle are required.');
    await assertCanCoach(guard.user.id, guard.roleCodes, userId, coachingNoteId);
    const admin = getAdminClient();
    if (body.operation === 'add') {
      const resourceId = Number(body.resourceId);
      if (!Number.isSafeInteger(resourceId) || resourceId <= 0) throw new SuggestionRouteError('Choose a resource.');
      const available = await eligibility(userId, resourceId);
      if (!available.eligible) throw new SuggestionRouteError(available.reason ?? 'That resource cannot be suggested.');
      const existing = await admin.from('coach_resource_suggestions').select('id')
        .eq('user_id', userId).eq('resource_id', resourceId).is('removed_at', null).is('member_resolution', null).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) {
        const removed = await admin.from('coach_resource_suggestions').update({ removed_at: new Date().toISOString(), removed_by: guard.user.id }).eq('id', existing.data.id);
        if (removed.error) throw removed.error;
      }
      const inserted = await admin.from('coach_resource_suggestions').insert({
        user_id: userId, resource_id: resourceId, coach_id: guard.user.id, coaching_note_id: coachingNoteId,
      });
      if (inserted.error) throw inserted.error;
    } else if (body.operation === 'remove') {
      const suggestionId = typeof body.suggestionId === 'string' ? body.suggestionId : '';
      if (!suggestionId) throw new SuggestionRouteError('Choose a suggestion to remove.');
      const removed = await admin.from('coach_resource_suggestions').update({ removed_at: new Date().toISOString(), removed_by: guard.user.id })
        .eq('id', suggestionId).eq('user_id', userId).is('removed_at', null).is('member_resolution', null);
      if (removed.error) throw removed.error;
    } else {
      throw new SuggestionRouteError('Unknown suggestion operation.');
    }
    return NextResponse.json({ suggestions: await listSuggestions(userId) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return handleError(error); }
}
