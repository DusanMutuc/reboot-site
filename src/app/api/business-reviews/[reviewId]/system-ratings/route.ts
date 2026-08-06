import { NextRequest, NextResponse } from 'next/server';

import {
  canManageBusinessReviews,
  parsePositiveInteger,
  type BusinessReviewSystemRating,
  type SystemScorecardAudience,
  type SystemScorecardStatus,
} from '@/lib/businessReviews';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = new Set<SystemScorecardStatus>([
  'not_started',
  'started',
  'complete',
  'consistent',
]);

type RouteContext = {
  params: Promise<{ reviewId?: string | string[] }>;
};

type SaveSystemRatingBody = {
  systemId?: unknown;
  status?: unknown;
};

type LastReviewRow = {
  last_reviewed_at: string | null;
  review_due_at: string | null;
  review_overdue: boolean;
};

async function readReviewId(context: RouteContext): Promise<number | null> {
  const params = await context.params;
  const raw = Array.isArray(params.reviewId) ? params.reviewId[0] : params.reviewId;
  return typeof raw === 'string' ? parsePositiveInteger(raw) : null;
}

async function readBody(request: NextRequest): Promise<SaveSystemRatingBody | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === 'object' ? (body as SaveSystemRatingBody) : null;
  } catch {
    return null;
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  const reviewId = await readReviewId(context);
  const body = await readBody(request);
  const systemId =
    typeof body?.systemId === 'number' && Number.isSafeInteger(body.systemId)
      ? body.systemId
      : null;
  const status =
    typeof body?.status === 'string' && VALID_STATUSES.has(body.status as SystemScorecardStatus)
      ? (body.status as SystemScorecardStatus)
      : null;

  if (!reviewId) {
    return NextResponse.json({ error: 'A valid business review id is required.' }, { status: 400 });
  }

  if (!systemId || systemId <= 0) {
    return NextResponse.json({ error: 'A valid scorecard system is required.' }, { status: 400 });
  }

  if (!status) {
    return NextResponse.json({ error: 'A valid system status is required.' }, { status: 400 });
  }

  const admin = getAdminClient();

  try {
    const { data: review, error: reviewError } = await admin
      .from('business_reviews')
      .select('id, user_id, system_scorecard_template_key')
      .eq('id', reviewId)
      .maybeSingle();

    if (reviewError) {
      return NextResponse.json({ error: reviewError.message }, { status: 400 });
    }

    if (!review) {
      return NextResponse.json({ error: 'Business review not found.' }, { status: 404 });
    }

    if (!review.system_scorecard_template_key) {
      return NextResponse.json(
        { error: 'This business review does not have a systems scorecard.' },
        { status: 409 },
      );
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

    const [{ data: system, error: systemError }, { data: template, error: templateError }] =
      await Promise.all([
        admin
          .from('system_scorecard_systems')
          .select('id, key')
          .eq('id', systemId)
          .eq('template_key', review.system_scorecard_template_key)
          .maybeSingle(),
        admin
          .from('system_scorecard_templates')
          .select('audience')
          .eq('key', review.system_scorecard_template_key)
          .maybeSingle(),
      ]);

    if (systemError) {
      return NextResponse.json({ error: systemError.message }, { status: 400 });
    }

    if (templateError) {
      return NextResponse.json({ error: templateError.message }, { status: 400 });
    }

    if (!system || !template) {
      return NextResponse.json(
        { error: 'That system does not belong to this review.' },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const { data: saved, error: saveError } = await admin
      .from('business_review_system_ratings')
      .update({
        status,
        reviewed_at: now,
        reviewed_by: guard.user.id,
        updated_by: guard.user.id,
        updated_at: now,
      })
      .eq('business_review_id', reviewId)
      .eq('system_id', systemId)
      .eq('template_key', review.system_scorecard_template_key)
      .select('system_id, status, reviewed_at, reviewed_by, updated_at')
      .maybeSingle();

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 400 });
    }

    if (!saved) {
      return NextResponse.json(
        { error: 'The scorecard system was not initialized for this review.' },
        { status: 409 },
      );
    }

    const audience = template.audience as SystemScorecardAudience;
    const { data: lastReview, error: lastReviewError } = await admin
      .from('user_system_scorecard_last_reviews')
      .select('last_reviewed_at, review_due_at, review_overdue')
      .eq('user_id', review.user_id)
      .eq('audience', audience)
      .eq('system_key', system.key)
      .maybeSingle();

    if (lastReviewError) {
      return NextResponse.json({ error: lastReviewError.message }, { status: 400 });
    }

    const latest = lastReview as LastReviewRow | null;
    const systemRating: BusinessReviewSystemRating = {
      systemId: Number(saved.system_id),
      status: saved.status as SystemScorecardStatus,
      reviewedAt: saved.reviewed_at,
      reviewedBy: saved.reviewed_by,
      updatedAt: saved.updated_at,
      lastReviewedAt: latest?.last_reviewed_at ?? saved.reviewed_at,
      reviewDueAt: latest?.review_due_at ?? null,
      reviewOverdue: latest?.review_overdue ?? false,
    };

    return NextResponse.json({ systemRating });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save system status.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
