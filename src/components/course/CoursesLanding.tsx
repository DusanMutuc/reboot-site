'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Container,
  Skeleton,
  Stack,
  Typography,
  IconButton,
} from '@mui/material';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import { supabase } from '@/lib/supabaseClient';

type CourseSummary = {
  id: number;
  title: string | null;
  slug: string | null;
  description: string | null;
  hero_image: string | null;
  icon: string | null;
  objectives: string | null;
  metadata: Record<string, unknown> | null;
  sequential_unlock: boolean | null;
};

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; courses: CourseSummary[] };

function clampLines(lines: number) {
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  };
}

function SkeletonCard() {
  return (
    <Card sx={{ borderRadius: 3, border: '1px solid', borderColor: 'grey.200', overflow: 'hidden' }}>
      <Box sx={{ position: 'relative', width: '100%', aspectRatio: '16 / 9' }}>
        <Skeleton variant="rectangular" width="100%" height="100%" />
      </Box>
      <Box sx={{ p: 2.5 }}>
        <Skeleton variant="text" sx={{ fontSize: '1.25rem', mt: 1 }} />
        <Skeleton variant="text" />
        <Skeleton variant="rectangular" height={8} sx={{ mt: 1.5, borderRadius: 999 }} />
        <Skeleton variant="rectangular" height={40} sx={{ mt: 2, borderRadius: 2 }} />
      </Box>
    </Card>
  );
}

function resolveHeroSrc(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) return v;
  const { data } = supabase.storage.from('course-heroes').getPublicUrl(v);
  return data?.publicUrl ?? null;
}

type CourseCardProps = {
  course: CourseSummary;
  progressPct?: number; // 0–100
};

function CourseCard({ course, progressPct }: CourseCardProps) {
  const slug = course.slug ?? '';
  const heroSrc = resolveHeroSrc(course.hero_image);
  const progress = typeof progressPct === 'number' ? Math.max(0, Math.min(100, progressPct)) : 0;

  return (
    <Card
      elevation={0}
      sx={{
        height: '100%',
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'grey.200',
        bgcolor: 'background.paper',
        overflow: 'hidden',
        transition: 'transform .25s ease, box-shadow .25s ease',
        '&:hover': { transform: 'translateY(-4px)', boxShadow: 6 },
      }}
    >
      <CardActionArea
        LinkComponent={Link}
        href={`/courses/${slug}`}
        sx={{ alignItems: 'stretch' }}
        aria-label={`Open course ${course.title ?? 'Untitled'}`}
      >
        <Box sx={{ position: 'relative', width: '100%', aspectRatio: '16 / 9' }}>
          {heroSrc ? (
            <Image
              src={heroSrc}
              alt=""
              fill
              sizes="(max-width: 600px) 100vw, (max-width: 1200px) 50vw, 33vw"
              style={{ objectFit: 'cover' }}
            />
          ) : (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              }}
            />
          )}
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,.22), rgba(0,0,0,0))',
            }}
          />
        </Box>

        <CardContent sx={{ display: 'grid', gap: 1.75 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, ...clampLines(2) }}>
            {course.title ?? 'Untitled course'}
          </Typography>

          {course.description && (
            <Typography variant="body2" color="text.secondary" sx={clampLines(2)}>
              {course.description}
            </Typography>
          )}

          <Stack spacing={0.75}>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: 0.6 }}>
                Progress
              </Typography>
              <Typography variant="caption" fontWeight={700}>
                {progress}%
              </Typography>
            </Stack>
            <Box sx={{ height: 8, borderRadius: 999, bgcolor: 'grey.100', overflow: 'hidden' }}>
              <Box
                sx={(theme) => ({
                  height: '100%',
                  width: `${progress}%`,
                  background: `linear-gradient(90deg, ${theme.palette.success.main}, ${theme.palette.success.dark})`,
                  transition: 'width .35s ease',
                })}
              />
            </Box>
          </Stack>

          <Button
            variant="contained"
            fullWidth
            disableElevation
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, py: 1.25 }}
          >
            {progress > 0 ? 'Continue' : 'Start'}
          </Button>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export default function CoursesLanding() {
  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [progressByCourse, setProgressByCourse] = useState<Record<number, number>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/courses');
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? 'Failed to load courses');
        }
        const data = (await res.json()) as { courses: CourseSummary[] };
        if (!active) return;
        setState({ status: 'ready', courses: data.courses ?? [] });
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'Failed to load courses';
        setState({ status: 'error', message });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (state.status !== 'ready' || state.courses.length === 0) return;
    let cancelled = false;

    (async () => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes?.user) return;
      const userId = userRes.user.id;

      const entries = await Promise.all(
        state.courses.map(async (c) => {
          const { data, error } = await supabase.rpc('get_user_course_progress', {
            _user_id: userId,
            _course_id: c.id,
          });
          if (error) return [c.id, 0] as const;
          const row = Array.isArray(data) ? data[0] : data;
          const pct = row?.progress ? Math.round(row.progress * 100) : 0;
          return [c.id, pct] as const;
        })
      );

      if (!cancelled) {
        setProgressByCourse(Object.fromEntries(entries));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state]);

  const content = useMemo(() => {
    if (state.status === 'loading') {
      return (
        <Box
          sx={{
            display: 'grid',
            gap: 3,
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, minmax(0, 1fr))',
              lg: 'repeat(3, minmax(0, 1fr))',
            },
            alignItems: 'stretch',
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </Box>
      );
    }

    if (state.status === 'error') {
      return (
        <Stack alignItems="center" spacing={2} sx={{ py: 10 }}>
          <Typography variant="h6">We couldn’t load your courses.</Typography>
          <Typography color="text.secondary">{state.message}</Typography>
        </Stack>
      );
    }

    if (state.status === 'ready' && state.courses.length === 0) {
      return (
        <Stack alignItems="center" spacing={2} sx={{ py: 10 }}>
          <Typography variant="h6">No courses available yet</Typography>
          <Typography color="text.secondary" align="center">
            Check back soon—new learning content will appear here once it’s published for your account.
          </Typography>
        </Stack>
      );
    }

    return (
      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, minmax(0, 1fr))',
            lg: 'repeat(3, minmax(0, 1fr))',
          },
          alignItems: 'stretch',
        }}
      >
        {state.status === 'ready' &&
          state.courses.map((course) => {
            if (!course.slug) return null;
            const pct = progressByCourse[course.id] ?? 0;
            return <CourseCard key={course.id} course={course} progressPct={pct} />;
          })}
      </Box>
    );
  }, [state, progressByCourse]);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(to bottom right, #f8f9fa 0%, #e9f5f2 100%)',
      }}
    >
      {/* Sticky header with fixed /resources back link */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          backdropFilter: 'saturate(180%) blur(8px)',
          backgroundColor: 'rgba(255,255,255,0.75)',
          borderBottom: '1px solid',
          borderColor: 'grey.100',
        }}
      >
        <Container maxWidth="lg" sx={{ py: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <IconButton
              LinkComponent={Link}
              href="/resources"
              aria-label="Back to Resources"
              size="medium"
            >
              <ArrowBackIosNewIcon />
            </IconButton>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Courses
            </Typography>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 8 }}>
        {content}
      </Container>
    </Box>
  );
}
