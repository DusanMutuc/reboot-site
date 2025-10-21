'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Avatar,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Container,
  IconButton,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { supabase } from '@/lib/supabaseClient'; // <-- add this

// ----- Storage helpers -----
const BUCKET = 'course-heroes'; // change if your bucket name is different

function pathToPublicUrl(path?: string | null) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path; // already a URL
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path, {
    transform: { width: 1200, quality: 80 },
  });
  return data.publicUrl ?? null;
}

type CourseSummary = {
  id: number;
  title: string | null;
  slug: string | null;
  description: string | null;
  hero_image: string | null; // stores storage path OR full URL
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
        <Skeleton variant="circular" width={56} height={56} sx={{ mt: -4 }} />
        <Skeleton variant="text" sx={{ fontSize: '1.25rem', mt: 2 }} />
        <Skeleton variant="text" />
        <Skeleton variant="rectangular" height={8} sx={{ mt: 1.5, borderRadius: 999 }} />
        <Skeleton variant="rectangular" height={40} sx={{ mt: 2, borderRadius: 2 }} />
      </Box>
    </Card>
  );
}

type CourseCardProps = {
  course: CourseSummary;
};

function CourseCard({ course }: CourseCardProps) {
  const slug = course.slug ?? '';
  const imageUrl = useMemo(() => pathToPublicUrl(course.hero_image), [course.hero_image]);

  // Optional progress support (0–100). If you don’t have it yet, leave as 0.
  const progress =
    typeof (course.metadata as any)?.progressPct === 'number'
      ? Math.max(0, Math.min(100, (course.metadata as any).progressPct))
      : 0;

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
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: 6,
        },
      }}
    >
      <CardActionArea
        LinkComponent={Link}
        href={`/courses/${slug}`}
        sx={{ alignItems: 'stretch' }}
        aria-label={`Open course ${course.title ?? 'Untitled'}`}
      >
        {/* Hero image (fixed 16:9) */}
        <Box sx={{ position: 'relative', width: '100%', aspectRatio: '16 / 9' }}>
          {imageUrl ? (
            <Image
              src={imageUrl}
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

        <CardContent sx={{ display: 'grid', gap: 2.25 }}>
          <Avatar
            variant="rounded"
            sx={{
              width: 56,
              height: 56,
              bgcolor: 'success.main',
              color: 'common.white',
              boxShadow: 2,
              mt: -4,
            }}
          >
            {/* optional icon */}
          </Avatar>

          <Typography variant="h6" sx={{ fontWeight: 700, ...clampLines(2) }}>
            {course.title ?? 'Untitled course'}
          </Typography>

          {course.description && (
            <Typography variant="body2" color="text.secondary" sx={clampLines(2)}>
              {course.description}
            </Typography>
          )}

          {/* Progress */}
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
                sx={{
                  height: '100%',
                  width: `${progress}%`,
                  background: (theme) =>
                    `linear-gradient(90deg, ${theme.palette.success.main}, ${theme.palette.success.dark})`,
                  transition: 'width .35s ease',
                }}
              />
            </Box>
          </Stack>

          <Button
            variant="contained"
            fullWidth
            disableElevation
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: 2,
              py: 1.25,
            }}
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

        // Map storage paths to public URLs here (so CourseCard is simpler)
        const coursesWithUrls = (data.courses ?? []).map((c) => ({
          ...c,
          hero_image: pathToPublicUrl(c.hero_image),
        }));

        setState({ status: 'ready', courses: coursesWithUrls });
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

    if (state.courses.length === 0) {
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
        {state.courses.map((course) => {
          if (!course.slug) return null;
          return <CourseCard key={course.id} course={course} />;
        })}
      </Box>
    );
  }, [state]);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(to bottom right, #f8f9fa 0%, #e9f5f2 100%)',
      }}
    >
      {/* Header */}
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
            <IconButton LinkComponent={Link} href="/dashboard" aria-label="Back to Home" size="medium">
              <ArrowBackIcon />
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
