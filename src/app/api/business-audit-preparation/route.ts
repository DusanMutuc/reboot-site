import { NextRequest, NextResponse } from 'next/server';
import { loadBusinessAuditPreparation, saveBusinessAuditPreparation, userCanEditBusinessAuditPreparation } from '@/lib/businessAuditPreparation';
import { validatePreparation, type BusinessAuditPreparationInput } from '@/lib/businessAuditPreparationShared';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failure(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code ?? '')) {
    return NextResponse.json({ error: 'Preparation saving is temporarily unavailable. Please try again later.' }, { status: 503, headers });
  }
  if (code === '40001') return NextResponse.json({ error: 'Your preparation was updated in another tab or device. Review the saved version before continuing.', conflict: true }, { status: 409, headers });
  if (code === '42501') return NextResponse.json({ error: 'This Business Review is no longer available for your account.' }, { status: 404, headers });
  if (code === '22023') return NextResponse.json({ error: 'These answers could not be saved. Check the form and try again.' }, { status: 400, headers });
  return NextResponse.json({ error: 'Could not save or load your preparation. Your local changes are preserved; please retry.' }, { status: 500, headers });
}

export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;
  const id = request.nextUrl.searchParams.get('businessReviewId');
  const businessReviewId = id === null ? undefined : Number(id);
  if (businessReviewId !== undefined && (!Number.isSafeInteger(businessReviewId) || businessReviewId <= 0)) {
    return NextResponse.json({ error: 'A valid Business Review is required.' }, { status: 400, headers });
  }
  try {
    const payload = await loadBusinessAuditPreparation(getAdminClient(), guard.user.id, businessReviewId);
    if (!payload) return NextResponse.json({ error: 'No Business Review was found for your account.' }, { status: 404, headers });
    return NextResponse.json(payload, { headers });
  } catch (error) { return failure(error); }
}

export async function PUT(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || !Number.isSafeInteger(body.businessReviewId) || body.businessReviewId <= 0
    || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0
    || typeof body.requestId !== 'string' || !uuid.test(body.requestId)
    || !['draft', 'submit'].includes(body.mode)) {
    return NextResponse.json({ error: 'Reload the preparation form before saving; your local answers are preserved.' }, { status: 400, headers });
  }
  const fieldErrors = validatePreparation(body.values, body.mode === 'submit');
  if (Object.keys(fieldErrors).length) {
    return NextResponse.json({ error: body.mode === 'submit' ? 'Complete all eight questions before submitting.' : 'Check your answers before saving.', fieldErrors }, { status: 400, headers });
  }
  try {
    const admin = getAdminClient();
    if (!await userCanEditBusinessAuditPreparation(admin, guard.user.id, body.businessReviewId)) {
      return NextResponse.json({ error: 'This Business Review was not found for your account.' }, { status: 404, headers });
    }
    const result = await saveBusinessAuditPreparation(admin, guard.user.id, body.businessReviewId,
      body.values as BusinessAuditPreparationInput, body.expectedRevision, body.requestId, body.mode === 'submit');
    return NextResponse.json(result, { headers });
  } catch (error) { return failure(error); }
}
