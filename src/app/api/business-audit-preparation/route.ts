import { NextRequest, NextResponse } from 'next/server';

import {
  loadBusinessAuditPreparation,
  upsertBusinessAuditPreparation,
  userCanEditBusinessAuditPreparation,
} from '@/lib/businessAuditPreparation';
import { BUSINESS_AUDIT_RATING_OPTIONS } from '@/lib/businessAuditPreparationShared';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const MAX_ANSWER_LENGTH = 10_000;
const validRatings = new Set<number>(BUSINESS_AUDIT_RATING_OPTIONS);

type SaveBody = {
  businessReviewId?: unknown;
  businessForwardWins?: unknown;
  personalForwardWins?: unknown;
  greatestBusinessChallenge?: unknown;
  greatestPersonalChallenge?: unknown;
  desiredCallOutcome?: unknown;
  topicsToDiscuss?: unknown;
  businessRating?: unknown;
  personalRating?: unknown;
};

type ValidatedAnswers = {
  businessReviewId: number;
  answers: {
    businessForwardWins: string;
    personalForwardWins: string;
    greatestBusinessChallenge: string;
    greatestPersonalChallenge: string;
    desiredCallOutcome: string;
    topicsToDiscuss: string;
    businessRating: number;
    personalRating: number;
  };
};

async function readBody(request: NextRequest): Promise<SaveBody | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === 'object' ? (body as SaveBody) : null;
  } catch {
    return null;
  }
}

function readRequiredText(
  value: unknown,
  field: string,
  errors: Record<string, string>,
): string {
  if (typeof value !== 'string' || !value.trim()) {
    errors[field] = 'This answer is required.';
    return '';
  }

  const trimmed = value.trim();
  if (trimmed.length > MAX_ANSWER_LENGTH) {
    errors[field] = `Keep this answer under ${MAX_ANSWER_LENGTH.toLocaleString()} characters.`;
  }
  return trimmed;
}

function readRating(
  value: unknown,
  field: string,
  errors: Record<string, string>,
): number {
  const parsed = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isInteger(parsed) || !validRatings.has(parsed)) {
    errors[field] = 'Choose a rating from 1–10. Ratings 5 and 7 are not available.';
    return 0;
  }
  return parsed;
}

function validateBody(body: SaveBody | null):
  | { ok: true; value: ValidatedAnswers }
  | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const businessReviewId =
    typeof body?.businessReviewId === 'number' ? body.businessReviewId : Number.NaN;

  if (!Number.isSafeInteger(businessReviewId) || businessReviewId <= 0) {
    errors.businessReviewId = 'A valid Business Review is required.';
  }

  const answers = {
    businessForwardWins: readRequiredText(
      body?.businessForwardWins,
      'businessForwardWins',
      errors,
    ),
    personalForwardWins: readRequiredText(
      body?.personalForwardWins,
      'personalForwardWins',
      errors,
    ),
    greatestBusinessChallenge: readRequiredText(
      body?.greatestBusinessChallenge,
      'greatestBusinessChallenge',
      errors,
    ),
    greatestPersonalChallenge: readRequiredText(
      body?.greatestPersonalChallenge,
      'greatestPersonalChallenge',
      errors,
    ),
    desiredCallOutcome: readRequiredText(
      body?.desiredCallOutcome,
      'desiredCallOutcome',
      errors,
    ),
    topicsToDiscuss: readRequiredText(body?.topicsToDiscuss, 'topicsToDiscuss', errors),
    businessRating: readRating(body?.businessRating, 'businessRating', errors),
    personalRating: readRating(body?.personalRating, 'personalRating', errors),
  };

  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, value: { businessReviewId, answers } };
}

export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  try {
    const payload = await loadBusinessAuditPreparation(
      getAdminClient(),
      guard.user.id,
    );

    if (!payload) {
      return NextResponse.json(
        {
          error: 'No upcoming Business Review was found for your account.',
        },
        { status: 404 },
      );
    }

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load the preparation form.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  const validation = validateBody(await readBody(request));
  if (!validation.ok) {
    return NextResponse.json(
      { error: 'Complete all required questions.', fieldErrors: validation.errors },
      { status: 400 },
    );
  }

  const admin = getAdminClient();

  try {
    const canEditAudit = await userCanEditBusinessAuditPreparation(
      admin,
      guard.user.id,
      validation.value.businessReviewId,
    );
    if (!canEditAudit) {
      return NextResponse.json(
        { error: 'This Business Review was not found for your account.' },
        { status: 404 },
      );
    }

    const answers = await upsertBusinessAuditPreparation(
      admin,
      validation.value.businessReviewId,
      validation.value.answers,
    );

    return NextResponse.json({ answers });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save the preparation form.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
