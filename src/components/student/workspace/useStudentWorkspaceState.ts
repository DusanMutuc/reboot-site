'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { fetchStudentOverviewData } from '@/lib/studentOverview';
import type {
  CoachProgressCourse,
  CourseLite,
  StudentOption,
  StudentWorkspaceMode,
  StudentWorkspaceTab,
  WorkspaceQueryPatch,
} from './types';

type CoachRosterRow = {
  user_id: string;
  full_name: string;
  email?: string | null;
};

type AdminListUserRow = {
  id: string;
  name?: string | null;
  email?: string | null;
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
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

async function loadCoachStudents(): Promise<StudentOption[]> {
  const { data, error } = await supabase.rpc('get_my_users_with_status');
  if (error) {
    throw error;
  }

  return ((data ?? []) as CoachRosterRow[])
    .map((row) => ({
      id: row.user_id,
      full_name: row.full_name || row.email || 'Unnamed student',
      email: row.email ?? null,
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

async function loadCourses(): Promise<CourseLite[]> {
  const { data, error } = await supabase
    .from('content_nodes')
    .select('id,title')
    .eq('node_type', 'course')
    .order('title', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as CourseLite[];
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

  const [courses, setCourses] = useState<CourseLite[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [coursesError, setCoursesError] = useState<string | null>(null);

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
    if (tab !== 'progress' || mode !== 'admin') return;

    let active = true;

    (async () => {
      try {
        setCoursesLoading(true);
        setCoursesError(null);
        const items = await loadCourses();
        if (!active) return;

        setCourses(items);

        if (!selectedCourseId && items[0]) {
          setQuery({ courseId: items[0].id });
          return;
        }

        if (selectedCourseId && !items.some((item) => item.id === selectedCourseId)) {
          setQuery({ courseId: items[0]?.id ?? null });
        }
      } catch (error) {
        if (!active) return;
        setCoursesError(error instanceof Error ? error.message : 'Failed to load courses.');
      } finally {
        if (active) {
          setCoursesLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [mode, selectedCourseId, setQuery, tab]);

  useEffect(() => {
    if (tab !== 'progress' || mode !== 'coach' || !selectedStudentId) {
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
        const data = await fetchStudentOverviewData(supabase, selectedStudentId);
        if (!active) return;

        setCoachProgressCourses(data.courses);

        if (!data.courses.length) {
          if (selectedCourseId != null) {
            setQuery({ courseId: null });
          }
          return;
        }

        if (!selectedCourseId || !data.courses.some((course) => course.id === selectedCourseId)) {
          setQuery({ courseId: data.courses[0].id });
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
    courses,
    coursesError,
    coursesLoading,
    selectedStudent,
    students,
    studentsError,
    studentsLoading,
  };
}
