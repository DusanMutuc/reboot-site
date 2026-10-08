import { NextRequest, NextResponse } from 'next/server';
import { invalidateAdminUserDirectory } from '@/lib/adminUserDirectory';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/requireAdmin';
import { savePartnership, UUID_PATTERN } from '@/lib/partnershipMutation';

type RouteParams = Promise<{ partnershipId: string }>;
function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unexpected error';
}

export async function PATCH(request: NextRequest, segmentData: { params: RouteParams }) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.res;
    const { partnershipId } = await segmentData.params;
    const changes: unknown = await request.json().catch(() => null);
    const result = await savePartnership(getAdminClient(), partnershipId, changes);
    if (!result.ok) return result.response;
    invalidateAdminUserDirectory();
    return NextResponse.json(result.data);
  } catch (err: unknown) {
    console.error('partnerships PATCH unexpected error', err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  segmentData: { params: RouteParams },
) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.res;
    const supabaseAdmin = getAdminClient();

    const params = await segmentData.params;
    const id = params.partnershipId;
    if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid partnership ID.' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('partnerships')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('partnerships DELETE error', error);
      return NextResponse.json(
        { error: error.code === '42501' ? error.message : 'Failed to delete partnership' },
        { status: error.code === '42501' ? 409 : 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Partnership not found' },
        { status: 404 },
      );
    }

    invalidateAdminUserDirectory();
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('partnerships DELETE unexpected error', err);
    return NextResponse.json(
      { error: getErrorMessage(err) },
      { status: 500 },
    );
  }
}
