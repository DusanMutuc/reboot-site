import { NextRequest, NextResponse } from 'next/server';

import {
  LibraryAccessError,
  parseLibraryScope,
  resolveAccessibleLibrarySlugFromNodeId,
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
    const url = new URL(request.url);
    const scope = parseLibraryScope(url.searchParams.get('scope'));
    const idValue = url.searchParams.get('id');
    const id = Number(idValue);

    if (!Number.isFinite(id) || id <= 0) {
      throw new LibraryAccessError('Invalid id', 400);
    }

    const slug = await resolveAccessibleLibrarySlugFromNodeId(guard.user.id, scope, id);
    return NextResponse.json({ slug });
  } catch (error: unknown) {
    return handleLibraryError(error);
  }
}
