import { NextRequest, NextResponse } from 'next/server';

import { canManageBusinessReviews, parsePositiveInteger } from '@/lib/businessReviews';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ reviewId?: string | string[] }>;
};

async function readReviewId(context: RouteContext): Promise<number | null> {
  const params = await context.params;
  const raw = Array.isArray(params.reviewId) ? params.reviewId[0] : params.reviewId;
  return typeof raw === 'string' ? parsePositiveInteger(raw) : null;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  const reviewId = await readReviewId(context);
  let completed: boolean | null = null;
  try {
    const body = (await request.json()) as { completed?: unknown };
    completed = typeof body.completed === 'boolean' ? body.completed : null;
  } catch {
    completed = null;
  }

  if (!reviewId || completed === null) {
    return NextResponse.json(
      { error: 'A valid Business Review and completion state are required.' },
      { status: 400 },
    );
  }

  const admin = getAdminClient();

  try {
    const { data: review, error: reviewError } = await admin
      .from('business_reviews')
      .select('id, user_id')
      .eq('id', reviewId)
      .maybeSingle();

    if (reviewError) throw new Error(reviewError.message);
    if (!review) {
      return NextResponse.json({ error: 'Business Review not found.' }, { status: 404 });
    }

    const allowed = await canManageBusinessReviews(
      admin,
      guard.user.id,
      guard.roleCodes,
      review.user_id,
    );
    if (!allowed) {
      return NextResponse.json({ error: 'You do not have access to this review.' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const { data: saved, error: saveError } = await admin
      .from('business_reviews')
      .update({
        status: completed ? 'completed' : 'draft',
        completed_at: completed ? now : null,
        updated_at: now,
      })
      .eq('id', reviewId)
      .select('status, completed_at, updated_at')
      .single();

    if (saveError) throw new Error(saveError.message);
    return NextResponse.json({
      status: saved.status,
      completedAt: saved.completed_at,
      updatedAt: saved.updated_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not update this review.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
