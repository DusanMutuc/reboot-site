import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/requireUser';

export const dynamic = 'force-dynamic';

type CoachAssignment = {
  coach_id: string;
  relationship_type: 'primary' | 'implementation' | null;
};

type CoachProfile = {
  user_id: string;
  m2_booking_url: string | null;
  impl_booking_url: string | null;
  call15_url: string | null;
};

function normalizeUrl(raw?: string | null): string | null {
  const value = raw?.trim();
  return value || null;
}

export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  const courseParam = request.nextUrl.searchParams.get('courseId');
  const courseId = courseParam === null ? null : Number(courseParam);

  if (courseId !== null && (!Number.isInteger(courseId) || courseId <= 0)) {
    return NextResponse.json({ error: 'Invalid courseId' }, { status: 400 });
  }

  const admin = getAdminClient();
  let assignmentQuery = admin
    .from('user_coaches')
    .select('coach_id, relationship_type')
    .eq('user_id', guard.user.id)
    .eq('is_active', true);

  if (courseId !== null) {
    assignmentQuery = assignmentQuery.eq('course_id', courseId);
  }

  const { data: assignmentData, error: assignmentError } = await assignmentQuery;
  if (assignmentError) {
    console.error('Program links assignment fetch error:', assignmentError);
    return NextResponse.json({ error: 'Unable to load coach assignments.' }, { status: 500 });
  }

  const assignments = (assignmentData ?? []) as CoachAssignment[];
  const primaryCoachId = assignments.find(
    (assignment) => assignment.relationship_type === 'primary'
  )?.coach_id;
  const implementationCoachId = assignments.find(
    (assignment) => assignment.relationship_type === 'implementation'
  )?.coach_id;
  const coachIds = Array.from(
    new Set([primaryCoachId, implementationCoachId].filter((id): id is string => Boolean(id)))
  );

  if (coachIds.length === 0) {
    return NextResponse.json({ m2Url: null, implUrl: null });
  }

  const { data: profileData, error: profileError } = await admin
    .from('coach_profiles')
    .select('user_id, m2_booking_url, impl_booking_url, call15_url')
    .in('user_id', coachIds);

  if (profileError) {
    console.error('Program links coach profile fetch error:', profileError);
    return NextResponse.json({ error: 'Unable to load coach booking links.' }, { status: 500 });
  }

  const profiles = new Map(
    ((profileData ?? []) as CoachProfile[]).map((profile) => [profile.user_id, profile])
  );
  const primaryProfile = primaryCoachId ? profiles.get(primaryCoachId) : null;
  const implementationProfile = implementationCoachId
    ? profiles.get(implementationCoachId)
    : null;

  return NextResponse.json({
    m2Url: normalizeUrl(primaryProfile?.m2_booking_url),
    implUrl: normalizeUrl(
      implementationProfile?.impl_booking_url ?? implementationProfile?.call15_url
    ),
  });
}
