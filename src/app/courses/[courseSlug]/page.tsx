// src/app/courses/[courseSlug]/page.tsx
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ChildUnlockStatus, NodeSubtree } from '@/types/course';

// Next 15 is giving us params as a Promise, so we match that
export default async function CourseRootPage({
  params,
}: {
  params: Promise<{ courseSlug: string }>;
}) {
  const { courseSlug } = await params;

  // Build absolute base URL from incoming request
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? (process.env.NODE_ENV === 'development' ? 'http' : 'https');

  if (!host) {
    throw new Error('Unable to resolve host for server fetch.');
  }
  const baseUrl = `${proto}://${host}`;

  // Carry cookies/session through to the API
  const res = await fetch(`${baseUrl}/api/courses/${courseSlug}`, {
    cache: 'no-store',
    headers: {
      cookie: h.get('cookie') ?? '',
    },
  });

  if (!res.ok) {
    throw new Error('Failed to load course');
  }

  const data = (await res.json()) as {
    course: NodeSubtree;
    unlockStatuses: Record<number, ChildUnlockStatus[]>;
  };

  const lockMap = toNestedLockMap(data.unlockStatuses);
  const lastSlug = findLastUnlockedContentSlug(data.course, lockMap);

  if (lastSlug) {
    redirect(`/courses/${courseSlug}/${lastSlug}`);
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>{data.course.node.title ?? 'Course'}</h1>
      <p>No content is unlocked yet. Please complete the prerequisites.</p>
    </div>
  );
}

/* ----------------- helpers (same logic as in your client) ----------------- */

function toNestedLockMap(
  source: Record<number, ChildUnlockStatus[]>,
): Record<number, Record<number, ChildUnlockStatus>> {
  const nested: Record<number, Record<number, ChildUnlockStatus>> = {};
  for (const [parentIdString, rows] of Object.entries(source)) {
    const parentId = Number(parentIdString);
    const map: Record<number, ChildUnlockStatus> = {};
    for (const row of rows) {
      map[row.child_id] = row;
    }
    nested[parentId] = map;
  }
  return nested;
}

function isContentNodeType(nodeType: string) {
  return nodeType === 'lesson' || nodeType === 'chapter';
}

/**
 * Find the LAST unlocked content slug in tree order.
 */
function findLastUnlockedContentSlug(
  course: NodeSubtree,
  lockMap: Record<number, Record<number, ChildUnlockStatus>>,
): string | null {
  let last: string | null = null;

  const walk = (parent: NodeSubtree) => {
    const parentId = parent.node.id;
    const locks = lockMap[parentId] ?? {};

    for (const child of parent.children) {
      const subtree = child.subtree;
      const childId = subtree.node.id;
      const locked = locks[childId]?.locked ?? false;
      if (locked) continue;

      if (subtree.children.length > 0) {
        walk(subtree);
      }

      if (isContentNodeType(subtree.node.node_type) && subtree.node.slug) {
        last = subtree.node.slug;
      }
    }
  };

  walk(course);
  return last;
}
