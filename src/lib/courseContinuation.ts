import type { ChildUnlockStatus, NodeSubtree } from '@/types/course';

export type CourseNodeProgress = {
  node_id: number;
  status: 'not_started' | 'in_progress' | 'completed';
  updated_at: string | null;
};

export type CourseLesson = {
  nodeId: number;
  title: string;
  href: string;
  locked: boolean;
  lockReason: string | null;
};

/** Use the server's published, entitled tree. Parent lessons containing chapters
 * are outline groups; their terminal chapters are the learning sequence. */
export function courseLessons(course: NodeSubtree, locks: Record<number, ChildUnlockStatus[]>): CourseLesson[] {
  const lessons: CourseLesson[] = [];
  const walk = (tree: NodeSubtree, path: string[], ancestorReason: string | null): void => {
    const children = [...tree.children].sort((a, b) => a.edge.position - b.edge.position);
    for (const { subtree } of children) {
      const node = subtree.node;
      if (node.state !== 'published' || !node.slug) continue;
      const status = locks[tree.node.id]?.find((row) => row.child_id === node.id);
      const reason = ancestorReason ?? (status?.locked ? friendlyLockReason(status.reason) : null);
      const childPath = [...path, node.slug];
      const before = lessons.length;
      walk(subtree, childPath, reason);
      if (lessons.length === before && (node.node_type === 'lesson' || node.node_type === 'chapter')) {
        lessons.push({ nodeId: node.id, title: node.title, locked: reason !== null, lockReason: reason,
          href: `/courses/${encodeURIComponent(course.node.slug ?? '')}/${childPath.map(encodeURIComponent).join('/')}` });
      }
    }
  };
  walk(course, [], null);
  return lessons;
}

export function friendlyLockReason(reason?: string | null): string {
  if (!reason || reason === 'waiting_for_required_previous') return 'Complete the earlier required lessons in this section to unlock this lesson.';
  return reason.includes('_') ? 'Complete the earlier required lessons to unlock this lesson.' : reason;
}

export function courseContinuation(lessons: CourseLesson[], progress: CourseNodeProgress[]) {
  const byId = new Map(progress.map((row) => [row.node_id, row]));
  const unfinished = lessons.filter((lesson) => byId.get(lesson.nodeId)?.status !== 'completed');
  const available = unfinished.filter((lesson) => !lesson.locked);
  const started = available.filter((lesson) => byId.get(lesson.nodeId)?.status === 'in_progress');
  started.sort((a, b) => (byId.get(b.nodeId)?.updated_at ?? '').localeCompare(byId.get(a.nodeId)?.updated_at ?? ''));
  return {
    complete: lessons.length > 0 && unfinished.length === 0,
    target: started[0] ?? available[0] ?? null,
    completed: lessons.length - unfinished.length,
    total: lessons.length,
  };
}

export function nextCourseLesson(lessons: CourseLesson[], progress: CourseNodeProgress[], currentId: number): CourseLesson | null {
  const completed = new Set(progress.filter((row) => row.status === 'completed').map((row) => row.node_id));
  const index = lessons.findIndex((lesson) => lesson.nodeId === currentId);
  const remaining = [...lessons.slice(index + 1), ...lessons.slice(0, Math.max(0, index))];
  return remaining.find((lesson) => !lesson.locked && !completed.has(lesson.nodeId)) ?? null;
}

export function progressByNode(progress: CourseNodeProgress[], course?: NodeSubtree): Record<number, CourseNodeProgress['status']> {
  const statuses: Record<number, CourseNodeProgress['status']> = Object.fromEntries(progress.map((row) => [row.node_id, row.status]));
  const visit = (tree: NodeSubtree) => {
    tree.children.forEach(({ subtree }) => visit(subtree));
    if (tree.children.length && statuses[tree.node.id] !== 'completed') {
      const childStatuses = tree.children.map(({ subtree }) => statuses[subtree.node.id]);
      if (childStatuses.every((status) => status === 'completed')) statuses[tree.node.id] = 'completed';
      else if (childStatuses.some((status) => status === 'completed' || status === 'in_progress')) statuses[tree.node.id] = 'in_progress';
    }
  };
  if (course) visit(course);
  return statuses;
}

/** Translate database reason codes using the titles of visible prerequisites. */
export function explainCourseLocks(course: NodeSubtree, locks: Record<number, ChildUnlockStatus[]>, progress: CourseNodeProgress[]) {
  const statuses = progressByNode(progress, course);
  const result: Record<number, ChildUnlockStatus[]> = {};
  const visit = (tree: NodeSubtree) => {
    const children = [...tree.children].sort((a, b) => a.edge.position - b.edge.position);
    result[tree.node.id] = (locks[tree.node.id] ?? []).map((row) => {
      if (!row.locked) return row;
      const missing = children.filter(({ edge, subtree }) => edge.position < row.child_position
        && edge.is_required !== false && statuses[subtree.node.id] !== 'completed');
      return { ...row, reason: missing.length
        ? `Complete ${missing.slice(0, 3).map(({ subtree }) => `“${subtree.node.title}”`).join(', ')}${missing.length > 3 ? ' and the other earlier required lessons' : ''} to unlock this lesson.`
        : friendlyLockReason(row.reason) };
    });
    children.forEach(({ subtree }) => visit(subtree));
  };
  visit(course);
  return result;
}
