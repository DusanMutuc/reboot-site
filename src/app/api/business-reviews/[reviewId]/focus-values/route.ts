import { NextRequest, NextResponse } from 'next/server';

import {
  canManageBusinessReviews,
  parsePositiveInteger,
} from '@/lib/businessReviews';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ reviewId?: string | string[] }>;
};

type SaveFocusValueBody = {
  dimensionId?: unknown;
  value?: unknown;
};

async function readReviewId(context: RouteContext): Promise<number | null> {
  const params = await context.params;
  const raw = Array.isArray(params.reviewId) ? params.reviewId[0] : params.reviewId;
  return typeof raw === 'string' ? parsePositiveInteger(raw) : null;
}

async function readBody(request: NextRequest): Promise<SaveFocusValueBody | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === 'object' ? (body as SaveFocusValueBody) : null;
  } catch {
    return null;
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  const reviewId = await readReviewId(context);
  const body = await readBody(request);
  const dimensionId =
    typeof body?.dimensionId === 'number' && Number.isSafeInteger(body.dimensionId)
      ? body.dimensionId
      : null;
  const value =
    typeof body?.value === 'number' && Number.isSafeInteger(body.value) ? body.value : null;

  if (!reviewId) {
    return NextResponse.json({ error: 'A valid business audit id is required.' }, { status: 400 });
  }

  if (!dimensionId || dimensionId <= 0) {
    return NextResponse.json({ error: 'A valid Focus Finder dimension is required.' }, { status: 400 });
  }

  if (value === null || value < 1 || value > 7) {
    return NextResponse.json({ error: 'Focus Finder values must be integers from 1 to 7.' }, { status: 400 });
  }

  const admin = getAdminClient();

  try {
    const { data: review, error: reviewError } = await admin
      .from('business_reviews')
      .select('id, user_id, focus_finder_template_key')
      .eq('id', reviewId)
      .maybeSingle();

    if (reviewError) {
      return NextResponse.json({ error: reviewError.message }, { status: 400 });
    }

    if (!review) {
      return NextResponse.json({ error: 'Business audit not found.' }, { status: 404 });
    }

    const allowed = await canManageBusinessReviews(
      admin,
      guard.user.id,
      guard.roleCodes,
      review.user_id,
    );

    if (!allowed) {
      return NextResponse.json({ error: 'You do not have access to this audit.' }, { status: 403 });
    }

    const { data: dimension, error: dimensionError } = await admin
      .from('focus_finder_dimensions')
      .select('id')
      .eq('id', dimensionId)
      .eq('template_key', review.focus_finder_template_key)
      .maybeSingle();

    if (dimensionError) {
      return NextResponse.json({ error: dimensionError.message }, { status: 400 });
    }

    if (!dimension) {
      return NextResponse.json(
        { error: 'That Focus Finder dimension does not belong to this audit.' },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const { data: saved, error: saveError } = await admin
      .from('business_review_focus_values')
      .upsert(
        {
          business_review_id: reviewId,
          template_key: review.focus_finder_template_key,
          dimension_id: dimensionId,
          value,
          updated_by: guard.user.id,
          updated_at: now,
        },
        { onConflict: 'business_review_id,dimension_id' },
      )
      .select('dimension_id, value, updated_at')
      .single();

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 400 });
    }

    return NextResponse.json({
      focusValue: {
        dimensionId: Number(saved.dimension_id),
        value: Number(saved.value),
        updatedAt: saved.updated_at,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save Focus Finder value.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
