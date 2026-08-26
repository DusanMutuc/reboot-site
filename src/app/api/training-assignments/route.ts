import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';
import {
  loadActiveTrainingAssignment,
  loadPublishedTrainingCourses,
} from '@/lib/trainingAssignments';

export const dynamic = 'force-dynamic';

type AssignmentRequestBody = {
  userId?: string;
  coachingNoteId?: number;
  courseNodeId?: number;
  contextLabel?: string | null;
  dueAt?: string | null;
};

class AssignmentRouteError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AssignmentRouteError';
    this.status = status;
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AssignmentRouteError(`${label} is required.`);
  }
  return value.trim();
}

function requiredPositiveInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AssignmentRouteError(`${label} must be a positive integer.`);
  }
  return parsed;
}

function optionalContextLabel(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') {
    throw new AssignmentRouteError('Context label must be text.');
  }

  const trimmed = value.trim();
  if (trimmed.length > 240) {
    throw new AssignmentRouteError('Context label must be 240 characters or fewer.');
  }
  return trimmed || null;
}

function optionalDueAt(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new AssignmentRouteError('Due date must be a valid date.');
  }
  return new Date(value).toISOString();
}

async function assertCanManageAssignment(
  actorId: string,
  actorRoleCodes: string[],
  userId: string,
  coachingNoteId: number,
) {
  const admin = getAdminClient();
  const { data: note, error: noteError } = await admin
    .from('coaching_notes')
    .select('id, user_id')
    .eq('id', coachingNoteId)
    .eq('user_id', userId)
    .maybeSingle();

  if (noteError) {
    throw new AssignmentRouteError(`Could not validate the coaching cycle: ${noteError.message}`, 500);
  }
  if (!note) {
    throw new AssignmentRouteError('Coaching cycle not found for this member.', 404);
  }

  if (actorRoleCodes.includes('admin')) return;
  if (!actorRoleCodes.includes('coach')) {
    throw new AssignmentRouteError('Coach or admin access is required.', 403);
  }

  const { data: coachAssignment, error: coachError } = await admin
    .from('user_coaches')
    .select('id')
    .eq('user_id', userId)
    .eq('coach_id', actorId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (coachError) {
    throw new AssignmentRouteError(`Could not validate the coach roster: ${coachError.message}`, 500);
  }
  if (!coachAssignment) {
    throw new AssignmentRouteError('This member is not on your active roster.', 403);
  }
}

function handleRouteError(error: unknown) {
  if (error instanceof AssignmentRouteError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : 'Training assignment failed.';
  console.error('[training-assignments]', error);
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  try {
    const userId = requiredString(request.nextUrl.searchParams.get('user_id'), 'Member');
    const coachingNoteId = requiredPositiveInteger(
      request.nextUrl.searchParams.get('coaching_note_id'),
      'Coaching note',
    );
    await assertCanManageAssignment(guard.user.id, guard.roleCodes, userId, coachingNoteId);

    const admin = getAdminClient();
    const [assignment, courses] = await Promise.all([
      loadActiveTrainingAssignment(admin, userId, coachingNoteId),
      loadPublishedTrainingCourses(admin, userId),
    ]);

    return NextResponse.json({ assignment, courses });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  try {
    const body = (await request.json().catch(() => null)) as AssignmentRequestBody | null;
    const userId = requiredString(body?.userId, 'Member');
    const coachingNoteId = requiredPositiveInteger(body?.coachingNoteId, 'Coaching note');
    const courseNodeId = requiredPositiveInteger(body?.courseNodeId, 'Course');
    const contextLabel = optionalContextLabel(body?.contextLabel);
    const dueAt = optionalDueAt(body?.dueAt);

    await assertCanManageAssignment(guard.user.id, guard.roleCodes, userId, coachingNoteId);

    const admin = getAdminClient();
    const { error } = await admin.rpc('set_user_training_assignment', {
      p_user_id: userId,
      p_coaching_note_id: coachingNoteId,
      p_course_node_id: courseNodeId,
      p_assigned_by: guard.user.id,
      p_context_label: contextLabel,
      p_due_at: dueAt,
    });

    if (error) {
      throw new AssignmentRouteError(`Could not assign training: ${error.message}`, 400);
    }

    const assignment = await loadActiveTrainingAssignment(admin, userId, coachingNoteId);
    return NextResponse.json({ assignment });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  try {
    const userId = requiredString(request.nextUrl.searchParams.get('user_id'), 'Member');
    const coachingNoteId = requiredPositiveInteger(
      request.nextUrl.searchParams.get('coaching_note_id'),
      'Coaching note',
    );
    await assertCanManageAssignment(guard.user.id, guard.roleCodes, userId, coachingNoteId);

    const admin = getAdminClient();
    const { error } = await admin.rpc('end_user_training_assignment', {
      p_user_id: userId,
      p_coaching_note_id: coachingNoteId,
      p_ended_by: guard.user.id,
    });

    if (error) {
      throw new AssignmentRouteError(`Could not remove assigned training: ${error.message}`, 400);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
