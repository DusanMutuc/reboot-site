import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { RequiredTraining, TrainingPart } from '@/components/home/types';
import type { CoachingCycle } from '@/lib/coachingCycles';
import type {
  TrainingAssignmentSummary,
  TrainingCourseOption,
} from '@/types/trainingAssignments';

type AssignmentRow = {
  id: number;
  user_id: string;
  coaching_note_id: number;
  course_node_id: number;
  assigned_at: string;
  context_label: string | null;
  due_at: string | null;
};

type CourseRow = {
  id: number;
  title: string | null;
  slug: string | null;
  description: string | null;
  hero_image?: string | null;
};

type CourseNodeRow = CourseRow & {
  node_type: string;
  state: string;
};

type NodeLinkRow = {
  parent_id: number;
  child_id: number;
  position: number;
};

type ContentBlockRow = {
  node_id: number;
  resource_id: number | null;
};

type ResourceDurationRow = {
  id: number;
  duration: number | null;
};

type ProgressRow = {
  node_id: number;
  status: 'not_started' | 'in_progress' | 'completed';
};

type CourseProgressRow = {
  progress: number | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function asCourseOption(
  row: CourseRow,
  progressPercent = 0,
): TrainingCourseOption | null {
  const title = row.title?.trim();
  const slug = row.slug?.trim();
  if (!title || !slug) return null;

  return {
    id: Number(row.id),
    title,
    slug,
    description: row.description?.trim() || null,
    progressPercent,
  };
}

async function loadCourseProgressPercent(
  client: SupabaseClient,
  userId: string,
  courseId: number,
): Promise<number> {
  const { data, error } = await client.rpc('get_user_course_progress', {
    _user_id: userId,
    _course_id: courseId,
  });

  if (error) {
    console.error('[training-assignments] course progress', { courseId, userId, error });
    return 0;
  }

  const progress = one(data as CourseProgressRow | CourseProgressRow[] | null)?.progress ?? 0;
  return Math.max(0, Math.min(100, Math.round(progress * 100)));
}

function resolveHeroUrl(client: SupabaseClient, value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return client.storage.from('course-heroes').getPublicUrl(trimmed).data.publicUrl ?? null;
}

export async function loadPublishedTrainingCourses(
  client: SupabaseClient,
  userId: string,
): Promise<TrainingCourseOption[]> {
  const { data, error } = await client
    .from('content_nodes')
    .select('id, title, slug, description')
    .eq('node_type', 'course')
    .eq('state', 'published')
    .order('title', { ascending: true });

  if (error) {
    throw new Error(`Failed to load published training: ${error.message}`);
  }

  const courses = (data ?? []) as CourseRow[];
  const progress = await Promise.all(
    courses.map((course) => loadCourseProgressPercent(client, userId, Number(course.id))),
  );

  return courses
    .map((course, index) => asCourseOption(course, progress[index]))
    .filter((course): course is TrainingCourseOption => course !== null);
}

export async function loadActiveTrainingAssignment(
  client: SupabaseClient,
  userId: string,
  coachingNoteId: number,
): Promise<TrainingAssignmentSummary | null> {
  const { data, error } = await client
    .from('user_training_assignments')
    .select('id, user_id, coaching_note_id, course_node_id, assigned_at, context_label, due_at')
    .eq('user_id', userId)
    .eq('coaching_note_id', coachingNoteId)
    .is('ended_at', null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load assigned training: ${error.message}`);
  }
  if (!data) return null;

  const assignment = data as AssignmentRow;
  const { data: courseData, error: courseError } = await client
    .from('content_nodes')
    .select('id, title, slug, description')
    .eq('id', assignment.course_node_id)
    .eq('node_type', 'course')
    .maybeSingle();

  if (courseError) {
    throw new Error(`Failed to load assigned course: ${courseError.message}`);
  }
  if (!courseData) return null;

  const progressPercent = await loadCourseProgressPercent(
    client,
    userId,
    Number(assignment.course_node_id),
  );
  const course = asCourseOption(courseData as CourseRow, progressPercent);
  if (!course) return null;

  return {
    id: Number(assignment.id),
    userId: assignment.user_id,
    coachingNoteId: Number(assignment.coaching_note_id),
    course,
    assignedAt: assignment.assigned_at,
    contextLabel: assignment.context_label?.trim() || null,
    dueAt: assignment.due_at,
  };
}

async function loadCourseTree(
  client: SupabaseClient,
  courseId: number,
): Promise<{ nodes: Map<number, CourseNodeRow>; children: Map<number, NodeLinkRow[]> }> {
  const links: NodeLinkRow[] = [];
  const seen = new Set<number>([courseId]);
  let frontier = [courseId];

  while (frontier.length > 0) {
    const { data, error } = await client
      .from('node_children')
      .select('parent_id, child_id, position')
      .in('parent_id', frontier);

    if (error) {
      throw new Error(`Failed to load assigned course structure: ${error.message}`);
    }

    const next: number[] = [];
    for (const link of (data ?? []) as NodeLinkRow[]) {
      links.push(link);
      if (seen.has(link.child_id)) continue;
      seen.add(link.child_id);
      next.push(link.child_id);
    }
    frontier = next;
  }

  const { data: nodeData, error: nodeError } = await client
    .from('content_nodes')
    .select('id, title, slug, description, hero_image, node_type, state')
    .in('id', Array.from(seen));

  if (nodeError) {
    throw new Error(`Failed to load assigned course parts: ${nodeError.message}`);
  }

  const nodes = new Map(
    ((nodeData ?? []) as CourseNodeRow[]).map((node) => [Number(node.id), node]),
  );
  const children = new Map<number, NodeLinkRow[]>();

  for (const link of links) {
    const current = children.get(link.parent_id) ?? [];
    current.push(link);
    children.set(link.parent_id, current);
  }
  children.forEach((rows) => rows.sort((left, right) => left.position - right.position));

  return { nodes, children };
}

function collectOrderedPartNodes(
  courseId: number,
  nodes: Map<number, CourseNodeRow>,
  children: Map<number, NodeLinkRow[]>,
): CourseNodeRow[] {
  const parts: CourseNodeRow[] = [];
  const visiting = new Set<number>();

  const visit = (nodeId: number) => {
    if (visiting.has(nodeId)) return;
    visiting.add(nodeId);

    const node = nodes.get(nodeId);
    if (!node || node.state !== 'published') {
      visiting.delete(nodeId);
      return;
    }

    const publishedChildren = (children.get(nodeId) ?? []).filter(
      (link) => nodes.get(link.child_id)?.state === 'published',
    );
    for (const link of publishedChildren) visit(link.child_id);

    const isContentNode = node.node_type === 'lesson' || node.node_type === 'chapter';
    if (isContentNode && publishedChildren.length === 0) parts.push(node);
    visiting.delete(nodeId);
  };

  visit(courseId);
  const course = nodes.get(courseId);
  return parts.length > 0 ? parts : course ? [course] : [];
}

async function loadPartDurations(
  client: SupabaseClient,
  partIds: number[],
): Promise<Map<number, number>> {
  if (partIds.length === 0) return new Map();

  const { data: blockData, error: blockError } = await client
    .from('content_blocks')
    .select('node_id, resource_id')
    .in('node_id', partIds);

  if (blockError) {
    throw new Error(`Failed to load assigned training media: ${blockError.message}`);
  }

  const blocks = (blockData ?? []) as ContentBlockRow[];
  const resourceIds = Array.from(
    new Set(
      blocks
        .map((block) => block.resource_id)
        .filter((resourceId): resourceId is number => typeof resourceId === 'number'),
    ),
  );
  if (resourceIds.length === 0) return new Map();

  const { data: resourceData, error: resourceError } = await client
    .from('resources')
    .select('id, duration')
    .in('id', resourceIds);

  if (resourceError) {
    throw new Error(`Failed to load assigned training durations: ${resourceError.message}`);
  }

  const durationByResource = new Map(
    ((resourceData ?? []) as ResourceDurationRow[]).map((resource) => [
      Number(resource.id),
      Math.max(0, resource.duration ?? 0),
    ]),
  );
  const secondsByPart = new Map<number, number>();
  for (const block of blocks) {
    if (!block.resource_id) continue;
    secondsByPart.set(
      block.node_id,
      (secondsByPart.get(block.node_id) ?? 0) + (durationByResource.get(block.resource_id) ?? 0),
    );
  }

  return new Map(
    Array.from(secondsByPart.entries()).map(([nodeId, seconds]) => [
      nodeId,
      seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : 0,
    ]),
  );
}

export async function loadRequiredTraining(
  client: SupabaseClient,
  userId: string,
  activeCycle: CoachingCycle | null,
): Promise<RequiredTraining | null> {
  if (!activeCycle) return null;

  try {
    const assignment = await loadActiveTrainingAssignment(client, userId, activeCycle.noteId);
    if (!assignment) return null;

    const { nodes, children } = await loadCourseTree(client, assignment.course.id);
    const course = nodes.get(assignment.course.id);
    if (!course || course.state !== 'published') return null;

    const partNodes = collectOrderedPartNodes(assignment.course.id, nodes, children);
    const partIds = partNodes.map((part) => Number(part.id));
    const [minutesByPart, progressResult] = await Promise.all([
      loadPartDurations(client, partIds),
      partIds.length > 0
        ? client
            .from('user_node_progress')
            .select('node_id, status')
            .eq('user_id', userId)
            .in('node_id', partIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (progressResult.error) {
      throw new Error(`Failed to load assigned training progress: ${progressResult.error.message}`);
    }

    const statusByNode = new Map(
      ((progressResult.data ?? []) as ProgressRow[]).map((progress) => [
        Number(progress.node_id),
        progress.status,
      ]),
    );
    const parts: TrainingPart[] = partNodes.map((part) => ({
      title: part.title?.trim() || 'Untitled part',
      minutes: minutesByPart.get(Number(part.id)) ?? 0,
      description: part.description?.trim() || '',
      done: statusByNode.get(Number(part.id)) === 'completed',
    }));

    return {
      title: assignment.course.title,
      href: `/courses/${encodeURIComponent(assignment.course.slug)}`,
      heroUrl: resolveHeroUrl(client, course.hero_image),
      parts,
      contextLabel: assignment.contextLabel,
    };
  } catch (error) {
    console.error('[momentum-home] required training', error);
    return null;
  }
}
