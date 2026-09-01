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
      supa.from('roles').select('id').eq('code', 'ninety-day-user').maybeSingle(),
    ]);

  for (const result of [cyclesResult, systemsResult, meetingsResult, enrollmentsResult, optionsResult, roleResult]) {
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  }

  const roleId = roleResult.data?.id ?? null;
  const { data: roleAssignments, error: assignmentsError } = roleId
    ? await supa.from('user_roles').select('user_id').eq('role_id', roleId)
    : { data: [], error: null };
  if (assignmentsError) return NextResponse.json({ error: assignmentsError.message }, { status: 400 });

  const enrollmentRows = enrollmentsResult.data ?? [];
  const ninetyDayUserIds = Array.from(new Set([
    ...(roleAssignments ?? []).map((row) => row.user_id),
    ...enrollmentRows.map((row) => row.user_id),
  ]));
  const { data: profiles, error: profilesError } = ninetyDayUserIds.length > 0
    ? await supa.from('profiles').select('id, first_name, last_name').in('id', ninetyDayUserIds)
    : { data: [], error: null };
  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 400 });

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const people = ninetyDayUserIds.map((id) => {
    const profile = profileMap.get(id);
    return {
      id,
      name: `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || 'Unnamed user',
    };
  });
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
      })),
  }));

  return NextResponse.json({
    cycles,
    systemOptions: optionsResult.data ?? [],
    availableUsers: people.filter((person) => !openEnrollmentIds.has(person.id)),
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
    const { error } = await supa.rpc('enroll_ninety_day_user', {
      p_user_id: body.user_id,
      p_cycle_id: cycleId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
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
