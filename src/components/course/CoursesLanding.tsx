'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Avatar,
  Box,
  Card,
  CardActionArea,
  CardContent,
  CardMedia,
  CircularProgress,
  Container,
  Stack,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Unstable_Grid2';
import MenuBookIcon from '@mui/icons-material/MenuBook';

import TopNav from '@/components/topNav';

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

const CARD_MEDIA_HEIGHT = 180;

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

  const content = useMemo(() => {
    if (state.status === 'loading') {
      return (
        <Stack alignItems="center" spacing={2} sx={{ py: 10 }}>
          <CircularProgress />
          <Typography color="text.secondary">Loading courses…</Typography>
        </Stack>
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
      <Grid container spacing={3}>
        {state.courses.map((course) => {
          const slug = course.slug ?? undefined;
          if (!slug) return null;

          return (
            <Grid key={course.id} xs={12} sm={6} lg={4}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardActionArea component={Link} href={`/courses/${slug}`} sx={{ flexGrow: 1 }}>
                  {course.hero_image ? (
                    <CardMedia
                      component="div"
                      sx={{ height: CARD_MEDIA_HEIGHT, backgroundSize: 'cover', backgroundPosition: 'center' }}
                      image={course.hero_image}
                    />
                  ) : (
                    <Box
                      sx={{
                        height: CARD_MEDIA_HEIGHT,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: 'grey.100',
                      }}
                    >
                      <Avatar sx={{ bgcolor: 'primary.main', width: 64, height: 64 }}>
                        <MenuBookIcon />
                      </Avatar>
                    </Box>
                  )}

                  <CardContent>
                    <Stack spacing={1}>
                      <Typography variant="h6">{course.title ?? 'Untitled course'}</Typography>
                      {course.description ? (
                        <Typography color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {course.description}
                        </Typography>
                      ) : null}
                    </Stack>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          );
        })}
      </Grid>
    );
  }, [state]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'grey.50' }}>
      <TopNav />
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h3" sx={{ fontWeight: 700 }}>
              Courses
            </Typography>
            <Typography color="text.secondary">
              Dive into your coaching curriculum. Select a course to view its lessons and track your progress.
            </Typography>
          </Box>

          {content}
        </Stack>
      </Container>
    </Box>
  );
}
