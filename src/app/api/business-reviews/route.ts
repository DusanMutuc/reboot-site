import { NextRequest, NextResponse } from 'next/server';

import {
  canManageBusinessReviews,
  isIsoDate,
  isUuid,
  loadBusinessReviews,
} from '@/lib/businessReviews';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

type CreateBusinessReviewBody = {
  userId?: unknown;
  reviewDate?: unknown;
};

function readStudentId(request: NextRequest): string | null {
  const value = request.nextUrl.searchParams.get('userId');
  return value && isUuid(value) ? value : null;
}

async function readCreateBody(request: NextRequest): Promise<CreateBusinessReviewBody | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === 'object' ? (body as CreateBusinessReviewBody) : null;
  } catch {
    return null;
  }
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

export async function POST(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  const body = await readCreateBody(request);
  const studentId = typeof body?.userId === 'string' ? body.userId : '';
  const reviewDate =
    typeof body?.reviewDate === 'string'
      ? body.reviewDate
      : new Date().toISOString().slice(0, 10);

  if (!isUuid(studentId)) {
    return NextResponse.json({ error: 'A valid student id is required.' }, { status: 400 });
  }

  if (!isIsoDate(reviewDate)) {
    return NextResponse.json({ error: 'Review date must be a valid YYYY-MM-DD date.' }, { status: 400 });
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

    const { data, error } = await guard.supabase.rpc('create_business_review', {
      _review_date: reviewDate,
      _user_id: studentId,
    });

    if (error) {
      const missingFunction = error.code === 'PGRST202' || error.message.includes('schema cache');

      return NextResponse.json(
        {
          error: missingFunction
            ? 'Business Audit creation is not installed in the database yet.'
            : error.message,
        },
        { status: missingFunction ? 503 : 400 },
      );
    }

    const created = (
      Array.isArray(data) ? data[0] : data
    ) as { id?: number | string } | null;
    const createdId = Number(created?.id);
    const payload = await loadBusinessReviews(admin, studentId);
    const review = payload.reviews.find((item) => item.id === createdId) ?? payload.reviews[0];

    if (!review) {
      return NextResponse.json(
        { error: 'The audit was created but could not be reloaded.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create business audit.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
