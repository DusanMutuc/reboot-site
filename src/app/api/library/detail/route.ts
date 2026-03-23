import { NextRequest, NextResponse } from 'next/server';

import {
  fetchLibraryDetailDataForScope,
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
    const url = new URL(request.url);
    const scope = parseLibraryScope(url.searchParams.get('scope'));
    const slug = url.searchParams.get('slug');
    const idValue = url.searchParams.get('id');
    const id = idValue ? Number(idValue) : null;

    if (!slug && id == null) {
      throw new LibraryAccessError('Missing slug or id', 400);
    }

    if (idValue && (!Number.isFinite(id) || (id as number) <= 0)) {
      throw new LibraryAccessError('Invalid id', 400);
    }

    const data = await fetchLibraryDetailDataForScope(
      guard.user.id,
      scope,
      id != null ? { id } : { slug: slug ?? undefined },
    );
    return NextResponse.json(data);
  } catch (error: unknown) {
    return handleLibraryError(error);
  }
}
