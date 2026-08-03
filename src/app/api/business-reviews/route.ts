import { NextRequest, NextResponse } from 'next/server';

import {
  canManageBusinessReviews,
  isUuid,
  loadBusinessReviews,
} from '@/lib/businessReviews';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

function readStudentId(request: NextRequest): string | null {
  const value = request.nextUrl.searchParams.get('userId');
  return value && isUuid(value) ? value : null;
}
export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  const studentId = readStudentId(request);
  if (!studentId) {
    return NextResponse.json({ error: 'A valid student id is required.' }, { status: 400 });
  }

  const admin = getAdminClient();

  try {
    const allowed = await canManageBusinessReviews(
      admin,
      guard.user.id,
      guard.roleCodes,
      studentId,
    );

    if (!allowed) {
      return NextResponse.json({ error: 'You do not have access to this student.' }, { status: 403 });
    }

    return NextResponse.json(await loadBusinessReviews(admin, studentId));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load business audits.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
