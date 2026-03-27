import { NextRequest, NextResponse } from 'next/server';
import { getServerAnonClient } from '@/lib/supabaseServer';
import { getCoachStatusOverviewRows } from '@/lib/statusOverviewData';
import type { StatusOverviewResponse } from '@/lib/statusOverviewTypes';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = getServerAnonClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 401 });
  }

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const courseParam = searchParams.get('courseId');
  const parsedCourseId = courseParam ? Number.parseInt(courseParam, 10) : Number.NaN;
  const courseId = Number.isFinite(parsedCourseId) ? parsedCourseId : null;

  try {
    const items = await getCoachStatusOverviewRows({
      coachId: user.id,
      courseId,
    });

    return NextResponse.json({ items } satisfies StatusOverviewResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load status overview';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
