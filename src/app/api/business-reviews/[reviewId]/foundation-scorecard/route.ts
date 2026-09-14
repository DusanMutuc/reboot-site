import { NextRequest, NextResponse } from 'next/server';

import { loadBusinessReviews, parsePositiveInteger } from '@/lib/businessReviews';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ reviewId?: string | string[] }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  const params = await context.params;
  const raw = Array.isArray(params.reviewId) ? params.reviewId[0] : params.reviewId;
  const reviewId = typeof raw === 'string' ? parsePositiveInteger(raw) : null;
  if (!reviewId) {
    return NextResponse.json({ error: 'A valid Business Review id is required.' }, { status: 400 });
  }

  const { error } = await guard.supabase.rpc('assign_foundation_scorecard_to_business_review', {
    _business_review_id: reviewId,
  });
  if (error) {
    const missingFunction = error.code === 'PGRST202' || error.message.includes('schema cache');
    return NextResponse.json(
      { error: missingFunction
        ? 'Foundation scorecard assignment is not installed in the database yet.'
        : error.message },
      { status: missingFunction ? 503 : 400 },
    );
  }

  const admin = getAdminClient();
  const { data: review, error: reviewError } = await admin
    .from('business_reviews')
    .select('user_id')
    .eq('id', reviewId)
    .single();
  if (reviewError) {
    return NextResponse.json({ error: reviewError.message }, { status: 500 });
  }

  try {
    return NextResponse.json(await loadBusinessReviews(admin, review.user_id));
  } catch (loadError) {
    const message = loadError instanceof Error ? loadError.message : 'Could not load the scorecard.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
