import { DateTime, IANAZone } from 'luxon';
import { NextRequest, NextResponse } from 'next/server';

import { invalidateAdminUserDirectory } from '@/lib/adminUserDirectory';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

type JsonObject = Record<string, unknown>;

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validHttpUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function readBody(request: NextRequest): Promise<JsonObject | null> {
  try {
    const value = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as JsonObject
      : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const supa = getAdminClient();
  const [cyclesResult, systemsResult, meetingsResult, enrollmentsResult, optionsResult, roleResult] =
    await Promise.all([
      supa
        .from('ninety_day_cycles')
        .select('id, name, starts_on, ends_on, timezone, status, active_system_node_id, created_at, updated_at')
        .order('starts_on', { ascending: false }),
      supa.from('ninety_day_cycle_systems').select('cycle_id, node_id, position').order('position'),
      supa
        .from('ninety_day_cycle_meetings')
        .select('id, cycle_id, title, starts_at, ends_at, join_url')
        .order('starts_at'),
      supa
        .from('ninety_day_cycle_users')
        .select('cycle_id, user_id, enrolled_at, ended_at, outcome')
        .order('enrolled_at'),
      supa
        .from('content_nodes')
        .select('id, title, slug, node_type, description, hero_image')
        .eq('state', 'published')
        .not('slug', 'is', null)
        .in('node_type', ['lesson', 'chapter', 'playlist'])
        .order('title'),
      supa.from('roles').select('id, code').in('code', ['user', 'ninety-day-user', 'past_member']),
    ]);

  for (const result of [cyclesResult, systemsResult, meetingsResult, enrollmentsResult, optionsResult, roleResult]) {
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  }

  const roleById = new Map((roleResult.data ?? []).map((role) => [role.id, role.code]));
  const fullMemberIds = new Set<string>();
  const programmeMemberIds = new Set<string>();
  const pastMemberIds = new Set<string>();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supa.from('user_roles').select('user_id, role_id')
      .in('role_id', [...roleById.keys()]).order('user_id').order('role_id').range(offset, offset + 499);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    for (const row of data ?? []) {
      const code = roleById.get(row.role_id);
      if (code === 'user') fullMemberIds.add(row.user_id);
      if (code === 'ninety-day-user') programmeMemberIds.add(row.user_id);
      if (code === 'past_member') pastMemberIds.add(row.user_id);
    }
    if (!data || data.length < 500) break;
  }

  const enrollmentRows = enrollmentsResult.data ?? [];
  const memberIds = Array.from(new Set([
    ...fullMemberIds, ...programmeMemberIds, ...enrollmentRows.map((row) => row.user_id),
  ]));
  const people: Array<{ id: string; name: string; has_full_membership: boolean; default_home: string }> = [];
  for (let offset = 0; offset < memberIds.length; offset += 200) {
    const ids = memberIds.slice(offset, offset + 200);
    const [profilesResult, preferencesResult] = await Promise.all([
      supa.from('profiles').select('id, first_name, last_name').in('id', ids),
      supa.from('member_home_preferences').select('user_id, default_home').in('user_id', ids),
    ]);
    const error = profilesResult.error ?? preferencesResult.error;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const preferences = new Map((preferencesResult.data ?? []).map((row) => [row.user_id, row.default_home]));
    for (const profile of profilesResult.data ?? []) {
      const hasActiveCycle = enrollmentRows.some((row) => row.user_id === profile.id && row.ended_at === null
        && cyclesResult.data?.some((cycle) => cycle.id === row.cycle_id && cycle.status === 'active'));
      people.push({
        id: profile.id,
        name: `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Unnamed user',
        has_full_membership: fullMemberIds.has(profile.id),
        default_home: !fullMemberIds.has(profile.id) || (hasActiveCycle && preferences.get(profile.id) === 'ninety-day')
          ? 'ninety-day' : 'member',
      });
    }
  }
  people.sort((a, b) => a.name.localeCompare(b.name));
  const openEnrollmentIds = new Set(
    enrollmentRows.filter((row) => row.ended_at === null).map((row) => row.user_id),
  );

  const cycles = (cyclesResult.data ?? []).map((cycle) => ({
    ...cycle,
    systems: (systemsResult.data ?? []).filter((row) => row.cycle_id === cycle.id),
    meetings: (meetingsResult.data ?? []).filter((row) => row.cycle_id === cycle.id),
    members: enrollmentRows
      .filter((row) => row.cycle_id === cycle.id)
      .map((row) => ({
        ...row,
        name: people.find((person) => person.id === row.user_id)?.name ?? 'Unnamed user',
        has_full_membership: fullMemberIds.has(row.user_id),
        default_home: people.find((person) => person.id === row.user_id)?.default_home ?? 'member',
      })),
  }));

  return NextResponse.json({
    cycles,
    systemOptions: optionsResult.data ?? [],
    availableUsers: people.filter((person) => !openEnrollmentIds.has(person.id) && !pastMemberIds.has(person.id)),
  });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const supa = getAdminClient();
  const action = stringValue(body.action);

  if (action === 'create-cycle') {
    const name = stringValue(body.name);
    const startsOn = stringValue(body.starts_on);
    const timezone = stringValue(body.timezone) || 'America/Edmonton';
    const start = DateTime.fromISO(startsOn);
    if (!name || !start.isValid || !IANAZone.isValidZone(timezone)) {
      return NextResponse.json(
        { error: 'Name, start date, and a valid timezone are required' },
        { status: 400 },
      );
    }

    const { data, error } = await supa
      .from('ninety_day_cycles')
      .insert({
        name,
        starts_on: startsOn,
        ends_on: start.plus({ days: 89 }).toISODate(),
        timezone,
        status: 'draft',
        created_by: guard.user.id,
        updated_by: guard.user.id,
      })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, cycle_id: data.id });
  }

  if (action === 'create-meeting') {
    const cycleId = positiveInteger(body.cycle_id);
    const title = stringValue(body.title) || 'Weekly group call';
    const startsAt = stringValue(body.starts_at);
    const endsAt = stringValue(body.ends_at);
    const joinUrl = stringValue(body.join_url);
    if (!cycleId || !DateTime.fromISO(startsAt).isValid || (endsAt && !DateTime.fromISO(endsAt).isValid)) {
      return NextResponse.json({ error: 'Cycle and a valid meeting start are required' }, { status: 400 });
    }
    if (!validHttpUrl(joinUrl)) {
      return NextResponse.json({ error: 'Meeting URL must use http or https' }, { status: 400 });
    }

    const { data, error } = await supa
      .from('ninety_day_cycle_meetings')
      .insert({
        cycle_id: cycleId,
        title,
        starts_at: startsAt,
        ends_at: endsAt || null,
        join_url: joinUrl || null,
      })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, meeting_id: data.id });
  }

  if (action === 'enroll-user') {
    const cycleId = positiveInteger(body.cycle_id);
    if (!cycleId || !validUuid(body.user_id)) {
      return NextResponse.json({ error: 'Cycle and user are required' }, { status: 400 });
    }
    const { error } = await supa.rpc('admin_enroll_ninety_day_user', {
      p_user_id: body.user_id,
      p_cycle_id: cycleId,
      p_make_default: body.make_default === true,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    invalidateAdminUserDirectory();
    return NextResponse.json({ ok: true });
  }

  if (['set-default-home', 'grant-full-membership', 'end-enrollment'].includes(action)) {
    if (!validUuid(body.user_id)) {
      return NextResponse.json({ error: 'A valid user is required' }, { status: 400 });
    }
    if (action === 'set-default-home' && !['member', 'ninety-day'].includes(stringValue(body.default_home))) {
      return NextResponse.json({ error: 'Invalid default home' }, { status: 400 });
    }
    const cycleId = positiveInteger(body.cycle_id);
    if (action === 'end-enrollment' && !cycleId) {
      return NextResponse.json({ error: 'A cycle is required' }, { status: 400 });
    }
    const result = action === 'set-default-home'
      ? await supa.rpc('set_member_default_home', { p_user_id: body.user_id, p_default_home: body.default_home })
      : action === 'grant-full-membership'
        ? await supa.rpc('grant_full_membership', { p_user_id: body.user_id })
        : await supa.rpc('end_ninety_day_enrollment', { p_user_id: body.user_id, p_cycle_id: cycleId });
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    invalidateAdminUserDirectory();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}

export async function PATCH(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const action = stringValue(body.action);
  if (action !== 'configure-cycle') {
    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  }

  const cycleId = positiveInteger(body.cycle_id);
  const name = stringValue(body.name);
  const startsOn = stringValue(body.starts_on);
  const timezone = stringValue(body.timezone);
  const status = stringValue(body.status);
  const systemIds = Array.isArray(body.system_node_ids)
    ? body.system_node_ids.map(positiveInteger).filter((id): id is number => id !== null)
    : [];
  const activeId = body.active_system_node_id == null
    ? null
    : positiveInteger(body.active_system_node_id);

  if (!cycleId || !name || !DateTime.fromISO(startsOn).isValid || !IANAZone.isValidZone(timezone)) {
    return NextResponse.json(
      { error: 'Cycle, name, start date, and timezone are required' },
      { status: 400 },
    );
  }
  if (!['draft', 'active', 'completed'].includes(status) || systemIds.length > 8) {
    return NextResponse.json({ error: 'Invalid cycle status or system selection' }, { status: 400 });
  }

  const { error } = await getAdminClient().rpc('configure_ninety_day_cycle', {
    p_cycle_id: cycleId,
    p_name: name,
    p_starts_on: startsOn,
    p_timezone: timezone,
    p_status: status,
    p_system_node_ids: systemIds,
    p_active_system_node_id: activeId,
    p_actor_id: guard.user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;
  const url = new URL(request.url);
  if (url.searchParams.get('resource') !== 'meeting') {
    return NextResponse.json({ error: 'Unsupported resource' }, { status: 400 });
  }
  const meetingId = positiveInteger(url.searchParams.get('id'));
  if (!meetingId) return NextResponse.json({ error: 'Invalid meeting id' }, { status: 400 });

  const { error } = await getAdminClient()
    .from('ninety_day_cycle_meetings')
    .delete()
    .eq('id', meetingId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
