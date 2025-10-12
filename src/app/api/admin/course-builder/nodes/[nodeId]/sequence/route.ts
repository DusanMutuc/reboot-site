import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/requireAdmin';
import {
  CourseBuilderError,
  adminClient,
  fetchNodeSubtree,
  handleCourseBuilderError,
} from '@/lib/courseBuilder';

function parseNodeId(value: string) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) {
    throw new CourseBuilderError('Invalid node id', 400, { value });
  }
  return id;
}

function parseEnabledFlag(body: unknown) {
  if (!body || typeof body !== 'object') {
    throw new CourseBuilderError('Missing toggle payload', 400);
  }

  const candidate = body as Record<string, unknown>;

  if (typeof candidate.enabled === 'boolean') {
    return candidate.enabled;
  }

  if (typeof candidate.on === 'boolean') {
    return candidate.on;
  }

  if (typeof candidate.value === 'boolean') {
    return candidate.value;
  }

  throw new CourseBuilderError('enabled flag must be provided as a boolean', 400);
}

function shouldRetrySequenceCall(error: { message?: string } | null | undefined) {
  if (!error?.message) {
    return false;
  }

  const normalized = error.message.toLowerCase();
  return (
    normalized.includes('_root_id') ||
    normalized.includes('_on') ||
    normalized.includes('named argument') ||
    normalized.includes('function enforce_strict_sequence')
  );
}

async function enforceSequence(nodeId: number, enabled: boolean) {
  const attempts: Array<Record<string, unknown>> = [
    { _root_id: nodeId, _on: enabled },
    { root_id: nodeId, on: enabled },
    { root_id: nodeId, _on: enabled },
    { _root_id: nodeId, on: enabled },
  ];

  let lastError: { message?: string } | null = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const args = attempts[index];
    const { error } = await adminClient.rpc('enforce_strict_sequence', args);
    if (!error) {
      return;
    }

    lastError = error;

    if (!shouldRetrySequenceCall(error)) {
      break;
    }
  }

  throw new CourseBuilderError('Failed to update sequential unlock', 500, {
    details: lastError?.message ?? null,
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ nodeId: string }> },
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const { nodeId: nodeIdParam } = await context.params;
    const nodeId = parseNodeId(nodeIdParam);
    const body = await request.json().catch(() => ({}));
    const enabled = parseEnabledFlag(body);

    await enforceSequence(nodeId, enabled);

    const subtree = await fetchNodeSubtree(nodeId);
    return NextResponse.json({ subtree });
  } catch (error: unknown) {
    return handleCourseBuilderError(error);
  }
}
