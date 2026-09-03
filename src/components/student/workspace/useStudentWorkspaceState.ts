'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { fetchStudentProgressCourses } from '@/lib/studentOverview';
import type {
  CoachProgressCourse,
  StudentOption,
  StudentWorkspaceMode,
  StudentWorkspaceTab,
  WorkspaceQueryPatch,
} from './types';

type CoachRosterRow = {
  id: string;
  full_name: string;
  email?: string | null;
  is_legend?: boolean | null;
};

type AdminListUserRow = {
  id: string;
  name?: string | null;
  email?: string | null;
  is_legend?: boolean | null;
};

type CoachWorkspaceStudentsResponse = {
  items?: CoachRosterRow[];
  resolved_user_id?: string | null;
  error?: string;
};

type LoadedStudents = {
  items: StudentOption[];
  resolvedStudentId: string | null;
};

type UseStudentWorkspaceStateArgs = {
  mode: StudentWorkspaceMode;
  tab: StudentWorkspaceTab;
  selectedStudentId: string | null;
  selectedCourseId: number | null;
  setQuery: (patch: WorkspaceQueryPatch) => void;
};

async function loadAdminStudents(requestedId: string | null): Promise<LoadedStudents> {
  const response = await fetch('/api/admin/list-users?membership=coaching', {
    cache: 'no-store',
  });
  const body = (await response.json()) as { items?: AdminListUserRow[]; error?: string };

  if (!response.ok) {
    throw new Error(body.error || 'Failed to load students.');
  }

  const items = (body.items ?? [])
    .map((item) => ({
      id: item.id,
      full_name: item.name?.trim() || item.email?.trim() || 'Unnamed student',
      email: item.email?.trim() || null,
      is_legend: !!item.is_legend,
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return {
    items,
    resolvedStudentId: items.some((item) => item.id === requestedId) ? requestedId : null,
  };
}

async function loadCoachStudents(requestedId: string | null): Promise<LoadedStudents> {
  const params = new URLSearchParams();
  if (requestedId) params.set('requestedId', requestedId);
  const query = params.toString();
  const response = await fetch(
    query ? `/api/coach/workspace-students?${query}` : '/api/coach/workspace-students',
    { cache: 'no-store' },
  );
  const body = (await response.json()) as CoachWorkspaceStudentsResponse;

  if (!response.ok) {
    throw new Error(body.error || 'Failed to load students.');
  }

  const items = (body.items ?? [])
    .map((row) => ({
      id: row.id,
      full_name: row.full_name || row.email || 'Unnamed student',
      email: row.email ?? null,
      is_legend: !!row.is_legend,
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return {
    items,
    resolvedStudentId: body.resolved_user_id ?? null,
  };
}

export function useStudentWorkspaceState({
  mode,
  tab,
  selectedStudentId,
  selectedCourseId,
  setQuery,
}: UseStudentWorkspaceStateArgs) {
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState<string | null>(null);

  const [coachProgressCourses, setCoachProgressCourses] = useState<CoachProgressCourse[]>([]);
  const [coachProgressLoading, setCoachProgressLoading] = useState(false);
  const [coachProgressError, setCoachProgressError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        setStudentsLoading(true);
        setStudentsError(null);
        const result =
          mode === 'admin'
            ? await loadAdminStudents(selectedStudentId)
            : await loadCoachStudents(selectedStudentId);
        if (!active) return;

        const { items, resolvedStudentId } = result;
        setStudents(items);

        // A direct link to the Business Review tab should open as a neutral
        // landing page so the coach can deliberately choose the right student.
        if (!selectedStudentId && items[0] && tab !== 'audit') {
          setQuery({ userId: items[0].id });
          return;
        }

        if (selectedStudentId && resolvedStudentId !== selectedStudentId) {
          setQuery({
            userId: resolvedStudentId ?? (tab === 'audit' ? null : items[0]?.id ?? null),
          });
        }
      } catch (error) {
        if (!active) return;
        setStudentsError(error instanceof Error ? error.message : 'Failed to load students.');
      } finally {
        if (active) {
          setStudentsLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [mode, selectedStudentId, setQuery, tab]);

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) ?? null,
    [selectedStudentId, students],
  );

  useEffect(() => {
    const needsProgress = tab === 'progress' || tab === 'audit';
    const activeStudentId = selectedStudent?.id ?? null;

    if (!needsProgress || !activeStudentId) {
      setCoachProgressCourses([]);
      setCoachProgressError(null);
      setCoachProgressLoading(false);
      return;
    }

    let active = true;

    (async () => {
      try {
        setCoachProgressLoading(true);
        setCoachProgressError(null);
        const progressCourses = await fetchStudentProgressCourses(supabase, activeStudentId);
        if (!active) return;

        setCoachProgressCourses(progressCourses);

        if (tab !== 'progress') return;

        if (!progressCourses.length) {
          if (selectedCourseId != null) {
            setQuery({ courseId: null });
          }
          return;
        }

        if (!selectedCourseId || !progressCourses.some((course) => course.id === selectedCourseId)) {
          setQuery({ courseId: progressCourses[0].id });
        }
      } catch (error) {
        if (!active) return;
        setCoachProgressError(
          error instanceof Error ? error.message : 'Failed to load course progress.',
        );
      } finally {
        if (active) {
          setCoachProgressLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [mode, selectedCourseId, selectedStudent, setQuery, tab]);

  return {
    coachProgressCourses,
    coachProgressError,
    coachProgressLoading,
    selectedStudent,
    students,
    studentsError,
    studentsLoading,
  };
}
