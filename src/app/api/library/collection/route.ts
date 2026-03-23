import { NextRequest, NextResponse } from 'next/server';

import {
  fetchLibraryCollectionItemsForScope,
  LibraryAccessError,
  parseLibraryScope,
} from '@/lib/libraryAccess';
import { requireUser } from '@/lib/requireUser';

function handleLibraryError(error: unknown) {
  if (error instanceof LibraryAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const scope = parseLibraryScope(new URL(request.url).searchParams.get('scope'));
    const items = await fetchLibraryCollectionItemsForScope(guard.user.id, scope);
    return NextResponse.json({ items });
  } catch (error: unknown) {
    return handleLibraryError(error);
  }
}
