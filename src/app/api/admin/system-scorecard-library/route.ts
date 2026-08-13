import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/requireAdmin';
import {
  cloneSystemScorecardVersion,
  discardSystemScorecardDraft,
  loadSystemScorecardLibraryAdmin,
  previewSystemScorecardPublish,
  publishSystemScorecardVersion,
  saveSystemScorecardDraft,
  SystemScorecardLibraryError,
  updateSystemScorecardLibraryMapping,
} from '@/lib/systemScorecardLibrary';
import type {
  ScorecardDraftCategoryInput,
  ScorecardVersionReviewResolution,
} from '@/types/systemScorecardLibrary';

export const dynamic = 'force-dynamic';

function handleError(error: unknown) {
  if (error instanceof SystemScorecardLibraryError) {
    return NextResponse.json(
      { error: error.message, details: error.details ?? null },
      { status: error.status },
    );
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  return NextResponse.json({ error: message }, { status: 500 });
}

function readRequiredString(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new SystemScorecardLibraryError(message, 400);
  }
  return value.trim();
}

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  try {
    return NextResponse.json(await loadSystemScorecardLibraryAdmin());
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  try {
    const body = (await request.json().catch(() => null)) as {
      systemId?: unknown;
      libraryItemId?: unknown;
    } | null;
    const systemId =
      typeof body?.systemId === 'number' && Number.isSafeInteger(body.systemId)
        ? body.systemId
        : null;
    const libraryItemId =
      body?.libraryItemId === null
        ? null
        : typeof body?.libraryItemId === 'number' && Number.isSafeInteger(body.libraryItemId)
          ? body.libraryItemId
          : undefined;

    if (!systemId || systemId <= 0) {
      throw new SystemScorecardLibraryError('A valid scorecard system is required.', 400);
    }
    if (libraryItemId === undefined || (libraryItemId != null && libraryItemId <= 0)) {
      throw new SystemScorecardLibraryError('A valid library item is required.', 400);
    }

    return NextResponse.json(
      await updateSystemScorecardLibraryMapping(systemId, libraryItemId),
    );
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const action = readRequiredString(body?.action, 'A scorecard action is required.');

    if (action === 'clone') {
      const sourceTemplateKey = readRequiredString(
        body?.sourceTemplateKey,
        'A source scorecard version is required.',
      );
      return NextResponse.json({
        templateKey: await cloneSystemScorecardVersion(sourceTemplateKey, guard.user.id),
      });
    }

    if (action === 'save-draft') {
      const templateKey = readRequiredString(
        body?.templateKey,
        'A scorecard draft is required.',
      );
      const name = readRequiredString(body?.name, 'A scorecard name is required.');
      if (!Array.isArray(body?.categories)) {
        throw new SystemScorecardLibraryError('Scorecard categories are required.', 400);
      }
      return NextResponse.json({
        templateKey: await saveSystemScorecardDraft(
          templateKey,
          name,
          body.categories as ScorecardDraftCategoryInput[],
          guard.user.id,
        ),
      });
    }

    if (action === 'preview') {
      const templateKey = readRequiredString(
        body?.templateKey,
        'A scorecard version is required.',
      );
      return NextResponse.json(await previewSystemScorecardPublish(templateKey));
    }

    if (action === 'publish') {
      const templateKey = readRequiredString(
        body?.templateKey,
        'A scorecard version is required.',
      );
      const resolutions = Array.isArray(body?.resolutions)
        ? (body.resolutions as ScorecardVersionReviewResolution[])
        : [];
      return NextResponse.json(
        await publishSystemScorecardVersion(templateKey, resolutions, guard.user.id),
      );
    }

    throw new SystemScorecardLibraryError('Unknown scorecard action.', 400);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  try {
    const templateKey = readRequiredString(
      request.nextUrl.searchParams.get('templateKey'),
      'A scorecard draft is required.',
    );
    await discardSystemScorecardDraft(templateKey, guard.user.id);
    return NextResponse.json({ templateKey });
  } catch (error) {
    return handleError(error);
  }
}
