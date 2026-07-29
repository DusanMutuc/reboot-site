import { NextRequest, NextResponse } from 'next/server';
import { fetchCurrentMemberUserIds } from '@/lib/currentMembers';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

type CourseRow = { id: number; name: string | null; start_date: string | null; created_at: string };
type ProfileRow = { id: string; first_name: string | null; last_name: string | null; looker_link: string | null };

type CourseItem = { id: number; name: string; start_date: string | null };
type UserSummary = { id: string; name: string; email: string };

type LookerSummary = UserSummary & { looker_link: string | null };
type PhoneSummary = UserSummary & { phone: string | null };

function formatName(profile: ProfileRow | undefined) {
  const first = profile?.first_name?.trim() ?? '';
  const last = profile?.last_name?.trim() ?? '';
  const full = `${first} ${last}`.trim();
  return full || 'Unnamed user';
}

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const supa = getAdminClient();

  const { searchParams } = new URL(request.url);
  const courseParam = searchParams.get('course_id');
  const parsedCourseId = courseParam ? Number.parseInt(courseParam, 10) : Number.NaN;
  const requestedCourseId = Number.isFinite(parsedCourseId) ? parsedCourseId : null;

  const { data: courseRows, error: courseErr } = await supa
    .from('courses')
    .select('id, name, start_date, created_at')
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (courseErr) {
    return NextResponse.json({ error: courseErr.message }, { status: 400 });
  }

  const courses: CourseItem[] = (courseRows ?? []).map((row: CourseRow) => ({
    id: row.id,
    name: row.name?.trim() || `Course #${row.id}`,
    start_date: row.start_date,
  }));

  const defaultCourseId = courses.length > 0 ? courses[0].id : null;
  const courseId = requestedCourseId && courses.some((c) => c.id === requestedCourseId)
    ? requestedCourseId
    : defaultCourseId;

  let userIds: string[];
  try {
    userIds = await fetchCurrentMemberUserIds(supa);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load current members';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (userIds.length === 0) {
    return NextResponse.json({
      courses,
      defaultCourseId,
      selectedCourseId: courseId,
      missingCoachUsers: [],
      missingLookerUsers: [],
      missingPhoneUsers: [],
    });
  }

  const { data: profileRows, error: profileErr } = await supa
    .from('profiles')
    .select('id, first_name, last_name, looker_link')
    .in('id', userIds);

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 400 });
  }

  const profileMap = new Map<string, ProfileRow>();
  for (const row of profileRows ?? []) {
    if (row?.id) profileMap.set(row.id, row as ProfileRow);
  }

  const userIdSet = new Set(userIds);

  const assignedSet = new Set<string>();
  if (courseId !== null) {
    const { data: assignmentRows, error: assignmentErr } = await supa
      .from('user_coaches')
      .select('user_id')
      .eq('course_id', courseId)
      .eq('is_active', true);

    if (assignmentErr) {
      return NextResponse.json({ error: assignmentErr.message }, { status: 400 });
    }

    for (const row of assignmentRows ?? []) {
      if (row?.user_id) assignedSet.add(row.user_id);
    }
  }

  const missingCoachIds = courseId === null
    ? []
    : userIds.filter((id) => !assignedSet.has(id));

  const missingLookerRows = (profileRows ?? []).filter((row) => {
    if (!row?.id) return false;
    const link = (row.looker_link ?? '').trim();
    return link.length === 0;
  });

  const authMap = new Map<string, { email: string; phone: string | null }>();

  let page = 1;
  const perPage = 1000; // ← prefer-const
  for (;;) {
    const { data, error } = await supa.auth.admin.listUsers({ page, perPage });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    for (const usr of data.users) {
      if (userIdSet.has(usr.id)) {
        authMap.set(usr.id, {
          email: (usr.email || '').toLowerCase(),
          phone: usr.phone ?? null,
        });
      }
    }
    if (data.users.length < perPage || authMap.size >= userIdSet.size) break;
    page++;
  }

  const missingCoachUsers: UserSummary[] = missingCoachIds.map((id) => {
    const profile = profileMap.get(id);
    const auth = authMap.get(id);
    return {
      id,
      name: formatName(profile),
      email: auth?.email ?? '',
    };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));

  const missingLookerUsers: LookerSummary[] = missingLookerRows
    .map((row) => {
      const auth = row?.id ? authMap.get(row.id) : undefined;
      return {
        id: row.id,
        name: formatName(row as ProfileRow),
        email: auth?.email ?? '',
        looker_link: row.looker_link ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));

  const missingPhoneUsers: PhoneSummary[] = userIds
    .filter((id) => {
      const auth = authMap.get(id);
      const phone = auth?.phone ?? '';
      return !phone || phone.trim().length === 0;
    })
    .map((id) => {
      const profile = profileMap.get(id);
      const auth = authMap.get(id);
      return {
        id,
        name: formatName(profile),
        email: auth?.email ?? '',
        phone: auth?.phone ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));

  return NextResponse.json({
    courses,
    defaultCourseId,
    selectedCourseId: courseId,
    missingCoachUsers,
    missingLookerUsers,
    missingPhoneUsers,
  });
}
