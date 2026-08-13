import { NextRequest, NextResponse } from 'next/server';

import {
  canManageBusinessReviews,
  parsePositiveInteger,
  type BusinessReviewSystemPriority,
  type SystemScorecardStatus,
} from '@/lib/businessReviews';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ reviewId?: string | string[] }>;
};

type SavePriorityBody = {
  systemId?: unknown;
  selected?: unknown;
};

type PriorityRow = {
  position: number;
  action_step_id: number;
  starting_status: SystemScorecardStatus;
  selected_at: string;
  selected_by: string | null;
};

async function readReviewId(context: RouteContext): Promise<number | null> {
  const params = await context.params;
  const raw = Array.isArray(params.reviewId) ? params.reviewId[0] : params.reviewId;
  return typeof raw === 'string' ? parsePositiveInteger(raw) : null;
}

async function readBody(request: NextRequest): Promise<SavePriorityBody | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === 'object' ? (body as SavePriorityBody) : null;
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
  const selected = typeof body?.selected === 'boolean' ? body.selected : null;

  if (!reviewId) {
    return NextResponse.json({ error: 'A valid business review id is required.' }, { status: 400 });
  }

  if (!systemId || systemId <= 0) {
    return NextResponse.json({ error: 'A valid scorecard system is required.' }, { status: 400 });
  }

  if (selected === null) {
    return NextResponse.json({ error: 'A priority selection state is required.' }, { status: 400 });
  }

  const admin = getAdminClient();

  try {
    const { data: review, error: reviewError } = await admin
      .from('business_reviews')
      .select('id, user_id')
      .eq('id', reviewId)
      .maybeSingle();

    if (reviewError) {
      return NextResponse.json({ error: reviewError.message }, { status: 400 });
    }

    if (!review) {
      return NextResponse.json({ error: 'Business review not found.' }, { status: 404 });
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

    const { error: saveError } = await guard.supabase.rpc(
      'set_business_review_system_priority',
      {
        _business_review_id: reviewId,
        _selected: selected,
        _system_id: systemId,
      },
    );

    if (saveError) {
      const missingFunction =
        saveError.code === 'PGRST202' || saveError.message.includes('schema cache');

      return NextResponse.json(
        {
          error: missingFunction
            ? 'System priorities are not installed in the database yet.'
            : saveError.message,
        },
        { status: missingFunction ? 503 : 400 },
      );
    }

    const { data: priorityRow, error: priorityError } = await admin
      .from('business_review_system_priorities')
      .select('position, action_step_id, starting_status, selected_at, selected_by')
      .eq('business_review_id', reviewId)
      .eq('system_id', systemId)
      .maybeSingle();

    if (priorityError) {
      return NextResponse.json({ error: priorityError.message }, { status: 400 });
    }

    const row = priorityRow as PriorityRow | null;

    if (row) {
      const { data: system, error: systemError } = await admin
        .from('system_scorecard_systems')
        .select('library_item_id')
        .eq('id', systemId)
        .maybeSingle();

      if (systemError) {
        return NextResponse.json({ error: systemError.message }, { status: 400 });
      }

      const { error: actionStepError } = await admin
        .from('coaching_note_action_steps')
        .update({
          library_item_id: system?.library_item_id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', Number(row.action_step_id));

      if (actionStepError) {
        return NextResponse.json({ error: actionStepError.message }, { status: 400 });
      }
    }

    const priority: BusinessReviewSystemPriority | null = row
      ? {
          position: Number(row.position),
          actionStepId: Number(row.action_step_id),
          startingStatus: row.starting_status,
          selectedAt: row.selected_at,
          selectedBy: row.selected_by,
        }
      : null;

    return NextResponse.json({ systemId, priority });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to update system priority.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
