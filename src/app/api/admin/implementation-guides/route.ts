import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { implementationActorClient, implementationError, invalidImplementationRequest, isImplementationAdmin } from '@/lib/implementationApi';
import { loadImplementationGuides, loadImplementationGuidesAdmin } from '@/lib/implementationGuidesServer';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;
  if (!isImplementationAdmin(guard.roleCodes)) return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
  try { return NextResponse.json(await loadImplementationGuidesAdmin(getAdminClient())); }
  catch (error) { return implementationError(error); }
}

export async function PUT(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;
  if (!isImplementationAdmin(guard.roleCodes)) return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
  try {
    const body = await request.json().catch(() => invalidImplementationRequest('A JSON request is required.'));
    if (!body || !['foundation', 'legends'].includes(body.audience) || typeof body.systemKey !== 'string'
      || !Number.isInteger(body.expectedRevision ?? 0) || (body.expectedRevision ?? 0) < 0 || !Array.isArray(body.steps)) {
      invalidImplementationRequest('A valid system, expected revision, and steps are required.');
    }
    const { error } = await implementationActorClient(request, guard).rpc('save_system_implementation_guide', {
      _audience: body.audience, _system_key: body.systemKey, _expected_revision: body.expectedRevision ?? 0, _steps: body.steps,
    });
    if (error) throw error;
    const guides = await loadImplementationGuides(getAdminClient());
    return NextResponse.json({ guide: guides.get(`${body.audience}:${body.systemKey}`) });
  } catch (error) { return implementationError(error); }
}
