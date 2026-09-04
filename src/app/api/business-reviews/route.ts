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

type CreateReviewBody = {
  userId?: unknown;
  reviewDate?: unknown;
};

function readStudentId(request: NextRequest): string | null {
  const value = request.nextUrl.searchParams.get('userId');
  return value && isUuid(value) ? value : null;
}

async function readCreateBody(request: NextRequest): Promise<CreateReviewBody | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === 'object' ? (body as CreateReviewBody) : null;
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
    const message = error instanceof Error ? error.message : 'Failed to load business reviews.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  const body = await readCreateBody(request);
  const studentId =
    typeof body?.userId === 'string' && isUuid(body.userId) ? body.userId : null;
  const reviewDate =
    typeof body?.reviewDate === 'string' && isIsoDate(body.reviewDate)
      ? body.reviewDate
      : null;

  if (!studentId) {
    return NextResponse.json({ error: 'A valid student id is required.' }, { status: 400 });
  }

  if (!reviewDate) {
    return NextResponse.json({ error: 'A valid review date is required.' }, { status: 400 });
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

    // A repeated click should reopen the draft the coach already has instead of
    // leaving two identical reviews on the same date. The GHL sync adopts an
    // unlinked manual draft the same way when the appointment finally arrives.
    const { data: existing, error: existingError } = await admin
      .from('business_reviews')
      .select('id')
      .eq('user_id', studentId)
      .eq('review_date', reviewDate)
      .eq('status', 'draft')
      .is('meeting_id', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);

    let reviewId = existing ? Number(existing.id) : null;

    if (reviewId === null) {
      // create_business_review owns the coaching note, template selection, and
      // scorecard invariants, and reads the actor from auth.uid(), so it has to
      // run on the caller's client rather than the service-role one.
      const { data, error } = await guard.supabase.rpc('create_business_review', {
        _user_id: studentId,
        _review_date: reviewDate,
      });

      if (error) {
        const missingFunction =
          error.code === 'PGRST202' || error.message.includes('schema cache');

        return NextResponse.json(
          {
            error: missingFunction
              ? 'Business Review creation is not installed in the database yet.'
              : error.message,
          },
          { status: missingFunction ? 503 : 400 },
        );
      }

      const created = (Array.isArray(data) ? data[0] : data) as { id?: unknown } | null;
      if (!created?.id) {
        throw new Error('The Business Review could not be created.');
      }

      reviewId = Number(created.id);
    }

    return NextResponse.json({
      reviewId,
      created: existing === null,
      ...(await loadBusinessReviews(admin, studentId)),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create the business review.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
