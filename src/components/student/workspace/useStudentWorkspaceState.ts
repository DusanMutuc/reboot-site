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
  error?: string;
};

type UseStudentWorkspaceStateArgs = {
  mode: StudentWorkspaceMode;
  tab: StudentWorkspaceTab;
  selectedStudentId: string | null;
  selectedCourseId: number | null;
  setQuery: (patch: WorkspaceQueryPatch) => void;
};

async function loadAdminStudents(): Promise<StudentOption[]> {
  const response = await fetch('/api/admin/list-users', { cache: 'no-store' });
  const body = (await response.json()) as { items?: AdminListUserRow[]; error?: string };

  if (!response.ok) {
    throw new Error(body.error || 'Failed to load students.');
  }

  return (body.items ?? [])
    .map((item) => ({
      id: item.id,
      full_name: item.name?.trim() || item.email?.trim() || 'Unnamed student',
      email: item.email?.trim() || null,
      is_legend: !!item.is_legend,
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

async function loadCoachStudents(): Promise<StudentOption[]> {
  const response = await fetch('/api/coach/workspace-students', { cache: 'no-store' });
  const body = (await response.json()) as CoachWorkspaceStudentsResponse;

  if (!response.ok) {
    throw new Error(body.error || 'Failed to load students.');
  }

  return (body.items ?? [])
    .map((row) => ({
      id: row.id,
      full_name: row.full_name || row.email || 'Unnamed student',
      email: row.email ?? null,
      is_legend: !!row.is_legend,
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
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
        const items = mode === 'admin' ? await loadAdminStudents() : await loadCoachStudents();
        if (!active) return;

        setStudents(items);

        if (!selectedStudentId && items[0]) {
          setQuery({ userId: items[0].id });
          return;
        }

        if (selectedStudentId && !items.some((item) => item.id === selectedStudentId)) {
          setQuery({ userId: items[0]?.id ?? null });
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
  }, [mode, selectedStudentId, setQuery]);

  useEffect(() => {
    if (tab !== 'progress' || !selectedStudentId) {
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
        const progressCourses = await fetchStudentProgressCourses(supabase, selectedStudentId);
        if (!active) return;

        setCoachProgressCourses(progressCourses);

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
  }, [mode, selectedCourseId, selectedStudentId, setQuery, tab]);

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) ?? null,
    [selectedStudentId, students],
  );

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
