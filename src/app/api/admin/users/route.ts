import { NextRequest, NextResponse } from 'next/server';
import { getAdminUserDirectoryPage } from '@/lib/adminUserDirectory';
import { requireAdmin } from '@/lib/requireAdmin';

// GET /api/admin/users?query=&page=1&limit=200&membership=all|current|past
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '200', 10)));
  const query = (searchParams.get('query') || '').trim().toLowerCase();
  const membershipParam = searchParams.get('membership');
  const membership = membershipParam === 'current' || membershipParam === 'past'
    ? membershipParam
    : 'all';
  const setupParam = searchParams.get('setup');
  const setup = setupParam === 'missing-phone' ||
      setupParam === 'missing-primary-coach' ||
      setupParam === 'missing-ghl'
    ? setupParam
    : 'all';
  const sortParam = searchParams.get('sort');
  const sort = sortParam === 'introduced-desc' || sortParam === 'last-sign-in-desc'
    ? sortParam
    : 'name';

  try {
    const { items, total } = await getAdminUserDirectoryPage(query, page, limit, {
      membership,
      legendOnly: searchParams.get('legend') === 'only',
      setup,
      sort,
    });
    return NextResponse.json({ items, total });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load users';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
